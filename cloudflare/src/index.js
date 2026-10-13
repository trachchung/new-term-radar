// Cloudflare entry point for the radar: a cron-triggered Worker that starts the
// Python container, hands it the state from R2, and stores the new state and report back.
import { Container, getContainer } from "@cloudflare/containers";

// Secrets come from `wrangler secret put` (or the dashboard); they are passed to the
// container as environment variables so the radar reads them the same way it does in CI.
const SECRET_NAMES = [
  "AISA_API_KEY",
  "GOANYAPI_API_KEY",
  "GITHUB_TOKEN",
  "GSC_TOKEN_JSON",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "RADAR_EMAIL_TO",
];

export class RadarContainer extends Container {
  defaultPort = 8080;
  // Stop the instance after 10 minutes idle so it is not billed between runs.
  sleepAfter = "10m";

  constructor(ctx, env) {
    super(ctx, env);
    this.envVars = Object.fromEntries(SECRET_NAMES.map((name) => [name, env[name] ?? ""]));
  }
}

const STATE_KEY = "state.tgz";
const REPORT_KEY = "report.md";

function authorized(request, env) {
  if (!env.VIEW_TOKEN) return false;
  const encoder = new TextEncoder();
  const actual = encoder.encode(request.headers.get("Authorization") ?? "");
  const expected = encoder.encode(`Bearer ${env.VIEW_TOKEN}`);
  return actual.length === expected.length && crypto.subtle.timingSafeEqual(actual, expected);
}

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function fromBase64(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

async function runRadar(cmd, env) {
  const stored = await env.STATE.get(STATE_KEY);
  const state = stored ? toBase64(await stored.arrayBuffer()) : "";

  const container = getContainer(env.RADAR_CONTAINER, "radar");
  const res = await container.fetch(
    new Request(`http://container/run?cmd=${cmd}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state }),
    }),
  );
  if (!res.ok) throw new Error(`container HTTP ${res.status}`);
  const result = await res.json();

  if (result.exit !== 0) {
    throw new Error(`radar ${cmd} failed with exit ${result.exit}`);
  }
  await env.STATE.put(STATE_KEY, fromBase64(result.state));
  if (result.report) await env.STATE.put(REPORT_KEY, result.report);
  const summary = { command: cmd, exit: result.exit, state_saved: true, report_saved: Boolean(result.report) };
  console.log(JSON.stringify(summary));
  return summary;
}

export default {
  async scheduled(event, env, ctx) {
    // Must match the cron entries in wrangler.toml.
    const cmd = event.cron === "30 1 * * *" ? "daily" : "sources";
    ctx.waitUntil(runRadar(cmd, env));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return new Response("ok");

    if (url.pathname === "/run") {
      if (!authorized(request, env)) return new Response("unauthorized", { status: 401 });
      if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
      const cmd = url.searchParams.get("cmd");
      if (cmd !== "sources" && cmd !== "daily") return new Response("invalid command", { status: 400 });
      try {
        return Response.json(await runRadar(cmd, env), { headers: { "Cache-Control": "no-store" } });
      } catch (error) {
        console.error(`manual ${cmd}: ${error.message}`);
        return Response.json({ command: cmd, error: "radar execution failed" }, { status: 502 });
      }
    }

    // The latest report, behind a bearer token so the leads are not public.
    if (url.pathname === "/report") {
      if (!authorized(request, env)) {
        return new Response("unauthorized", { status: 401 });
      }
      const obj = await env.STATE.get(REPORT_KEY);
      if (!obj) return new Response("no report yet", { status: 404 });
      return new Response(await obj.text(), { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
    }

    return new Response("not found", { status: 404 });
  },
};
