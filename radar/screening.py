"""Evidence-aware, deterministic product research screening.

Does not estimate ranking probability or claim that Google Ads search volume means SEO traffic.
Produces checklists and flags; never auto-approves new sites or content.
"""
from __future__ import annotations

def analyze(row: dict) -> dict:
    signals = []
    blockers = []
    sources = row.get("evidence") or []
    hosts = row.get("independent_evidence_sites") or []
    if sources:
        signals.append("problem-discussion-links")
    else:
        blockers.append("Find user discussions demonstrating an actual task or problem")
    if len(hosts) < 2:
        blockers.append("Find at least one additional independent source of demand evidence")
    volume = row.get("monthly_searches")
    if volume is None:
        blockers.append("Validate target-country Google keyword demand; unknown does not mean zero")
    elif volume == 0:
        signals.append("google-ads-reported-zero")
        blockers.append("Check exact phrasing / nearby intent queries before discarding")
    else:
        signals.append("reported-google-ads-volume")
    snap = row.get("serp_snapshot") or {}
    if not snap.get("organic"):
        blockers.append("Retrieve target-country Google SERP top 10")
    else:
        signals.append("raw-serp-snapshot")
    if row.get("serp") is None:
        blockers.append("Classify SERP competitors and whether they satisfy the task")
    else:
        signals.append("human-serp-assessment")
    if row.get("estimated_build_days") is None:
        blockers.append("Estimate MVP build time and third-party API costs")
    if not row.get("monetization"):
        blockers.append("Define the likely monetization route and user payment intent")
    if row.get("existing_site"):
        signals.append("existing-site-extension-possible")
    if row.get("intent_signature"):
        signals.append("candidate-intent-signature")
    if row.get("kind") == "brand":
        blockers.append("Check trademark and whether a short-lived brand query justifies the page")
    if row.get("stage") == "manual-review":
        next_step = "human-decision"
    elif volume is not None and snap.get("organic"):
        next_step = "classify-serp"
    elif sources:
        next_step = "validate-search"
    else:
        next_step = "find-real-problem"
    return {"next_step": next_step, "signals": signals, "blockers": blockers,
            "note": "Research checklist only; not a Google ranking, traffic, or conversion prediction"}
