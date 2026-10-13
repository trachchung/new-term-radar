from radar.intent import signature, suggest

def test_equivalent_image_compression_word_order():
    assert signature("compress images to 20 KB") == signature("20kb photo compressor online")

def test_different_size_constraints_never_merge():
    assert signature("compress image to 20KB") != signature("compress images 200kb")

def test_brand_and_other_actions_remain_distinct():
    assert signature("shopify bulk image compressor") != signature("etsy bulk image compressor")
    assert signature("resize image 20kb") != signature("compress image 20kb")

def test_only_propose_groups_not_mutate_rows():
    rows = [{"keyword": "compress photos to 20kb"}, {"keyword": "20kb image compressor"},
            {"keyword": "compress photo 200kb"}, {"keyword": "how is the weather"}]
    original = [r.copy() for r in rows]
    groups = suggest(rows)
    assert len(groups) == 1
    assert len(groups[0]["keywords"]) == 2
    assert rows == original

def test_generic_words_not_grouped():
    assert not signature("best alternative")
    assert not suggest([{"keyword": "best alternative"}, {"keyword": "alternative best"}])
