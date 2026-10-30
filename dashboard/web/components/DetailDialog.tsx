"use client";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { X } from "lucide-react";
import { STATUSES, fmtNum, intentLabel, stageLabel, statusLabel } from "../lib/format";
import type { Notify, Opportunity, Request } from "../lib/types";
import { Button, ExternalLink, Field, Muted, Pill, Section, Select, stageTone, statusTone } from "./ui";
import AssessmentPanel from "./AssessmentPanel";

interface Props {
  item: Opportunity;
  request: Request;
  notify: Notify;
  onClose: () => void;
  onSaved: () => void;
}

// Native <dialog>: focus trap, Escape and the inert background come from the browser.
export default function DetailDialog({ item: r, request, notify, onClose, onSaved }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState<string>(r.review_status || "inbox");
  const [site, setSite] = useState(r.target_site || r.existing_site || "");
  const [note, setNote] = useState(r.decision_note || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (ref.current && !ref.current.open) ref.current.showModal(); }, []);

  // A click on the dialog element itself is a click on the backdrop.
  const onBackdrop = (e: MouseEvent<HTMLDialogElement>) => { if (e.target === e.currentTarget) ref.current?.close(); };

  async function save() {
    setSaving(true);
    try {
      await request(`/api/items/${r.id}/decision`, { method: "POST", body: { review_status: status, target_site: site, decision_note: note } });
      notify("Decision and audit record saved");
      onSaved();
    } catch (err) {
      notify((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  const raw = r.serp_snapshot;
  const people = ([["Users", r.personas], ["Scenes", r.scenes], ["Actions", r.actions], ["Pains", r.pains]] as const)
    .filter(([, arr]) => Array.isArray(arr) && arr.length);
  const blockers = r.screening?.blockers || [];

  return (
    <dialog ref={ref} onClose={onClose} onClick={onBackdrop} aria-labelledby="detail-title"
      className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-full max-w-2xl overflow-y-auto border-l border-slate-800 bg-slate-900 p-0 text-slate-200 shadow-2xl shadow-black/60 backdrop:bg-slate-950/70 backdrop:backdrop-blur-sm">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-slate-900/95 px-6 py-3 backdrop-blur">
        <span className="font-mono text-xs uppercase tracking-widest text-slate-500">Opportunity detail</span>
        <button type="button" autoFocus onClick={() => ref.current?.close()} aria-label="Close details"
          className="grid size-8 place-items-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100">
          <X aria-hidden className="size-4" />
        </button>
      </div>

      <div className="space-y-6 px-6 py-6">
        <div className="space-y-3">
          <h2 id="detail-title" className="wrap-break-word text-2xl font-semibold text-slate-50">{r.keyword}</h2>
          <div className="flex flex-wrap gap-2">
            <Pill tone={stageTone(r.stage)}>{stageLabel(r.stage)}</Pill>
            <Pill tone={statusTone(r.review_status)}>{statusLabel(r.review_status)}</Pill>
          </div>
          <dl className="grid grid-cols-3 gap-3">
            {([["Research score", r.rubric_score ?? "—"], ["Monthly searches", fmtNum(r.monthly_searches)],
              ["Independent sources", (r.independent_evidence_sites || []).length]] as const).map(([label, value]) => (
              <div key={label} className="rounded-md border border-slate-800 bg-slate-950/60 p-3">
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-100">{value}</dd>
              </div>
            ))}
          </dl>
          {r.monthly_searches_source ? <Muted>Volume source: {r.monthly_searches_source}</Muted> : null}
        </div>

        <Section title="People and scenarios">
          {people.length ? people.map(([label, arr]) => (
            <p key={label} className="text-sm text-slate-300"><span className="text-slate-500">{label}: </span>{arr!.join("; ")}</p>
          )) : <Muted>No people or scenarios recorded.</Muted>}
          {r.constraints?.length ? (
            <div className="flex flex-wrap gap-1.5">
              <span className="w-full text-xs text-slate-500">Constraints</span>
              {r.constraints.slice(0, 14).map(c => <Pill key={c}>{c}</Pill>)}
            </div>
          ) : null}
        </Section>

        <Section title="Real discussion evidence (not search demand)">
          {r.evidence?.length ? r.evidence.slice(0, 12).map((source, i) => (
            <blockquote key={i} className="space-y-1.5 rounded-md border-l-2 border-blue-500/50 bg-slate-950/60 p-3">
              <p className="text-sm text-slate-200">{source.note || "This source gave no excerpt"}</p>
              <ExternalLink href={source.url}>View original discussion</ExternalLink>
              {source.published_at ? <p className="text-xs text-slate-500">Published: {source.published_at}</p> : null}
              {source.attribution ? <p className="text-xs text-slate-500">{source.attribution}</p> : null}
            </blockquote>
          )) : <Muted>No user comments or forum evidence yet.</Muted>}
        </Section>

        <Section title="Google top-10 organic results (raw snapshot)">
          {raw?.organic?.length ? (
            <>
              <Muted>Fetched for: {raw.location_code || "unknown"} / {raw.language_code || "unknown"}. Judge by hand whether these results really meet the user&apos;s intent.</Muted>
              <ol className="space-y-2">
                {raw.organic.slice(0, 10).map((hit, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="w-5 shrink-0 font-mono text-xs text-slate-500">{hit.rank_group || "—"}</span>
                    <div className="min-w-0">
                      <ExternalLink href={hit.url}>{hit.title || hit.domain || "View ranking result"}</ExternalLink>
                      <p className="text-xs text-slate-500">{hit.domain}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          ) : <Muted>No SERP snapshot yet. Competition not verified.</Muted>}
        </Section>

        <Section title="Next research checklist">
          {r.screening?.next_step ? <Muted>Suggested stage: {r.screening.next_step}</Muted> : null}
          {blockers.length ? (
            <ul className="list-inside list-disc space-y-1 text-sm text-slate-300">
              {blockers.slice(0, 10).map(b => <li key={b}>{b}</li>)}
            </ul>
          ) : <Muted>No blockers listed automatically; manual judgement still needed.</Muted>}
        </Section>

        <Section title="Research notes">
          <Muted>
            This term is currently: {stageLabel(r.stage)}. Possible same-intent signature: {intentLabel(r.intent_signature) || "none"}.
            Automatic clustering does not replace a manual Google SERP check.
          </Muted>
        </Section>

        <AssessmentPanel item={r} request={request} notify={notify} />

        <Section title="My decision">
          <Field label="Status"><Select value={status} onChange={e => setStatus(e.target.value)} options={STATUSES} /></Field>
          <Field label="Which site / project it goes to first">
            <input value={site} onChange={e => setSite(e.target.value)} maxLength={200} placeholder="e.g. imagekb.net" />
          </Field>
          <Field label="Why watch, build or reject?">
            <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={2000}
              placeholder="Note the SERP judgement, willingness to pay, build cost, next step…" />
          </Field>
          <Button variant="primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save decision"}</Button>
        </Section>
      </div>
    </dialog>
  );
}
