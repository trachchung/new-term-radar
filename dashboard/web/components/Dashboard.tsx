"use client";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  ArrowLeft, ArrowRight, ChevronRight, Download, FileUp, Hammer, Inbox, Layers, ListChecks,
  RefreshCw, Search, SearchCheck, Upload, X,
} from "lucide-react";
import { STAGES, STATUSES, fmtNum, intentLabel, stageLabel, statusLabel } from "../lib/format";
import type { ItemsResponse, Notify, Opportunity, Request, Summary } from "../lib/types";
import { Button, Pill, Select, stageTone, statusTone } from "./ui";
import DetailDialog from "./DetailDialog";

const LIMIT = 50;
const INITIAL = { q: "", status: "all", stage: "all", intent: "", offset: 0 };
type Filters = typeof INITIAL;

const STACK_STATE: Record<string, string> = { cooldown: "cooling down", limited: "rate-limited", completed: "done", failed: "failed" };

function lastScanText(summary: Summary | null) {
  const last = summary?.recent_runs?.[0];
  if (!last) return "Public demand collection: waiting for first run";
  let counts: Record<string, unknown> = {};
  try { counts = JSON.parse(last.source_counts_json || "{}"); } catch {}
  const when = last.started_at ? new Date(last.started_at).toLocaleString() : "";
  const stack = STACK_STATE[String(counts.stackexchange_status)] || "unverified";
  return `Last collection: ${when} · ${last.status} · ${last.total_matches} evidence / ${last.total_topics} topics · ` +
    `HN ${counts.hacker_news ?? "—"} / Stack Exchange ${counts.stackexchange ?? "—"} (${stack})`;
}

async function readJsonFile(event: ChangeEvent<HTMLInputElement>, maxBytes: number) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return null;
  if (file.size > maxBytes) throw new Error("File too large; import it in batches");
  return JSON.parse(await file.text());
}

export default function Dashboard({ request, notify }: { request: Request; notify: Notify }) {
  const [filters, setFilters] = useState<Filters>(INITIAL);
  const [reload, setReload] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [result, setResult] = useState<ItemsResponse | null>(null);
  const [picked, setPicked] = useState<Opportunity | null>(null);
  const [search, setSearch] = useState("");
  const [collecting, setCollecting] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const opportunityFile = useRef<HTMLInputElement>(null);
  const seoFile = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    const query = new URLSearchParams({ limit: String(LIMIT), offset: String(filters.offset), status: filters.status, stage: filters.stage });
    if (filters.q) query.set("q", filters.q);
    if (filters.intent) query.set("intent", filters.intent);
    Promise.all([request<Summary>("/api/summary"), request<ItemsResponse>("/api/items?" + query)])
      .then(([s, r]) => { if (live) { setSummary(s); setResult(r); } })
      .catch(err => live && notify(err.message, "error"));
    return () => { live = false; };
  }, [filters, reload, request, notify]);

  const refresh = () => setReload(n => n + 1);
  const update = (patch: Partial<Filters>) => setFilters(f => ({ ...f, offset: 0, ...patch }));

  function onSearch(value: string) {
    setSearch(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => update({ q: value.trim() }), 240);
  }

  async function importOpportunities(event: ChangeEvent<HTMLInputElement>) {
    try {
      const data = await readJsonFile(event, 9_000_000);
      if (!data) return;
      if (!Array.isArray(data.opportunities) || !data.opportunities.length) throw new Error("Choose a JSON report that contains opportunities[]");
      let imported = 0;
      for (let i = 0; i < data.opportunities.length; i += 40) {
        const out = await request<{ imported: number }>("/api/import", { method: "POST", body: { opportunities: data.opportunities.slice(i, i + 40) } });
        imported += out.imported;
      }
      notify(`Imported ${imported} keywords; existing manual decisions kept`);
      update({});
    } catch (err) {
      notify("Import failed: " + (err as Error).message, "error");
    }
  }

  async function importSeo(event: ChangeEvent<HTMLInputElement>) {
    try {
      const data = await readJsonFile(event, 10_000_000);
      if (!data) return;
      if (!Array.isArray(data.reviews) || !data.reviews.length) throw new Error("Choose the reviews[] JSON made by DataForSEO verify/ideas");
      let total = 0, missing = 0;
      for (let i = 0; i < data.reviews.length; i += 30) {
        const res = await request<{ updated: number; unmatched: unknown[] }>("/api/import-seo", { method: "POST", body: { reviews: data.reviews.slice(i, i + 30) } });
        total += res.updated;
        missing += res.unmatched.length;
      }
      notify(`Updated ${total} existing terms; ${missing} terms not in the database need importing as opportunities first`);
      refresh();
    } catch (err) {
      notify("SEO data import failed: " + (err as Error).message, "error");
    }
  }

  async function exportData() {
    try {
      const data = await request("/api/export");
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `seo-opportunities-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify("Research decision backup downloaded");
    } catch (err) {
      notify((err as Error).message, "error");
    }
  }

  async function collect() {
    setCollecting(true);
    try {
      const data = await request<{ topics: number; matched: number; sources?: Record<string, number> }>("/api/collect", { method: "POST" });
      notify(`Checked ${data.topics} topics, matched ${data.matched} evidence (HN ${data.sources?.hacker_news ?? 0} / Stack Exchange ${data.sources?.stackexchange ?? 0})`);
      refresh();
    } catch (err) {
      notify((err as Error).message, "error");
    } finally {
      setCollecting(false);
    }
  }

  const stages = summary?.stages || [];
  const total = (pred: (r: Summary["stages"][number]) => boolean) => stages.filter(pred).reduce((a, r) => a + Number(r.n || 0), 0);
  const stats = [
    { label: "Total", hint: "Imported keyword candidates", value: total(() => true), Icon: Layers },
    { label: "Ready to decide", hint: "Evidence and checks fairly complete", value: total(r => r.stage === "manual-review"), Icon: ListChecks },
    { label: "Needs evidence", hint: "Can't judge the SEO opportunity yet", value: total(r => r.stage === "needs-evidence"), Icon: SearchCheck },
    { label: "Planned", hint: "Opportunities you confirmed to pursue", value: total(r => r.review_status === "build"), Icon: Hammer },
  ];
  const items = result?.items || [];
  const count = result?.count || 0;
  const overlaps = summary?.possible_overlaps || [];

  return (
    <main className="space-y-6 pt-8">
      <section className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-blue-300">Research command center</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-50 sm:text-3xl">Which needs today are worth building for?</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">New-term trends × real user scenarios × Google search evidence. Discover first, then verify, then decide.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => opportunityFile.current?.click()}><Upload aria-hidden className="size-4" />Import opportunities</Button>
          <Button onClick={() => seoFile.current?.click()}><FileUp aria-hidden className="size-4" />Import SEO data</Button>
          <Button onClick={collect} disabled={collecting}><RefreshCw aria-hidden className={`size-4 ${collecting ? "motion-safe:animate-spin" : ""}`} />{collecting ? "Collecting…" : "Collect now"}</Button>
          <Button onClick={exportData}><Download aria-hidden className="size-4" />Export backup</Button>
          <input ref={opportunityFile} type="file" accept=".json,application/json" hidden onChange={importOpportunities} />
          <input ref={seoFile} type="file" accept=".json,application/json" hidden onChange={importSeo} />
        </div>
      </section>

      <section aria-label="Opportunity stats" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ label, hint, value, Icon }) => (
          <div key={label} className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between text-xs font-medium text-slate-400">{label}<Icon aria-hidden className="size-4 text-slate-500" /></div>
            <p className="mt-2 font-mono text-2xl font-semibold text-slate-50 tabular-nums">{summary ? fmtNum(value) : "—"}</p>
            <p className="mt-1 text-xs text-slate-500">{hint}</p>
          </div>
        ))}
      </section>

      <p aria-live="polite" className="flex items-center gap-2 text-xs text-slate-400">
        <span aria-hidden className="size-1.5 rounded-full bg-blue-400" />{lastScanText(summary)}
      </p>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 p-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Opportunity queue <span className="font-mono text-sm text-slate-500">· {fmtNum(count)}</span></h2>
            <p className="text-xs text-slate-500">The score only orders research priority; it is not a ranking probability</p>
          </div>
          <Button size="sm" onClick={refresh}><RefreshCw aria-hidden className="size-3.5" />Refresh</Button>
        </div>

        <div className="grid gap-2 border-b border-slate-800 p-4 sm:grid-cols-[1fr_auto_auto_auto]">
          <label className="relative block">
            <span className="sr-only">Search keywords</span>
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
            <input type="search" value={search} onChange={e => onSearch(e.target.value)} placeholder="Search keywords, e.g. image compressor…" className="pl-9" />
          </label>
          <label>
            <span className="sr-only">Filter by decision</span>
            <Select value={filters.status} onChange={e => update({ status: e.target.value })} options={[["all", "All decisions"], ...STATUSES]} />
          </label>
          <label>
            <span className="sr-only">Filter by evidence stage</span>
            <Select value={filters.stage} onChange={e => update({ stage: e.target.value })} options={[["all", "All stages"], ...STAGES]} />
          </label>
          <Button onClick={() => { setSearch(""); setFilters(INITIAL); }}>Reset</Button>
        </div>

        {filters.intent ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-blue-500/5 px-4 py-2 text-xs text-blue-200">
            Filtered by possible duplicate intent: <span className="font-mono">{intentLabel(filters.intent)}</span>
            <Button size="sm" onClick={() => update({ intent: "" })}><X aria-hidden className="size-3.5" />Clear</Button>
          </div>
        ) : null}

        <div className="hidden grid-cols-[minmax(0,1fr)_9rem_8rem_7rem_7rem_1.5rem] gap-4 px-4 py-2 text-xs font-medium uppercase tracking-wider text-slate-500 md:grid">
          <span>Keyword / need</span><span>Evidence stage</span><span className="text-right">Monthly searches</span>
          <span className="text-right">Score</span><span>Decision</span><span />
        </div>

        <div ref={listRef} aria-live="polite" className="divide-y divide-slate-800/80">
          {result && !items.length ? (
            <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
              <Inbox aria-hidden className="size-8 text-slate-600" />
              <p className="font-medium text-slate-200">No opportunities match</p>
              <p className="max-w-md text-sm text-slate-400">Generate opportunities.json with <code className="font-mono text-slate-300">python -m radar opportunities</code>, then use Import opportunities.</p>
            </div>
          ) : null}
          {items.map(r => (
            <button key={r.id} type="button" onClick={() => setPicked(r)}
              className="group grid w-full grid-cols-[1fr_auto] gap-x-4 gap-y-2 px-4 py-3 text-left transition-colors duration-150 hover:bg-slate-800/50 md:grid-cols-[minmax(0,1fr)_9rem_8rem_7rem_7rem_1.5rem] md:items-center">
              <span className="min-w-0">
                <span className="block truncate font-medium text-slate-100">{r.keyword}</span>
                <span className="block truncate text-xs text-slate-500">
                  {[(r.origins || []).slice(0, 2).join(" · "), (r.personas || []).slice(0, 1).join("")].filter(Boolean).join(" / ") || "No source given"}
                </span>
              </span>
              <span className="md:order-none"><Pill tone={stageTone(r.stage)}>{stageLabel(r.stage)}</Pill></span>
              <span className="font-mono text-sm text-slate-300 tabular-nums md:text-right">{fmtNum(r.monthly_searches)}</span>
              <span className="font-mono text-sm tabular-nums text-slate-100 md:text-right">{r.rubric_score ?? 0}<span className="text-slate-500"> / 100</span></span>
              <span><Pill tone={statusTone(r.review_status)}>{statusLabel(r.review_status)}</Pill></span>
              <ChevronRight aria-hidden className="hidden size-4 text-slate-600 transition-colors group-hover:text-slate-300 md:block" />
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-800 px-4 py-3 text-xs text-slate-400">
          <span className="font-mono tabular-nums">
            {count ? `${fmtNum(filters.offset + 1)}–${fmtNum(Math.min(filters.offset + items.length, count))} / ${fmtNum(count)}` : "No matching keywords"}
          </span>
          <div className="flex gap-2">
            <Button size="sm" disabled={filters.offset === 0} onClick={() => setFilters(f => ({ ...f, offset: Math.max(0, f.offset - LIMIT) }))}>
              <ArrowLeft aria-hidden className="size-3.5" />Previous
            </Button>
            <Button size="sm" disabled={filters.offset + items.length >= count} onClick={() => setFilters(f => ({ ...f, offset: f.offset + LIMIT }))}>
              Next<ArrowRight aria-hidden className="size-3.5" />
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <h2 className="text-base font-semibold text-slate-100">Possible duplicate search intents</h2>
          <p className="text-xs text-slate-500">A reminder only; never merges terms or creates pages automatically</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {overlaps.length ? overlaps.map(group => (
              <Button key={group.intent_signature} size="sm" onClick={() => { update({ intent: group.intent_signature }); listRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>
                <span className="font-mono">{intentLabel(group.intent_signature)}</span><span className="text-slate-500">· {group.n}</span>
              </Button>
            )) : <p className="text-sm text-slate-400">No duplicate-intent candidates with matching signatures found.</p>}
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <h2 className="text-base font-semibold text-slate-100">Workbench rules</h2>
          <p className="text-xs text-slate-500">So every investment is better grounded</p>
          <ol className="mt-3 space-y-2 text-sm text-slate-300">
            {["Real comments show a problem may exist; they don't prove Google search volume.",
              "Google Ads competition index is not organic KD.",
              "Check synonyms against the SERP by hand before choosing one page or several."].map((rule, i) => (
              <li key={rule} className="flex gap-3"><span className="font-mono text-xs text-blue-300">0{i + 1}</span>{rule}</li>
            ))}
          </ol>
        </div>
      </section>

      <p className="text-center text-xs text-slate-600">Private research dashboard · Cloudflare Workers + D1. No auto-publishing, no automatic paid APIs.</p>

      {picked ? (
        <DetailDialog key={picked.id} item={picked} request={request} notify={notify}
          onClose={() => setPicked(null)} onSaved={() => { setPicked(null); refresh(); }} />
      ) : null}
    </main>
  );
}
