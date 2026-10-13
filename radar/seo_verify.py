"""Opt-in, billed DataForSEO keyword volume and live Google top-10 SERP snapshots.

This does not automatically infer keyword difficulty or label search results as weak.
No network is used unless --paid is explicitly provided; --fixture is free/offline.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API = "https://api.dataforseo.com/v3/"
VOL = "keywords_data/google_ads/search_volume/live"
SERP = "serp/google/organic/live/advanced"
MAX_KEYWORDS = 20


def keywords(payload, limit):
    if not isinstance(payload, dict):
        raise ValueError("Input must be an object")
    if isinstance(payload.get("opportunities"), list):
        source = [row.get("keyword") for row in payload["opportunities"] if isinstance(row, dict)]
    elif isinstance(payload.get("keywords"), list):
        source = payload["keywords"]
    else:
        raise ValueError("Expected an opportunities array or keywords array")
    out = []
    for s in source:
        kw = " ".join(str(s or "").split())
        if kw and kw.casefold() not in [x.casefold() for x in out] and len(kw) <= 100:
            out.append(kw)
        if len(out) >= limit:
            break
    return out


def request(path, body):
    login = os.environ.get("DATAFORSEO_LOGIN", "")
    password = os.environ.get("DATAFORSEO_PASSWORD", "")
    if not login or not password:
        raise ValueError("Set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD in environment")
    auth = base64.b64encode(f"{login}:{password}".encode()).decode()
    req = urllib.request.Request(API + path, json.dumps([body]).encode("utf-8"), headers={
        "Authorization": f"Basic {auth}", "Content-Type": "application/json",
        "User-Agent": "new-keywords-radar/2.0"}, method="POST")
    with urllib.request.urlopen(req, timeout=120) as response:
        return json.load(response)


def task_result(response):
    if response.get("status_code") != 20000:
        raise ValueError(f"DataForSEO response status {response.get('status_code')}: {response.get('status_message')}")
    tasks = response.get("tasks") or []
    if not tasks or tasks[0].get("status_code") != 20000:
        raise ValueError("DataForSEO task failed: " + str((tasks[0] if tasks else {}).get("status_message")))
    return tasks[0].get("result") or []


def volumes(response):
    results = task_result(response)
    rows = (results[0].get("items") or []) if results else []
    out = {}
    for item in rows:
        if not isinstance(item, dict):
            continue
        name = str(item.get("keyword", "")).casefold().strip()
        volume = item.get("search_volume")
        # Missing data is not zero. Google Ads competitive index is ADVERTISER competition, not SEO KD.
        if name and isinstance(volume, (int, float)) and not isinstance(volume, bool) and volume >= 0:
            out[name] = {"volume": int(volume), "cpc_usd": item.get("cpc"),
                         "ads_competition_index": item.get("competition_index")}
    return out


def snapshot(response):
    results = task_result(response)
    if not results:
        raise ValueError("DataForSEO SERP has no result")
    result = results[0]
    items = result.get("items") or []
    organic = [r for r in items if isinstance(r, dict) and r.get("type") == "organic" and isinstance(r.get("rank_group"), int)
               and 1 <= r["rank_group"] <= 10]
    organic.sort(key=lambda r: r["rank_group"])
    return {"reviewed_at": datetime.now(timezone.utc).date().isoformat(),
            "location_code": result.get("location_code"), "language_code": result.get("language_code"),
            "provider": "dataforseo-google-organic-live-advanced",
            "organic": [{"rank_group": r["rank_group"], "rank_absolute": r.get("rank_absolute"),
                         "url": r.get("url"), "domain": r.get("domain"), "title": r.get("title")}
                        for r in organic],
            "features": sorted({str(r.get("type")) for r in items if isinstance(r, dict) and r.get("type") not in ("organic", None)}),
            "interpretation": "Unclassified SERP snapshot. Manually inspect intent and competing tools."}


def verify(names, location=2840, language="en", provider=None):
    provider = provider or request
    today = datetime.now(timezone.utc).date().isoformat()
    out = [{"keyword": name, "evidence": []} for name in names]
    errors = []
    if not names:
        return {"reviews": out, "errors": errors, "charged_api_calls": 0, "location_code": location,
                "language_code": language}
    calls = 0
    try:
        calls += 1
        v = volumes(provider(VOL, {"keywords": names, "location_code": location, "language_code": language}))
        for row in out:
            record = v.get(row["keyword"].casefold())
            if record is not None:
                row.update({"monthly_searches": record["volume"],
                            "monthly_searches_source": f"dataforseo-google-ads-{location}-{language}-{today}",
                            "ads_cpc_usd": record["cpc_usd"],
                            "ads_competition_index": record["ads_competition_index"]})
    except (ValueError, OSError, KeyError, TypeError) as exc:
        errors.append({"stage": "volume", "error": str(exc)[:180]})
    for row in out:
        try:
            calls += 1
            row["serp_snapshot"] = snapshot(provider(SERP, {"keyword": row["keyword"],
                                                           "location_code": location, "language_code": language,
                                                           "depth": 10, "device": "desktop"}))
            # Notice: do not set 'serp' exact_tool_results/major_site_results; requires human classification.
        except (ValueError, OSError, KeyError, TypeError) as exc:
            errors.append({"keyword": row["keyword"], "stage": "serp", "error": str(exc)[:180]})
    return {"reviewed_at": today, "location_code": location, "language_code": language,
            "reviews": out, "errors": errors, "attempted_api_calls": calls,
            "warning": "Search volume is an Ads estimate. SERP data is raw; SEO KD remains unscored."}


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input", default="opportunities.json")
    p.add_argument("--out", default="research.seo.json")
    p.add_argument("--limit", type=int, default=5, help="Maximum paid SERP calls plus one volume call")
    p.add_argument("--location", type=int, default=2840, help="DataForSEO search location (2840=US)")
    p.add_argument("--language", default="en")
    p.add_argument("--paid", action="store_true", help="Explicitly authorize paid API calls")
    p.add_argument("--fixture", help="Offline fixture mapping volume and SERP response; no API calls")
    args = p.parse_args(argv)
    if not 1 <= args.limit <= MAX_KEYWORDS:
        p.error(f"--limit must be 1..{MAX_KEYWORDS}")
    if not args.paid and not args.fixture:
        p.error("No paid calls without --paid; use --fixture for offline testing")
    try:
        payload = json.loads(Path(args.input).read_text(encoding="utf-8"))
        names = keywords(payload, args.limit)
        if args.fixture:
            fixture = json.loads(Path(args.fixture).read_text(encoding="utf-8"))
            def provider(endpoint, body):
                if endpoint == VOL:
                    return fixture["volume"]
                return fixture["serps"][body["keyword"]]
        else:
            provider = request
        result = verify(names, args.location, args.language, provider)
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    except (ValueError, OSError, KeyError) as exc:
        p.error(str(exc))
    print(f"SEO snapshots: {len(result['reviews'])} keywords; "
          f"requests attempted={result.get('attempted_api_calls', 0)}; errors={len(result['errors'])}; "
          f"saved {args.out}. Paid={not bool(args.fixture)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
