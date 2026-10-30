import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { ExternalLink as ExternalIcon } from "lucide-react";
import { safeURL } from "../lib/format";

const base = "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50";
const sizes = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm" };
const variants = {
  primary: "bg-orange-500 text-slate-950 hover:bg-orange-400",
  secondary: "bg-blue-500/15 text-blue-200 ring-1 ring-inset ring-blue-500/40 hover:bg-blue-500/25",
  ghost: "text-slate-300 ring-1 ring-inset ring-slate-700 hover:bg-slate-800 hover:text-slate-100",
};
type Variant = keyof typeof variants;
type Size = keyof typeof sizes;
export const buttonClass = (variant: Variant = "ghost", size: Size = "md") => `${base} ${sizes[size]} ${variants[variant]}`;

export function Button({ variant, size, className = "", type = "button", ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={`${buttonClass(variant, size)} ${className}`} {...props} />;
}

const tones = {
  ready: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  needs: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  hypo: "bg-slate-500/15 text-slate-300 ring-slate-500/30",
  build: "bg-blue-500/15 text-blue-300 ring-blue-500/30",
  reject: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  neutral: "bg-slate-800 text-slate-300 ring-slate-700",
};
type Tone = keyof typeof tones;
export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}>{children}</span>;
}
export const stageTone = (stage?: string | null): Tone => (stage === "manual-review" ? "ready" : stage === "needs-evidence" ? "needs" : "hypo");
export const statusTone = (status?: string | null): Tone => (status === "build" ? "build" : status === "reject" ? "reject" : "neutral");

export function ExternalLink({ href, children }: { href: unknown; children?: ReactNode }) {
  const url = safeURL(href);
  if (!url) return <span className="text-sm text-slate-500">{children || "Invalid link"}</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1 break-all text-sm text-blue-300 underline-offset-2 transition-colors hover:text-blue-200 hover:underline">
      {children || url}<ExternalIcon aria-hidden className="size-3.5 shrink-0" />
    </a>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-slate-800 pt-5">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <p className="text-sm text-slate-400">{children}</p>;
}

// Wraps exactly one control, so the label is associated without ids.
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-slate-300">{label}</span>
      {children}
    </label>
  );
}

export function Select({ options, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { options: [string, string][] }) {
  return (
    <select {...props}>
      {options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>
  );
}
