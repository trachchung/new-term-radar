"use client";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import type { Assessment, LabelType, Notify, Opportunity, Request, SerpHit } from "../lib/types";
import { Button, ExternalLink, Field, Muted, Section, Select } from "./ui";

const LABELS: [LabelType, string][] = [
  ["unknown", "Not judged"], ["direct-tool", "Same-purpose tool"], ["major-platform", "Major platform"],
  ["guide-answer", "Article / Q&A"], ["irrelevant", "Off-intent"],
];
const INTENT: [string, string][] = [
  ["unknown", "Not judged yet"], ["aligned", "Results match the search intent"],
  ["mixed", "Partly match, partly off"], ["mismatch", "Results mostly miss the target task"],
];
const QUALITY: [string, string][] = [
  ["unrated", "Not rated yet"], ["strong", "Strong evidence (manual)"], ["mixed", "Average evidence"], ["weak", "Weak evidence"],
];
const PLACEMENT: [string, string][] = [
  ["research", "Keep researching"], ["extend-site", "Extend an existing site"],
  ["new-tool", "Build a standalone tool"], ["reject", "Drop for now"],
];

type Row = { line: number; url: string; hit?: SerpHit } | { line: number; invalid: true };

// One row per non-empty line, at most 10; the rank is the line's position.
function parseUrls(text: string, known: SerpHit[]): Row[] {
  return text.split("\n").map(x => x.trim()).filter(Boolean).slice(0, 10).map((raw, i) => {
    try {
      const u = new URL(raw);
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
      return { line: i + 1, url: u.href, hit: known.find(x => x.url === u.href) };
    } catch {
      return { line: i + 1, invalid: true as const };
    }
  });
}

export default function AssessmentPanel({ item: r, request, notify }: { item: Opportunity; request: Request; notify: Notify }) {
  const [review, setReview] = useState<Assessment | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ intent_fit: "unknown", evidence_quality: "unrated", placement: "research", target_site: "", build_days: "", monetization: "", review_notes: "" });
  const [urls, setUrls] = useState("");
  const [labels, setLabels] = useState<Record<string, LabelType>>({});
  const [counts, setCounts] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    request<Assessment>(`/api/items/${r.id}/assessment`).then(a => {
      if (!live) return;
      setReview(a);
      setForm({
        intent_fit: a.intent_fit, evidence_quality: a.evidence_quality, placement: a.placement,
        target_site: a.target_site || r.target_site || "", build_days: a.build_days == null ? "" : String(a.build_days),
        monetization: a.monetization, review_notes: a.review_notes,
      });
      const base = a.snapshot?.organic?.length ? a.snapshot.organic : r.serp_snapshot?.organic || [];
      setUrls(base.map(x => x.url).join("\n"));
      setLabels(Object.fromEntries(a.labels.map(x => [x.url, x.type])));
      setCounts(`Classified ${a.classification_count} SERP results; under 5 does not count as a complete competition review.`);
    }).catch(err => live && setError(err.message));
    return () => { live = false; };
  }, [r.id, r.target_site, r.serp_snapshot, request]);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm(f => ({ ...f, [key]: e.target.value }));

  if (error) return <Section title="SERP competition analysis and build advice"><Muted>Could not read the review: {error}</Muted></Section>;
  if (!review) return <Section title="SERP competition analysis and build advice"><Muted>Loading manual review…</Muted></Section>;

  const base = review.snapshot?.organic?.length ? review.snapshot.organic : r.serp_snapshot?.organic || [];
  const rows = parseUrls(urls, base);

  async function save() {
    setSaving(true);
    try {
      if (rows.some(x => "invalid" in x) || urls.split("\n").filter(x => x.trim()).length > 10) throw new Error("Some SERP URLs are invalid, or there are more than 10");
      const valid = rows.filter((x): x is Extract<Row, { url: string }> => "url" in x);
      const organic = valid.map(x => ({ rank_group: x.line, url: x.url, title: x.hit?.title || "" }));
      const saved = await request<Assessment>(`/api/items/${r.id}/assessment`, {
        method: "POST",
        body: {
          ...form,
          snapshot: { organic, provider: review!.snapshot?.provider || r.serp_snapshot?.provider || "human-entered" },
          labels: valid.map(x => ({ rank: x.line, url: x.url, type: labels[x.url] || "unknown" })),
        },
      });
      setCounts(`Saved; ${saved.classification_count} valid classifications; completeness: ${saved.serp_review_complete ? "meets the minimum of 5" : "still incomplete"}`);
      notify("Competition review and product route saved; no page is published automatically");
    } catch (err) {
      notify((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title="SERP competition analysis and build advice">
      <Muted>Google top-10 results need a real source. Without paid SERP data, check Google by hand and paste the real result URLs, one per line; nothing is filled in for you.</Muted>
      <ExternalLink href={"https://www.google.com/search?" + new URLSearchParams({ q: r.keyword })}><Search aria-hidden className="size-3.5" />Open Google search</ExternalLink>

      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-300">Existing sites that might fit (topic hint only)</p>
        {review.site_suggestions?.length ? review.site_suggestions.map(s => (
          <div key={s.domain} className="flex items-center justify-between gap-3 rounded-md bg-slate-950/60 px-3 py-2 text-sm">
            <span className="min-w-0 text-slate-300"><span className="font-mono text-slate-100">{s.domain}</span> · {s.label} · <span className="text-slate-500">{s.matched_terms.join("/")}</span></span>
            <Button size="sm" onClick={() => setForm(f => ({ ...f, target_site: s.domain, placement: "extend-site" }))}>Choose</Button>
          </div>
        )) : <Muted>No clear match; decide by hand between a new site and another existing one.</Muted>}
      </div>

      <Field label="SERP top-10 URLs (in order; leave empty if not searched)">
        <textarea value={urls} onChange={e => setUrls(e.target.value)} rows={7} className="font-mono text-xs"
          placeholder="Paste the real Google top-10 result URLs, one per line, 10 at most" />
      </Field>

      {rows.length ? (
        <ol className="space-y-2">
          {rows.map(row => "invalid" in row ? (
            <li key={row.line} className="text-sm text-rose-300">Line {row.line} is not a valid http(s) URL</li>
          ) : (
            <li key={row.line} className="grid items-center gap-2 sm:grid-cols-[1fr_12rem]">
              <span className="flex min-w-0 gap-2">
                <span className="w-5 shrink-0 font-mono text-xs text-slate-500">{row.line}</span>
                <ExternalLink href={row.url}>{row.hit?.title || new URL(row.url).hostname}</ExternalLink>
              </span>
              <Select aria-label={`Classify result ${row.line}`} value={labels[row.url] || "unknown"} options={LABELS}
                onChange={e => setLabels(l => ({ ...l, [row.url]: e.target.value as LabelType }))} />
            </li>
          ))}
        </ol>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="SERP fit with the search intent"><Select value={form.intent_fit} onChange={set("intent_fit")} options={INTENT} /></Field>
        <Field label="Quality of real user-problem evidence"><Select value={form.evidence_quality} onChange={set("evidence_quality")} options={QUALITY} /></Field>
        <Field label="My suggested product route"><Select value={form.placement} onChange={set("placement")} options={PLACEMENT} /></Field>
        <Field label="Target existing site (if any)"><input value={form.target_site} onChange={set("target_site")} maxLength={200} /></Field>
        <Field label="Estimated MVP build days"><input type="number" min={0} max={180} step={0.5} value={form.build_days} onChange={set("build_days")} /></Field>
        <Field label="Monetization path"><input value={form.monetization} onChange={set("monetization")} maxLength={100} placeholder="Ads / one-time fee / subscription / undecided" /></Field>
      </div>
      <Field label="Review reasoning">
        <textarea value={form.review_notes} onChange={set("review_notes")} maxLength={3000} placeholder="Top-10 competition, feature gaps, MVP scope and monetization…" />
      </Field>
      <Muted>{counts}</Muted>
      <Button variant="secondary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save competition and build review"}</Button>
    </Section>
  );
}
