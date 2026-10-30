// Shapes returned by dashboard/src/worker.js and dashboard/src/assessment.js.
export type Stage = "manual-review" | "needs-evidence" | "hypothesis";
export type ReviewStatus = "inbox" | "watch" | "build" | "reject";

export interface SerpHit {
  rank_group?: number;
  url: string;
  title?: string;
  domain?: string;
}

export interface SerpSnapshot {
  organic?: SerpHit[];
  provider?: string;
  location_code?: number | string;
  language_code?: string;
}

export interface Evidence {
  url?: string;
  note?: string;
  published_at?: string;
  attribution?: string;
}

// Imported records are free-form JSON; only the fields the UI reads are typed.
export interface Opportunity {
  id: string;
  keyword: string;
  stage: Stage;
  rubric_score: number | null;
  review_status: ReviewStatus | null;
  decision_note: string | null;
  target_site: string | null;
  existing_site?: string;
  intent_signature: string | null;
  origins?: string[];
  personas?: string[];
  scenes?: string[];
  actions?: string[];
  pains?: string[];
  constraints?: string[];
  evidence?: Evidence[];
  independent_evidence_sites?: string[];
  monthly_searches?: number | null;
  monthly_searches_source?: string;
  serp_snapshot?: SerpSnapshot;
  screening?: { next_step?: string; blockers?: string[] };
}

export interface ItemsResponse {
  items: Opportunity[];
  count: number;
  limit: number;
  offset: number;
}

export interface CollectorRun {
  started_at: string;
  status: string;
  total_topics: number;
  total_matches: number;
  source_counts_json: string | null;
}

export interface Summary {
  stages: { review_status: ReviewStatus | null; stage: Stage; n: number }[];
  possible_overlaps: { intent_signature: string; n: number }[];
  recent_runs: CollectorRun[];
}

export type LabelType = "unknown" | "direct-tool" | "major-platform" | "guide-answer" | "irrelevant";

export interface Assessment {
  intent_fit: string;
  evidence_quality: string;
  placement: string;
  target_site: string;
  monetization: string;
  review_notes: string;
  build_days: number | null;
  snapshot: SerpSnapshot;
  labels: { rank: number; url: string; type: LabelType }[];
  classification_count: number;
  serp_review_complete: boolean;
  site_suggestions: { domain: string; label: string; matched_terms: string[] }[];
}

export type Request = <T>(path: string, options?: { method?: string; body?: unknown }) => Promise<T>;
export type Notify = (message: string, kind?: "ok" | "error") => void;
