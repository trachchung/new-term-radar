import json
from pathlib import Path
from radar import keyword_ideas

def sample():
    return json.loads(Path("tests/fixtures/dataforseo_keyword_ideas.json").read_text())

def test_parse_volume_and_kd_not_missing_zero():
    rows=keyword_ideas.parse_response(sample()["avatar image format converter"],"avatar image format converter")
    assert len(rows)==2
    assert rows[0]["monthly_searches"]==110
    assert rows[0]["provider_keyword_difficulty"]==16
    assert "monthly_searches" not in rows[1]

def test_seeds_dedupe_and_bounded():
    s=keyword_ideas.seeds({"opportunities":[{"keyword":"bulk image compressor"},{"keyword":"BULK IMAGE COMPRESSOR"},{"keyword":"pdf compressor"}]},2)
    assert s==["bulk image compressor","pdf compressor"]

def test_calls_opt_in_provider_no_clickstream_surcharge():
    calls=[]
    def fake(endpoint,body):
        calls.append((endpoint,body));return sample()[body["keyword"]]
    output=keyword_ideas.ideas(["avatar image format converter"],fake,per_seed=4)
    assert len(calls)==1
    assert calls[0][1]["include_clickstream_data"] is False
    assert calls[0][1]["include_serp_info"] is False
    assert output["reported_api_cost_usd"]==0.012

def test_provider_errors_not_interpreted_as_zero_volume():
    output=keyword_ideas.ideas(["something"],lambda *args:{"status_code":40000})
    assert output["reviews"]==[]
    assert len(output["errors"])==1
