// Writes out/_headers after `next build`. The export inlines its bootstrap <script>s, so
// instead of loosening the CSP with 'unsafe-inline', each inline script is allowed by hash.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const out = new URL("../out/", import.meta.url);
const sha = body => `'sha256-${createHash("sha256").update(body).digest("base64")}'`;
const scripts = new Set(), styles = new Set();

for (const file of readdirSync(out, { recursive: true })) {
  if (!String(file).endsWith(".html")) continue;
  const html = readFileSync(new URL(file, out), "utf8");
  for (const [, body] of html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)) if (body) scripts.add(sha(body));
  for (const [, body] of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) if (body) styles.add(sha(body));
}

const csp = [
  "default-src 'none'",
  `script-src 'self' ${[...scripts].join(" ")}`.trim(),
  `style-src 'self' ${[...styles].join(" ")}`.trim(),
  "font-src 'self'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

writeFileSync(new URL("_headers", out), `/*
  X-Robots-Tag: noindex, nofollow, noarchive
  Content-Security-Policy: ${csp}
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
`);
console.log(`_headers: ${scripts.size} inline script hashes, ${styles.size} inline style hashes`);
