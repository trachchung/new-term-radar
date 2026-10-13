"""Collect real public Hacker News discussions against explicitly chosen research queries.

No AI-generated facts: every evidence record points to the original discussion.
HN Algolia search is a research signal, not Google search-demand evidence.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path

BASE = "https://hn.algolia.com/api/v1/search_by_date"
MAX_QUERIES = 20
HITS_PER_QUERY = 50
MAX_PER_KEYWORD = 8


class PlainText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)


def plain(value):
    parser = PlainText()
    parser.feed(str(value or ""))
    return " ".join(html.unescape(" ".join(parser.parts)).split())


def query_url(query, days, now=None):
    now = now or datetime.now(timezone.utc)
    since = int((now - timedelta(days=days)).timestamp())
    params = {"query": query, "tags": "comment", "hitsPerPage": str(HITS_PER_QUERY),
              "numericFilters": f"created_at_i>{since}"}
    return BASE + "?" + urllib.parse.urlencode(params)


def load_hn(query, days):
    request = urllib.request.Request(query_url(query, days),
                                     headers={"User-Agent": "new-keywords-radar/2.0 (public demand research)"})
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)


def parse_hits(answer, keyword, cues=None):
    """Filter dated comment hits; retain exact permalink/quote. No fake persona evidence."""
    if not isinstance(answer, dict):
        return []
    cues = [c.casefold() for c in (cues or []) if isinstance(c, str) and c.strip()]
    found = []
    seen = set()
    for hit in answer.get("hits", []):
        if not isinstance(hit, dict):
            continue
        ident = str(hit.get("objectID") or "")
        date = str(hit.get("created_at") or "")
        quote = plain(hit.get("comment_text"))
        if not ident.isdecimal() or not date or len(quote) < 35:
            continue
        if cues and not any(cue in quote.casefold() for cue in cues):
            continue
        if ident in seen:
            continue
        seen.add(ident)
        found.append({"type": "hacker-news-comment", "url": f"https://news.ycombinator.com/item?id={ident}",
                      "note": quote[:320], "published_at": date,
                      "collected_at": datetime.now(timezone.utc).isoformat(),
                      "source_query": keyword, "source": "hn-algolia-public-api"})
    return found[:MAX_PER_KEYWORD]


def collect(spec, days=30, loader=None):
    if not isinstance(spec, dict) or not isinstance(spec.get("queries"), list):
        raise ValueError("Research input must be an object with queries array")
    queries = spec["queries"]
    if len(queries) > MAX_QUERIES:
        raise ValueError(f"At most {MAX_QUERIES} research queries per run")
    loader = loader or load_hn
    reviews = []
    errors = []
    for obj in queries:
        if not isinstance(obj, dict):
            continue
        keyword = " ".join(str(obj.get("keyword") or "").split())
        query = " ".join(str(obj.get("query") or keyword).split())
        if not keyword or not query or len(query) > 120:
            continue
        try:
            raw = loader(query, days)
            evidence = parse_hits(raw, keyword, obj.get("pain_terms", []))
        except (OSError, ValueError, KeyError, TypeError) as exc:
            errors.append({"keyword": keyword, "error": f"{type(exc).__name__}: {exc}"[:200]})
            continue
        reviews.append({"keyword": keyword, "evidence": evidence})
    return {"collected_at": datetime.now(timezone.utc).isoformat(), "source": "HN Algolia public comments",
            "research_note": "Search matches and complaints are topic signals, not proof of Google search volume.",
            "reviews": reviews, "errors": errors, "query_count": len(queries)}


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input", default="research.example.json")
    p.add_argument("--out", default="research.hn.json")
    p.add_argument("--days", type=int, default=30)
    p.add_argument("--fixture", help="Offline HN API fixture JSON; never makes network calls")
    p.add_argument("--live", action="store_true", help="Explicitly enable HN network requests")
    args = p.parse_args(argv)
    if not 1 <= args.days <= 180:
        p.error("--days must be within 1..180")
    if not args.fixture and not args.live:
        p.error("Choose --live for public API retrieval, or --fixture for offline testing")
    try:
        spec = json.loads(Path(args.input).read_text(encoding="utf-8"))
        if args.fixture:
            fixtures = json.loads(Path(args.fixture).read_text(encoding="utf-8"))
            loader = lambda q, days: fixtures.get(q, {"hits": []})
        else:
            loader = load_hn
        result = collect(spec, args.days, loader)
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    except (ValueError, OSError) as exc:
        p.error(str(exc))
    print(f"HN comments: {sum(len(r['evidence']) for r in result['reviews'])} quotes for "
          f"{len(result['reviews'])} keywords; errors={len(result['errors'])}. Saved {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
