"""Turn dated user-problem quotes into persona/task/keyword HYPOTHESES with citations.

AI is opt-in and billed via existing AISA_API_KEY. Every generated action must cite a
real evidence URL from the input; fabricated references are rejected, not repaired.
"""
from __future__ import annotations
import argparse
import json
import re
from pathlib import Path

from . import aisa

SYSTEM = """You are an evidence-grounded product researcher for small SEO-driven web tools.
Given a target keyword and verbatim public user comments, identify a specific person,
scene, concrete action, pain and constraint supported by those comments. The result
is ONLY a hypothesis, not proof of Google search volume or an exact user identity.
Never infer demographics or private details about a commenter. Use a role such as
'independent online seller' only when supported by explicit comments.
Return JSON only: {"role":"...", "scene":"...", "action":"...",
"pain":"...", "constraints":["..."], "keywords":["...", "..."], "evidence_ids":["e0"]}.
Every evidence ID must be one of the IDs provided. Use 1-3 plausible search queries,
not keyword stuffing. If no concrete task is evidenced, return {"skip": true}.
Do not claim actual keyword volume, rankings, conversions or revenue.
"""


def parse_reply(reply, allowed):
    found = re.search(r"\{.*\}", reply or "", re.S)
    if not found:
        return None
    try:
        item = json.loads(found.group())
    except (ValueError, TypeError):
        return None
    if not isinstance(item, dict) or item.get("skip"):
        return None
    refs = [r for r in item.get("evidence_ids", []) if isinstance(r, str) and r in allowed] if isinstance(item.get("evidence_ids"), list) else []
    if not refs or not item.get("action") or not item.get("pain"):
        return None
    keys = []
    for phrase in (item.get("keywords") if isinstance(item.get("keywords"), list) else []):
        p = " ".join(str(phrase).lower().split())
        if 2 <= len(p.split()) <= 7 and len(p) <= 80 and p not in keys:
            keys.append(p)
    if not keys:
        return None
    def sanitize(value, limit=140):
        return " ".join(str(value or "").split())[:limit]
    return {"role": sanitize(item.get("role") or "User with this task"),
            "scene": sanitize(item.get("scene") or "Completing task"),
            "action": sanitize(item["action"]),
            "pain": sanitize(item["pain"], 300),
            "constraints": [sanitize(x, 100) for x in item.get("constraints", []) if isinstance(x, str)][:5],
            "keywords": keys[:3], "evidence_ids": refs[:6]}


def generate(data, model="gpt-4.1-mini", per_day=5, chat=None):
    if not isinstance(data, dict) or not isinstance(data.get("reviews", []), list):
        raise ValueError("Expected research JSON with reviews array")
    chat = chat or aisa.chat
    personas, records, errors = [], [], []
    for index, row in enumerate(data["reviews"][:per_day]):
        if not isinstance(row, dict):
            continue
        kw = str(row.get("keyword") or "").strip()
        raw = [e for e in (row.get("evidence") or []) if isinstance(e, dict) and e.get("url") and e.get("note")]
        if not kw or not raw:
            continue
        allowed = {f"e{i}": e["url"] for i, e in enumerate(raw[:8])}
        prompt = json.dumps({"candidate": kw, "comments": [
            {"id": i, "text": raw[int(i[1:])]["note"][:400], "url": url}
            for i, url in allowed.items()]}, ensure_ascii=False)
        try:
            result = parse_reply(chat(model, SYSTEM, prompt, max_tokens=650), allowed)
        except (ValueError, TypeError, aisa.AisaError, OSError) as exc:
            errors.append({"keyword": kw, "error": str(exc)[:150]})
            continue
        if not result:
            continue
        links = [allowed[x] for x in result["evidence_ids"]]
        personas.append({"id": f"journey-{index}", "name": result["role"],
                         "scenes": [{"name": result["scene"], "actions": [
                             {"name": result["action"], "pain": result["pain"],
                              "constraints": result["constraints"], "keywords": result["keywords"],
                              "evidence_links": links}]}]})
        records.append({"target": kw, "evidence_links": links, "hypothesis_keywords": result["keywords"]})
    return {"_notice": "AI-generated hypotheses linked to real quotes, not verified demand or ranking opportunities.",
            "personas": personas, "reviews": [], "journey_sources": records, "errors": errors}


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input", default="research.hn.json")
    p.add_argument("--out", default="journeys.json")
    p.add_argument("--model", default="gpt-4.1-mini")
    p.add_argument("--limit", type=int, default=5)
    p.add_argument("--ai", action="store_true", help="Explicitly enable paid AIsa chat calls")
    p.add_argument("--fixture", help="Offline model replies keyed by target keyword")
    args = p.parse_args(argv)
    if not 1 <= args.limit <= 20:
        p.error("--limit must be within 1..20")
    if not args.ai and not args.fixture:
        p.error("Choose --ai for AIsa model calls, or --fixture for offline tests")
    try:
        data = json.loads(Path(args.input).read_text(encoding="utf-8"))
        if args.fixture:
            answers = json.loads(Path(args.fixture).read_text(encoding="utf-8"))
            chat = lambda model, system, user, max_tokens=650: answers.get(json.loads(user)["candidate"], '{"skip":true}')
        else:
            chat = None
        result = generate(data, args.model, args.limit, chat)
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    except (ValueError, OSError, TypeError) as exc:
        p.error(str(exc))
    print(f"Journeys: {len(result['personas'])} grounded hypotheses; "
          f"errors={len(result['errors'])}; saved {args.out}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
