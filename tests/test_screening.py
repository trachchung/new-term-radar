from radar import screening

def test_no_evidence_no_volume_is_not_a_blue_ocean():
    a = screening.analyze({"keyword": "compress image 30kb", "kind": "generic",
                           "stage": "hypothesis", "evidence": [], "independent_evidence_sites": [],
                           "monthly_searches": None, "serp": None})
    assert a["next_step"] == "find-real-problem"
    assert any("unknown does not mean zero" in s for s in a["blockers"])

def test_brand_keyword_requires_extra_caution():
    a = screening.analyze({"kind": "brand", "stage": "needs-evidence",
                           "evidence": [{"url": "https://example.com"}],
                           "independent_evidence_sites": ["example.com"], "monthly_searches": 0,
                           "serp": None})
    assert any("trademark" in s for s in a["blockers"])

def test_raw_serp_is_not_a_human_serp_assessment():
    a = screening.analyze({"kind": "generic", "stage": "needs-evidence",
                           "evidence": [{"url": "https://forum.test"}],
                           "independent_evidence_sites": ["forum.test"],
                           "monthly_searches": 180,
                           "serp_snapshot": {"organic": [{"url": "https://example.com"}]},
                           "serp": None})
    assert a["next_step"] == "classify-serp"
    assert "raw-serp-snapshot" in a["signals"]
    assert any("Classify SERP" in s for s in a["blockers"])
