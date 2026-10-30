"use client";
import { useCallback, useRef, useState } from "react";
import { Lock, Radar } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { Notify, Request } from "../lib/types";
import { Button } from "./ui";
import Login from "./Login";
import Dashboard from "./Dashboard";

export default function Workbench() {
  const [token, setToken] = useState("");
  const [toast, setToast] = useState<{ message: string; kind: "ok" | "error" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const notify: Notify = useCallback((message, kind = "ok") => {
    setToast({ message, kind });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4100);
  }, []);

  // Every call goes through here so a 401 anywhere locks the workbench.
  const request: Request = useCallback(async (path, options) => {
    try {
      return await api(token, path, options);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setToken("");
      throw err;
    }
  }, [token]);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
      <header className="flex items-center justify-between gap-4 border-b border-slate-800 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-md bg-blue-500/15 text-blue-300 ring-1 ring-inset ring-blue-500/30">
            <Radar aria-hidden className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-100">Opportunity Radar</p>
            <p className="hidden text-xs text-slate-400 sm:block">Demand discovery · SEO opportunity screening</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 text-xs text-slate-400">
            <span aria-hidden className={`size-2 rounded-full ${token ? "bg-emerald-400" : "bg-slate-600"}`} />
            {token ? "Connected" : "Not connected"}
          </span>
          {token ? <Button size="sm" onClick={() => setToken("")}><Lock aria-hidden className="size-3.5" />Lock</Button> : null}
        </div>
      </header>

      {token ? <Dashboard request={request} notify={notify} /> : <Login onLogin={setToken} />}

      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex justify-center">
        {toast ? (
          <p className={`pointer-events-auto max-w-lg rounded-md px-4 py-3 text-sm font-medium shadow-lg shadow-black/40 ${
            toast.kind === "error" ? "bg-rose-300 text-rose-950" : "bg-emerald-300 text-emerald-950"}`}>
            {toast.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
