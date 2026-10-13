"""DataForSEO integration parser tests: all offline fixtures, no billing."""
from radar import seo_verify

def _wrapper(items):
    return {"status_code": 20000, "tasks": [{"status_code": 20000, "result": [{"items": items}]}]}

def test_volumes_distinguishes_missing_and_zero():
    rows = seo_verify.volumes(_wrapper([{"keyword": "foo", "search_volume": 0, "cpc": 1.1},
                                        {"keyword": "bar", "search_volume": None},
                                        {"keyword": "baz", "search_volume": 200, "competition_index": 90}]))
    assert rows["foo"]["volume"] == 0
    assert "bar" not in rows
    assert rows["baz"]["volume"] == 200

def test_serp_features_and_position_are_kept():
    data = {"status_code": 20000, "tasks": [{"status_code": 20000, "result": [
        {"location_code": 2840, "language_code": "en", "items": [
            {"type": "ai_overview"}, {"type": "organic", "rank_group": 1, "rank_absolute": 2,
             "domain": "site.com", "url": "https://site.com", "title": "Title"}]}]}]}
    snap = seo_verify.snapshot(data)
    assert snap["organic"][0]["rank_absolute"] == 2
    assert snap["features"] == ["ai_overview"]
    assert "exact_tool_results" not in snap

def test_verify_has_volume_but_serp_still_requires_manual_review():
    def fake(endpoint, body):
        if endpoint == seo_verify.VOL:
            return _wrapper([{"keyword": "image compressor", "search_volume": 300, "cpc": 0.5}])
        return {"status_code": 20000, "tasks": [{"status_code": 20000, "result": [
            {"location_code": 2840, "language_code": "en", "items": []}]}]}
    result = seo_verify.verify(["image compressor"], provider=fake)
    row = result["reviews"][0]
    assert row["monthly_searches"] == 300
    assert row["monthly_searches_source"].startswith("dataforseo-google-ads")
    assert "serp" not in row
    assert result["attempted_api_calls"] == 2

def test_bad_dataforseo_response_does_not_create_fake_volume():
    try:
        seo_verify.volumes({"status_code": 40000, "status_message": "error"})
    except ValueError:
        pass
    else:
        raise AssertionError("reject provider errors")

def test_keyword_cap_dedupes_case():
    assert seo_verify.keywords({"keywords": [" ABC ", "abc", "xyz"]}, 2) == ["ABC", "xyz"]
