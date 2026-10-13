import json
import pytest
from radar import opportunities
from radar import __main__ as cli

def demo():
    return {"personas": [{"name": "Solo merchant", "scenes": [{"name": "Images", "actions": [
        {"name": "Resize", "pain": "Time", "constraints": ["bulk"],
         "keywords": ["Shopify Bulk Image Resizer", "batch photo tool"]}
    ]}]}], "reviews": []}

def test_persona_hypotheses_are_not_claimed_as_search_demand():
    result = opportunities.build(demo())
    assert result["count"] == 2
    row = next(r for r in result["opportunities"] if r["keyword"] == "Shopify Bulk Image Resizer")
    assert row["stage"] == "hypothesis" and row["monthly_searches"] is None
    assert row["personas"] == ["Solo merchant"] and row["constraints"] == ["bulk"]

def test_radar_signals_do_not_imply_search_volume():
    radar = {"leads": [{"term": "New Model", "kinds": ["breakout"]}],
             "keywords": {"rows": [{"phrase": "image detector", "kind": "generic", "decision": "prioritize"}]}}
    rows = opportunities.build({"personas": [], "reviews": []}, radar)["opportunities"]
    assert {r["keyword"] for r in rows} == {"New Model", "image detector"}
    assert all(r["stage"] == "hypothesis" and r["monthly_searches"] is None for r in rows)

def test_persona_and_radar_duplicates_merge():
    radar = {"leads": [{"term": "shopify bulk image resizer", "kinds": ["sitemap"]}]}
    result = opportunities.build(demo(), radar)
    row = next(r for r in result["opportunities"] if r["keyword"].lower() == "shopify bulk image resizer")
    assert result["count"] == 2 and row["kind"] == "generic"
    assert set(row["origins"]) == {"persona-hypothesis", "new-term-radar"}

def test_evidence_requires_multiple_domains():
    review = {"keyword": "resume compressor",
              "evidence": [{"url": "https://reddit.com/one"}, {"url": "https://www.reddit.com/two"}],
              "monthly_searches": 1200, "monthly_searches_source": "manual-export",
              "serp": {"reviewed_at": "2026-10-13", "exact_tool_results": 2, "major_site_results": 3},
              "estimated_build_days": 1, "monetization": "ads"}
    d = {"personas": [], "reviews": [review]}
    assert opportunities.build(d)["opportunities"][0]["stage"] == "needs-evidence"
    review["evidence"].append({"url": "https://example.org/thread"})
    row = opportunities.build(d)["opportunities"][0]
    assert row["stage"] == "manual-review" and row["rubric_score"] <= 100
    assert all(e["verified"] is False for e in row["evidence"])

def test_volume_is_unknown_without_source():
    row = opportunities.build({"reviews": [{"keyword": "x", "monthly_searches": 9999}]})["opportunities"][0]
    assert row["monthly_searches"] is None and row["stage"] == "hypothesis"

def test_cli_writes_report_without_main_config(tmp_path):
    inp = tmp_path / "seed.json"
    inp.write_text(json.dumps(demo()), encoding="utf-8")
    out = tmp_path / "opportunities.md"
    assert cli.main(["opportunities", "--input", str(inp), "--out", str(out)]) == 0
    assert out.exists() and out.with_suffix(".json").exists()
    assert json.loads(out.with_suffix(".json").read_text())["stage_counts"]["hypothesis"] == 2

def test_bad_payload_rejected():
    with pytest.raises(ValueError):
        opportunities.build({"personas": {}})
