"""Offline HN research tests: no paid APIs, no remote HTTP."""
import json
from datetime import datetime, timezone
from radar import research

def test_query_date_and_tag():
    url = research.query_url("bulk image", 7, datetime(2026, 10, 13, tzinfo=timezone.utc))
    assert "tags=comment" in url and "bulk+image" in url and "numericFilters=" in url

def test_html_quotes_and_pain_filter():
    hits = {"hits": [
        {"objectID": "12", "created_at": "2026-10-10T00:00:00Z",
         "comment_text": "<p>I really need to compress all these product photos because the images are too large.</p>"},
        {"objectID": "13", "created_at": "2026-10-10T00:00:00Z", "comment_text": "This is unrelated release news and is not a complaint."},
        {"objectID": "12", "created_at": "2026-10-10T00:00:00Z",
         "comment_text": "Duplicate of the first comment I need to compress now."}]}
    got = research.parse_hits(hits, "compress", ["compress"])
    assert len(got) == 1
    assert got[0]["url"] == "https://news.ycombinator.com/item?id=12"
    assert "<p>" not in got[0]["note"]

def test_collector_keeps_real_urls_without_volume_claim():
    data = {"queries": [{"keyword": "batch images", "query": "bulk image", "pain_terms": ["need"]}]}
    res = research.collect(data, loader=lambda q, days: {"hits": [
        {"objectID": "42", "created_at": "2026-10-12T01:00:00Z",
         "comment_text": "I need a tool to quickly resize hundreds of product photos for my small online shop."}]})
    assert res["reviews"][0]["evidence"][0]["source"] == "hn-algolia-public-api"
    assert "monthly_searches" not in res["reviews"][0]
    assert res["errors"] == []

def test_bad_query_count():
    try:
        research.collect({"queries": [{}] * 21}, loader=lambda q, days: {"hits": []})
    except ValueError:
        pass
    else:
        raise AssertionError("must impose collection cap")
