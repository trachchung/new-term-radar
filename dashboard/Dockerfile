# Local opportunity workbench: `wrangler dev` with a local D1 (no Cloudflare account needed).
# Built by docker-compose.yml. The Next.js UI and wrangler are built into the image so `up` starts fast.

# The UI: a static Next.js export (web/out) that the Worker serves as its assets.
FROM node:22-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

FROM node:22-slim

ENV WRANGLER_SEND_METRICS=false
# workerd refuses to start without system CA certificates.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json ./
RUN npm install --no-audit --no-fund

COPY src ./src
COPY migrations ./migrations
COPY wrangler.toml ./
COPY --from=web /web/out ./web/out
# The collector shares this D1 (collector_runs, ...); its migrations come from the
# `collector` build context in docker-compose.yml.
COPY --from=collector wrangler.toml /collector/wrangler.toml
COPY --from=collector migrations /collector/migrations

EXPOSE 8787
# ADMIN_TOKEN goes to .dev.vars inside the container only, never onto the host.
CMD ["sh", "-c", "printf 'ADMIN_TOKEN=%s\\n' \"$ADMIN_TOKEN\" > .dev.vars && npx wrangler d1 migrations apply DB --local && npx wrangler d1 migrations apply DB --local --config /collector/wrangler.toml --persist-to /app/.wrangler/state && exec npx wrangler dev --ip 0.0.0.0 --port 8787"]
