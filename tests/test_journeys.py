from radar import journeys

def test_requires_link_to_real_evidence():
    reply = '{"role":"Shop owner","scene":"Images","action":"Resize images","pain":"Slow",' \
            '"constraints":["many"],"keywords":["bulk image resizer"],"evidence_ids":["invented"]}'
    assert journeys.parse_reply(reply, {"e0": "https://example.com"}) is None
    result = journeys.parse_reply(reply.replace("invented", "e0"), {"e0": "https://example.com"})
    assert result["keywords"] == ["bulk image resizer"]

def test_grounded_input_produces_persona_and_evidence_link():
    data = {"reviews": [{"keyword": "compress images", "evidence": [
        {"note": "I need to compress a lot of images and it is slow", "url": "https://news.ycombinator.com/item?id=42"}
    ]}]}
    def fake(model, system, user, max_tokens=650):
        return '{"role":"Shop owner","scene":"Images","action":"Compress files",' \
               '"pain":"Slow workflow","constraints":[],"keywords":["batch image compressor"],"evidence_ids":["e0"]}'
    r = journeys.generate(data, chat=fake)
    assert r["personas"][0]["scenes"][0]["actions"][0]["evidence_links"] == [
        "https://news.ycombinator.com/item?id=42"]
    assert r["reviews"] == []

def test_empty_quote_does_not_call_model():
    r = journeys.generate({"reviews": [{"keyword": "a", "evidence": []}]},
                          chat=lambda *args, **kwargs: 1 / 0)
    assert r["personas"] == []

def test_bad_ai_json_is_safe():
    assert journeys.parse_reply("not json", {"e0": "url"}) is None
