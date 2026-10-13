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
  const result = await res.json();

  if (result.exit !== 0) {
    console.error(`radar ${cmd} failed with exit ${result.exit}\n${result.log}`);
    return;
  }
  await env.STATE.put(STATE_KEY, fromBase64(result.state));
  if (result.report) await env.STATE.put(REPORT_KEY, result.report);
  console.log(`radar ${cmd} ok\n${result.log.slice(-500)}`);
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

    // The latest report, behind a bearer token so the leads are not public.
    if (url.pathname === "/report") {
      if (request.headers.get("Authorization") !== `Bearer ${env.VIEW_TOKEN}`) {
        return new Response("unauthorized", { status: 401 });
      }
      const obj = await env.STATE.get(REPORT_KEY);
      if (!obj) return new Response("no report yet", { status: 404 });
      return new Response(await obj.text(), { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
    }

    return new Response("not found", { status: 404 });
  },
};
