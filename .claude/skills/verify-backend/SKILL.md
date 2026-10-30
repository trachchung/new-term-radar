---
name: verify-backend
description: Drive the Fullring NestJS backend (backend/) over its real HTTP API on localhost to prove a backend change works. Use after editing controllers, services, DTOs, guards, or Prisma queries, before claiming a backend fix or refactor is done, or when asked to "verify the API", "smoke test backend", or "check the endpoint".
---

# verify-backend

Proves backend behavior through the real HTTP surface (Fastify on `localhost:3000`, prefix `/api/v1`) with the repo's own harness `backend/scripts/control-api.ts` (`pnpm control <cmd>`). Every command prints one JSON object and exits non-zero on failure, so branch on `ok`.

Unit specs (`pnpm test`) and `pnpm arch` prove code. This skill proves the running app. Do both.

All commands below run from `backend/`. Filter pnpm noise with `2>/dev/null` (pnpm prints a `WARN` about `pnpm.overrides` on stderr).

## Launch

1. Infra: Postgres 16 (`postgres_db`, :5432) and Redis (`:6379`, password `redispass`) from `backend/docker-compose.yml`. If `doctor` says they are down: `pnpm control up` (compose up, prisma generate, migrate deploy). Add `--seed=full` only on an empty DB.
2. Pending migrations: `doctor` reports `migrations.upToDate`. If false, `pnpm migration:up` (local DB only, `DATABASE_URL` in `backend/.env` must be `localhost`).
3. API: check first whether one is already running (`ss -ltnp | grep :3000`). If the user already has `pnpm start:dev` up, reuse it and do not start a second one. Otherwise:
   ```bash
   mkdir -p .control-api/evidence
   nohup pnpm start:dev > .control-api/api.log 2>&1 & echo $! > .control-api/api.pid
   ```
   Ready when `.control-api/api.log` contains `Nest application successfully started` (about 15 s). `MODULES_SET=monolith` in `.env` loads every module.

Only one API can bind :3000. For a second instance set `APP_PORT=3001` in the environment and `CONTROL_API_URL=http://localhost:3001` for the harness. Both share the same DB and Redis, so BullMQ workers of both consume the same queues. Prefer one instance.

## Doctor

```bash
pnpm control doctor 2>/dev/null
```

Worth driving when `checks.postgres.ok`, `checks.redis.ok`, `checks.api.reachable` are all true and `checks.migrations.upToDate` is true. `api.body` showing `"error": "Not Found"` is normal (the health probe hits a path without the prefix, reachability is what matters).

Tokens: `pnpm control login --role=<role>` logs in as the seeded user from `prisma/seed-scripts/data/users.json` and caches the JWT in `.control-api/tokens.json`. Roles: `admin`, `tournament_director`, `club_owner`, `media`, `tracker`, `player`. A 401 on `call` means the token expired: log in again.

## Drive

```bash
pnpm control call <METHOD> <path> [--role=<role>] [--data='<json>'] 2>/dev/null
```

- Omit `--role` to hit the endpoint anonymously (tests `@ApiPublic` / `@AuthOptional` posture).
- Path includes the prefix: `/api/v1/tournament/events`.
- Find routes and DTO names from the live OpenAPI doc: `curl -s localhost:3000/api-docs-json`. Example, list one controller's paths:
  ```bash
  curl -s localhost:3000/api-docs-json | python3 -c "import json,sys;[print(p,list(m)) for p,m in json.load(sys.stdin)['paths'].items() if 'tournament/events' in p]"
  ```
- Required request fields: read `components.schemas.<ReqDto>.required` from the same doc.

Response-shape checks (the DTO allow-list rule in CLAUDE.md):

```bash
pnpm control contract <path> <ResDtoName> --role=admin 2>/dev/null   # live body vs declared schema; missingRequired = dropped @Expose
pnpm control spec 2>/dev/null                                        # OpenAPI paths/fields vs saved baseline
pnpm control spec --save 2>/dev/null                                 # re-baseline, only after an intended API change
```

`contract` needs the schema name as it appears in OpenAPI (for example `TmtEventResDto`, not `EventResDto`). On a miss it prints nearby names.

DB side effects (read-only): `PGPASSWORD=postgres psql -h localhost -U postgres -d postgres -tAc "<SELECT>"`. Tables are snake_case (`tournament_events`, `tournament_hands`, `tournament_players`). Match on `public_id`.

Feature recipes live in `features/`. Start at `features/README.md`.

## Evidence

Save proof under `backend/.control-api/evidence/<YYYYmmdd-HHMM>-<topic>/` (gitignored, survives cleanup):

- `*.json`: the raw `pnpm control` output for each step (request, status, body).
- `db.txt`: the `SELECT` output that shows the side effect.
- `api.log` excerpt when behavior involves workers, events, or errors.

Proof standards:
- Hit the real route with the real role. No calling services directly, no test-only endpoints.
- Capture the action and the resulting state: the POST/PUT response and a follow-up GET or DB row.
- Check side effects (row inserted, `deleted_at` set, audit row, queue job) not only the status code.
- For auth changes, prove both sides: allowed role gets 2xx, disallowed role or anonymous gets 401/403.
- For DTO changes, run `contract` and check the body has no int `id` / `*Id` field that should be `publicId`.

## Cleanup

- Delete only what this run created. Record every created `publicId` in the evidence dir as you go, then soft-delete through the API (`pnpm control call DELETE /api/v1/tournament/events/<publicId> --role=admin`). Name created rows with the prefix `verify-backend` so leftovers are findable:
  ```bash
  PGPASSWORD=postgres psql -h localhost -U postgres -d postgres -tAc "select public_id from tournament_events where name like 'verify-backend%' and deleted_at is null"
  ```
- Stop the API only if this run started it: `kill $(cat .control-api/api.pid)` (nest's watcher spawns a child, so also `pkill -P $(cat .control-api/api.pid)` before it). Never `pkill node` and never use `kill3000.sh` / `kill-node-process.sh`: they kill the user's own processes.
- Leave Postgres and Redis running. Never run `pnpm db:drop`.
- Evidence dirs stay.

## Never

- Point `CONTROL_API_URL` or `DATABASE_URL` at staging or production. This skill writes data.
- Run lint, prettier, or format as part of verification.
