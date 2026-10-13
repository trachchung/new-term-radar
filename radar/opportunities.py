"""Evidence-aware SEO opportunity queue. Offline; never invents volume or SERP."""
from __future__ import annotations
import argparse
import json
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit
from . import intent, screening

STAGES = {"manual-review": 0, "needs-evidence": 1, "hypothesis": 2}

def clean(value):
    return " ".join(str(value or "").split())

def key(value):
    return clean(value).casefold()

def items(value):
    return value if isinstance(value, list) else []

def base(keyword, kind="generic"):
    return {"keyword": clean(keyword), "kind": kind, "origins": [], "personas": [],
            "scenes": [], "actions": [], "constraints": [], "pains": [], "signals": [], "evidence_links": []}

FIELDS = ("origins", "personas", "scenes", "actions", "constraints", "pains", "signals", "evidence_links")

def merge(queue, row):
    k = key(row.get("keyword"))
    if not k:
        return
    if k not in queue:
        queue[k] = base(row["keyword"], row.get("kind", "generic"))
    saved = queue[k]
    if row.get("kind") == "generic":
        saved["kind"] = "generic"
    for name in FIELDS:
        for value in items(row.get(name)):
            value = clean(value)
            if value and value not in saved[name]:
                saved[name].append(value)

def persona_rows(data):
    for person in items(data.get("personas")):
        if not isinstance(person, dict):
            continue
        name = clean(person.get("name") or person.get("id"))
        for scene in items(person.get("scenes")):
            if not isinstance(scene, dict):
                continue
            for action in items(scene.get("actions")):
                if not isinstance(action, dict):
                    continue
                for phrase in items(action.get("keywords")):
                    if clean(phrase):
                        row = base(phrase)
                        row.update(origins=["persona-hypothesis"], personas=[name],
                                   scenes=[scene.get("name", "")], actions=[action.get("name", "")],
                                   constraints=items(action.get("constraints")),
                                   pains=[action.get("pain", "")],
                                   evidence_links=items(action.get("evidence_links")))
                        yield row

def radar_rows(data):
    for item in items(data.get("leads")):
        if not isinstance(item, dict) or not clean(item.get("term")):
            continue
        row = base(item["term"], "brand")
        row.update(origins=["new-term-radar"], signals=items(item.get("kinds")))
        yield row
    keywords = data.get("keywords") or {}
    for item in items(keywords.get("rows")):
        if not isinstance(item, dict):
            continue
        phrase = clean(item.get("phrase") or item.get("term"))
        if phrase:
            row = base(phrase, "brand" if item.get("kind") == "name" else "generic")
            row.update(origins=["radar-keyword-table"], signals=[item.get("decision", "")])
            yield row

def number(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)) and 0 <= value < float("inf"):
        return float(value)
    return None

def merge_research(data, sources):
    """Merge external research by keyword. Explicit human-entered data takes priority."""
    result = dict(data)
    reviews = {}
    for item in items(data.get("reviews")):
        if isinstance(item, dict) and key(item.get("keyword")):
            reviews[key(item["keyword"])] = dict(item)
    for source in sources:
        for extra in items(source.get("reviews")):
            if not isinstance(extra, dict) or not key(extra.get("keyword")):
                continue
            k = key(extra["keyword"])
            original = reviews.setdefault(k, {"keyword": extra["keyword"]})
            links = {key(e.get("url")) for e in items(original.get("evidence")) if isinstance(e, dict)}
            for entry in items(extra.get("evidence")):
                if isinstance(entry, dict) and key(entry.get("url")) and key(entry["url"]) not in links:
                    original.setdefault("evidence", []).append(entry)
                    links.add(key(entry["url"]))
            for field, value in extra.items():
                if field in ("keyword", "evidence"):
                    continue
                if (original.get(field) is None or original.get(field) == "" or original.get(field) == {}) and value is not None:
                    original[field] = value
    result["reviews"] = list(reviews.values())
    return result

def evaluate(row, review):
    evidence, hosts = [], set()
    for item in items(review.get("evidence")):
        if not isinstance(item, dict):
            continue
        url = clean(item.get("url"))
        parsed = urlsplit(url)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            continue
        hosts.add(parsed.hostname.lower().removeprefix("www."))
        evidence.append({"type": clean(item.get("type")) or "other", "url": url,
                         "note": clean(item.get("note")), "published_at": clean(item.get("published_at")),
                         "collected_at": clean(item.get("collected_at")), "source": clean(item.get("source")),
                         "attribution": clean(item.get("attribution")), "verified": False})
    vol = number(review.get("monthly_searches"))
    source = clean(review.get("monthly_searches_source"))
    has_volume = vol is not None and bool(source)
    serp = review.get("serp") if isinstance(review.get("serp"), dict) else {}
    exact, major = number(serp.get("exact_tool_results")), number(serp.get("major_site_results"))
    has_serp = bool(clean(serp.get("reviewed_at"))) and exact is not None and major is not None \
        and exact + major <= 10
    build = number(review.get("estimated_build_days"))
    money = clean(review.get("monetization"))
    site = clean(review.get("existing_site"))
    score = min(30, 15 * len(hosts))
    if has_volume:
        score += 20 if vol >= 1000 else 12 if vol >= 100 else 6 if vol > 0 else 0
    if has_serp:
        score += max(0, 20 - 2 * exact - major)
    if build is not None:
        score += 10 if build <= 2 else 5 if build <= 7 else 0
    score += 10 if money else 0
    score += 10 if site else 0
    if len(hosts) >= 2 and has_volume and has_serp and build is not None and money:
        stage = "manual-review"
    elif evidence or has_volume or has_serp:
        stage = "needs-evidence"
    else:
        stage = "hypothesis"
    return {**row, "intent_signature": intent.signature(row["keyword"]), "stage": stage,
            "keyword_idea_seed": clean(review.get("keyword_idea_seed")) or None,
            "keyword_idea_source": clean(review.get("keyword_idea_source")) or None,
            "provider_keyword_difficulty": number(review.get("provider_keyword_difficulty")),
            "provider_kd_note": clean(review.get("provider_kd_note")) or None, "rubric_score": min(100, score), "evidence": evidence,
            "independent_evidence_sites": sorted(hosts),
            "monthly_searches": int(vol) if has_volume else None,
            "monthly_searches_source": source if has_volume else None,
            "serp": {"reviewed_at": clean(serp.get("reviewed_at")), "exact_tool_results": int(exact),
                     "major_site_results": int(major)} if has_serp else None,
            "serp_snapshot": review.get("serp_snapshot") if isinstance(review.get("serp_snapshot"), dict) else None,
            "ads_cpc_usd": number(review.get("ads_cpc_usd")),
            "ads_competition_index": number(review.get("ads_competition_index")),
            "estimated_build_days": build, "monetization": money, "existing_site": site,
            "next_action": {"hypothesis": "Collect real demand evidence",
                            "needs-evidence": "Complete demand, volume and SERP checks",
                            "manual-review": "Human decision: do not auto-publish"}[stage],
            "warning": "All evidence and volume figures are user-supplied, not independently verified"}

def build(data, radar=None):
    if not isinstance(data, dict) or not isinstance(data.get("personas", []), list) \
            or not isinstance(data.get("reviews", []), list):
        raise ValueError("Input must contain personas and reviews arrays")
    queue = {}
    for row in [*persona_rows(data), *radar_rows(radar or {})]:
        merge(queue, row)
    reviews = {}
    for review in data.get("reviews", []):
        if not isinstance(review, dict):
            continue
        k = key(review.get("keyword"))
        if k:
            reviews[k] = review
            if k not in queue:
                row = base(review["keyword"])
                row["origins"] = ["provider-keyword-suggestion" if review.get("keyword_idea_source") else "manual-entry"]
                merge(queue, row)
    rows = []
    for k, row in queue.items():
        review = dict(reviews.get(k, {}))
        # Problem evidence backs the TASK, not proof that the proposed keyword is searched.
        if row.get("evidence_links"):
            review["evidence"] = items(review.get("evidence")) + [
                {"url": u, "type": "journey-task-source", "source": "AI-task-hypothesis",
                 "note": "Original comment supports the task, not necessarily the keyword wording."}
                for u in row["evidence_links"]]
        rows.append(evaluate(row, review))
    for r in rows:
        r["screening"] = screening.analyze(r)
    rows.sort(key=lambda r: (STAGES[r["stage"]], -r["rubric_score"], key(r["keyword"])))
    return {"generated_at": date.today().isoformat(), "count": len(rows),
            "suggested_intent_groups": intent.suggest(rows),
            "stage_counts": {stage: sum(r["stage"] == stage for r in rows) for stage in STAGES},
            "notice": "Scores only prioritize manual research; no automatic keyword validation.",
            "opportunities": rows}

def markdown(report):
    lines = ["# SEO Opportunity Radar / SEO 机会队列", "",
             "> AI 生成的词仅是假设。搜索量、SERP 和用户证据尚未由本工具独立核验。评分不代表排名成功率。",
             "", f"共 {report['count']} 条；人工复核 {report['stage_counts']['manual-review']}；"
                 f"待补证据 {report['stage_counts']['needs-evidence']}；假设 {report['stage_counts']['hypothesis']}", "",
             "| Keyword | Stage | Rubric | Sources | Monthly volume* | Existing site | Next step |",
             "|---|---|---:|---|---:|---|---|"]
    def cell(s):
        return clean(s).replace("|", "/")
    for row in report["opportunities"]:
        lines.append("| " + " | ".join([
            cell(row["keyword"]), row["stage"], str(row["rubric_score"]),
            cell(", ".join(row["origins"])), str(row["monthly_searches"]) if row["monthly_searches"] is not None else "unknown",
            cell(row["existing_site"]) or "-", cell(row["next_action"])]) + " |")
    return "\n".join(lines + ["", "* Volume only appears when a declared source is provided; signals alone are not demand.", "",
                              "Persona, task, evidence, and SERP details are available in the companion JSON file.", ""])

def command(args):
    try:
        data = json.loads(Path(args.input).read_text(encoding="utf-8"))
        radar = json.loads(Path(args.radar_json).read_text(encoding="utf-8")) if args.radar_json else {}
        sources = [json.loads(Path(p).read_text(encoding="utf-8")) for p in (getattr(args, "research_json", None) or [])]
        result = build(merge_research(data, sources), radar)
    except (OSError, ValueError, TypeError) as exc:
        raise SystemExit(f"Opportunity queue failed: {exc}") from exc
    text = markdown(result)
    if args.out:
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text, encoding="utf-8")
        out.with_suffix(".json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(text)
    return 0

def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input", default="opportunities.example.json")
    p.add_argument("--radar-json", default=None)
    p.add_argument("--research-json", action="append", help="HN research or SEO verification JSON; repeatable")
    p.add_argument("--out", default="opportunities.md")
    return command(p.parse_args(argv))

if __name__ == "__main__":
    raise SystemExit(main())
