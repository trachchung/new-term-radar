import pytest
from scripts.sync_workbench import sync, chunks

def test_chunk_size_and_secure_sync():
    calls = []
    def send(url, payload, token):
        calls.append((url, len(payload["opportunities"]), token))
        return {"imported": len(payload["opportunities"])}
    payload = {"opportunities": [{"keyword": f"term {i}"} for i in range(71)]}
    result = sync(payload, "https://radar.example.workers.dev", "x" * 32, send)
    assert result == {"synced": 71, "chunks": 3}
    assert [x[1] for x in calls] == [35, 35, 1]
    assert all(url.endswith("/api/import") for url, _, _ in calls)

def test_rejects_insecure_or_embedded_credentials():
    with pytest.raises(ValueError):
        sync({"opportunities": []}, "http://example.com", "x" * 32)
    with pytest.raises(ValueError):
        sync({"opportunities": []}, "https://user:pass@example.com", "x" * 32)
    with pytest.raises(ValueError):
        sync({"opportunities": []}, "https://example.com", "short")

def test_invalid_input_and_large_job():
    with pytest.raises(ValueError):
        sync({"wrong": []}, "https://example.com", "x" * 32)
    with pytest.raises(ValueError):
        sync({"opportunities": [{}] * 5001}, "https://example.com", "x" * 32)
