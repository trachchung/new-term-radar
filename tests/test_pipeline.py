"""End-to-end offline test: public discussion -> grounded task -> SEO snapshot -> queue."""
import json
from radar import journeys, opportunities, research, seo_verify

def _api_data(items):
    return {"status_code": 20000, "tasks": [{"status_code": 20000, "result": [{"items": items}]}]}

def test_pipeline_retains_evidence_and_does_not_invent_rankability():
    spec = {"queries": [{"keyword": "bulk image compressor", "query": "images", "pain_terms": ["need"]}]}
    def hn_loader(q, days):
        return {"hits": [{"objectID": "123", "created_at": "2026-10-11T12:00:00Z",
                          "comment_text": "I need a tool to compress 100 product photos for an online store without wasting hours."}]}
    collected = research.collect(spec, loader=hn_loader)

    def fake_ai(model, system, user, max_tokens):
        return json.dumps({"role": "online seller", "scene": "store photos",
                           "action": "compress multiple photos", "pain": "slow manual uploads",
                           "constraints": ["batch"], "keywords": ["bulk image compressor"],
                           "evidence_ids": ["e0"]})
    people = journeys.generate(collected, chat=fake_ai)

    def fake_seo(endpoint, body):
        if endpoint == seo_verify.VOL:
            return _api_data([{"keyword": "bulk image compressor", "search_volume": 120}])
        return {"status_code": 20000, "tasks": [{"status_code": 20000, "result": [
            {"location_code": 2840, "language_code": "en",
             "items": [{"type": "organic", "rank_group": 1, "title": "Example", "domain": "example.com",
                        "url": "https://example.com/tools"}]}]}]}
    checked = seo_verify.verify(["bulk image compressor"], provider=fake_seo)

    joined = opportunities.merge_research(people, [collected, checked])
    result = opportunities.build(joined)
    assert result["count"] == 1
    row = result["opportunities"][0]
    assert row["keyword"] == "bulk image compressor"
    assert row["stage"] == "needs-evidence"  # SERP still unclassified, only 1 HN domain
    assert row["monthly_searches"] == 120
    assert row["monthly_searches_source"].startswith("dataforseo-google-ads")
    assert row["serp_snapshot"]["organic"][0]["domain"] == "example.com"
    assert row["serp"] is None
    assert row["evidence"][0]["published_at"] == "2026-10-11T12:00:00Z"
    assert row["constraints"] == ["batch"]

def test_merge_preserves_explicit_manual_values_and_deduplicates_links():
    manual = {"personas": [], "reviews": [{"keyword": "x", "monthly_searches": 45,
              "monthly_searches_source": "manually checked", "evidence": [{"url": "https://site.com/1"}]}]}
    external = {"reviews": [{"keyword": "X", "monthly_searches": 100,
                 "monthly_searches_source": "external", "evidence": [{"url": "https://site.com/1"},
                 {"url": "https://forum.com/2"}]}]}
    merged = opportunities.merge_research(manual, [external])
    row = merged["reviews"][0]
    assert row["monthly_searches"] == 45
    assert len(row["evidence"]) == 2

def test_empty_serp_api_result_does_not_claim_competition():
    result = seo_verify.snapshot({"status_code": 20000, "tasks": [
        {"status_code": 20000, "result": [{"location_code": 2840,
                                         "language_code": "en", "items": []}]}]})
    assert result["organic"] == []
    assert "exact_tool_results" not in result
