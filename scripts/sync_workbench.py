"""Push validated opportunity export to your private Cloudflare workbench.

Only writes when explicitly invoked and WORKBENCH_URL / WORKBENCH_ADMIN_TOKEN are set.
Each chunk is bounded and the service preserves manual decisions on re-import.
"""
from __future__ import annotations

import argparse
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

CHUNK = 35
MAX_ROWS = 5000


def chunks(items, size=CHUNK):
    for i in range(0, len(items), size):
        yield items[i:i + size]


def sync(document, url, token, send=None):
    if not isinstance(document, dict) or not isinstance(document.get("opportunities"), list):
        raise ValueError("Expected opportunities[] JSON report")
    items = document["opportunities"]
    if len(items) > MAX_ROWS:
        raise ValueError(f"At most {MAX_ROWS} rows in one sync job")
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("WORKBENCH_URL must be a clean https:// host URL")
    if len(token) < 24:
        raise ValueError("WORKBENCH_ADMIN_TOKEN is missing or too short")
    endpoint = url.rstrip("/") + "/api/import"
    sender = send or _post
    total = 0
    for batch in chunks(items):
        reply = sender(endpoint, {"opportunities": batch}, token)
        total += int(reply["imported"])
    return {"synced": total, "chunks": (len(items) + CHUNK - 1) // CHUNK}


def _post(url, obj, token):
    req = urllib.request.Request(url, data=json.dumps(obj, ensure_ascii=False).encode("utf-8"),
                                 headers={"Content-Type": "application/json",
                                          "Authorization": "Bearer " + token},
                                 method="POST")
    with urllib.request.urlopen(req, timeout=40) as response:
        return json.load(response)


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input", default="opportunities.json")
    args = p.parse_args(argv)
    url = os.environ.get("WORKBENCH_URL", "")
    token = os.environ.get("WORKBENCH_ADMIN_TOKEN", "")
    if not url or not token:
        p.error("Set WORKBENCH_URL and WORKBENCH_ADMIN_TOKEN")
    document = json.loads(Path(args.input).read_text(encoding="utf-8"))
    try:
        result = sync(document, url, token)
    except (ValueError, KeyError, urllib.error.URLError) as exc:
        p.error(f"Sync failed: {type(exc).__name__}: {exc}")
    print(f"Synced {result['synced']} records in {result['chunks']} batches (manual decisions retained)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
