"""Public, read-only deployment smoke test: no API token and no private data."""
import os
import urllib.error
import urllib.request

BASE = os.environ.get("WORKBENCH_BASE_URL", "https://seo-opportunity-workbench.foxigaoqian-soocly.workers.dev").rstrip("/")

def open_public(path):
    req = urllib.request.Request(BASE + path, headers={"User-Agent":"seo-radar-smoke/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.status,resp.read(100000).decode("utf-8","replace")
    except urllib.error.HTTPError as exc:
        return exc.code,exc.read(10000).decode("utf-8","replace")

def main():
    code,html=open_public("/")
    assert code == 200 and "Opportunity Radar" in html, ("home",code,html[:180])
    code,js=open_public("/app.js")
    assert code == 200 and "research" in js.lower(), ("js",code,js[:180])
    code,css=open_public("/style.css")
    assert code == 200 and ".drawer" in css, ("css",code,css[:180])
    code,health=open_public("/api/health")
    assert code == 200 and '"ready":true' in health, ("health",code,health)
    code,body=open_public("/api/items")
    assert code == 401 and "Unauthorized" in body, ("secure endpoint",code,body[:180])
    assert "seo-file-input" in html, "V6 SEO import control missing"
    assert "renderAssessment" in js, "V6 manual SERP controls missing"
    for path in ("/api/items/" + "a"*64 + "/assessment", "/api/export"):
        code,body=open_public(path)
        assert code==401 and "Unauthorized" in body, ("V6 private read",path,code,body[:180])
    # Only anonymous writes are tested, never a real business decision or paid API call.
    req=urllib.request.Request(BASE+"/api/import-seo",data=b'{}',method="POST",
      headers={"Content-Type":"application/json","User-Agent":"seo-radar-smoke/1.0"})
    try:
        with urllib.request.urlopen(req,timeout=20) as response:
            status=response.status
    except urllib.error.HTTPError as exc:
        status=exc.code
    assert status==401,("anonymous SEO import must be blocked",status)
    print("Live V6 smoke passed: UI, new controls, D1/token bindings, anonymous V6 API rejection.")

if __name__ == "__main__":
    main()
