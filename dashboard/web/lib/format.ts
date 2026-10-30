import type { ReviewStatus, Stage } from "./types";

export const STAGES: [Stage, string][] = [
  ["manual-review", "Ready to decide"],
  ["needs-evidence", "Needs evidence"],
  ["hypothesis", "Hypothesis only"],
];
export const STATUSES: [ReviewStatus, string][] = [
  ["inbox", "Inbox"],
  ["watch", "Watching"],
  ["build", "Planned"],
  ["reject", "Rejected"],
];
const stageNames: Record<string, string> = Object.fromEntries(STAGES);
const statusNames: Record<string, string> = Object.fromEntries(STATUSES);

export const stageLabel = (stage?: string | null) => (stage && stageNames[stage]) || "Unknown";
export const statusLabel = (status?: string | null) => (status && statusNames[status]) || "Inbox";
export const intentLabel = (signature?: string | null) => String(signature || "").replaceAll("|", " · ");

const numbers = new Intl.NumberFormat("en-US");
export const fmtNum = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? numbers.format(v) : "Unknown");

// Research content is untrusted: only http(s) links are ever rendered.
export function safeURL(link: unknown): string {
  try {
    const u = new URL(String(link));
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
  } catch {
    return "";
  }
}
