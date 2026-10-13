"""Conservative, *suggested* SEO intent groups. Never auto-merge or publish pages.

Rules target clear synonym/word-form matches only and preserve numbers, sizes,
brand/product names and constraints. These are review hints, not Google SERP proof.
"""
from __future__ import annotations
import re
import unicodedata
from collections import defaultdict

ALIASES = {
    "photos": "image", "photo": "image", "pictures": "image", "picture": "image",
    "images": "image",
    "compressor": "compress", "compressing": "compress", "compression": "compress",
    "resizer": "resize", "resizing": "resize", "resized": "resize",
    "converter": "convert", "converting": "convert", "conversion": "convert",
    "generator": "generate", "generating": "generate",
}
NOISE = {"a", "an", "the", "for", "to", "of", "my", "with", "online", "free", "tool", "tools"}
ALLOWED_ACTIONS = {"compress", "resize", "convert", "generate", "extract", "calculate",
                   "remove", "crop", "merge", "split", "download", "validate", "check"}

def signature(phrase: str) -> str:
    """A strict, deterministic candidate intent signature, not semantic similarity."""
    text = unicodedata.normalize("NFKC", phrase or "").casefold()
    text = re.sub(r"(\d+)\s+(kb|mb|gb)\b", r"\1\2", text)
    tokens = re.findall(r"[a-z0-9]+(?:\.[a-z0-9]+)?", text)
    terms = sorted({ALIASES.get(t, t) for t in tokens if t not in NOISE})
    if len(terms) < 2 or not (set(terms) & ALLOWED_ACTIONS):
        return ""
    return "|".join(terms)

def suggest(rows: list[dict]) -> list[dict]:
    """Only suggest groups when >=2 distinct keyword spellings share a signature."""
    groups = defaultdict(list)
    for row in rows:
        phrase = str(row.get("keyword") or "")
        sig = signature(phrase)
        if sig:
            groups[sig].append(phrase)
    return [{"signature": s, "keywords": sorted(set(v), key=str.casefold),
             "caution": "Possible overlapping intent only; inspect the same Google SERP before merging."}
            for s, v in sorted(groups.items()) if len({w.casefold() for w in v}) >= 2]
