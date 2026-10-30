"use client";
import { useState, type FormEvent } from "react";
import { ArrowRight, KeyRound, ShieldCheck } from "lucide-react";
import { api } from "../lib/api";
import { Button } from "./ui";

export default function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const field = event.currentTarget.elements.namedItem("secret") as HTMLInputElement;
    const token = field.value;
    setError("");
    if (token.length < 24) return setError("Enter an ADMIN_TOKEN of at least 24 characters");
    setBusy(true);
    try {
      await api(token, "/api/summary");
      field.value = "";
      onLogin(token);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto mt-16 max-w-xl rounded-xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8">
      <p className="font-mono text-xs uppercase tracking-widest text-blue-300">Private workspace</p>
      <h1 className="mt-3 text-2xl font-semibold text-slate-50 sm:text-3xl">
        Find tools worth building, <span className="text-slate-400">not more keywords.</span>
      </h1>
      <p className="mt-3 text-sm text-slate-400">
        Opportunities, manual decisions and search evidence are stored in Cloudflare D1. Access needs the ADMIN_TOKEN set at deploy time.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-2">
        <label htmlFor="secret" className="text-xs font-medium text-slate-300">Workbench access token</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input id="secret" name="secret" type="password" autoComplete="off" minLength={24} required
            placeholder="Enter ADMIN_TOKEN" aria-describedby="login-error" className="font-mono" />
          <Button type="submit" variant="primary" disabled={busy} className="shrink-0">
            {busy ? "Checking…" : "Enter workbench"}<ArrowRight aria-hidden className="size-4" />
          </Button>
        </div>
        <p id="login-error" role="alert" className="min-h-5 text-sm text-rose-300">{error}</p>
      </form>
      <ul className="mt-4 space-y-2 border-t border-slate-800 pt-4 text-xs text-slate-400">
        <li className="flex items-center gap-2"><KeyRound aria-hidden className="size-3.5" />The token is kept only in this page's memory</li>
        <li className="flex items-center gap-2"><ShieldCheck aria-hidden className="size-3.5" />Without a token or database the API refuses access</li>
      </ul>
    </section>
  );
}
