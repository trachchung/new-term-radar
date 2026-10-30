# Backend verification map

Maintained source for verifying the user-facing HTTP behavior of the Fullring backend. Read this index first, then open the feature file that matches the change.

## Baseline preconditions

- `pnpm control doctor 2>/dev/null` from `backend/` reports postgres, redis, api reachable, migrations up to date.
- API is the local monolith on `http://localhost:3000` (`MODULES_SET=monolith`). Never a staging or production URL.
- Local DB is seeded (seed users from `prisma/seed-scripts/data/users.json` log in). `pnpm control login --role=admin` returns `ok: true`.
- Evidence dir created: `mkdir -p .control-api/evidence/$(date +%Y%m%d-%H%M)-<topic>`.

## Driving conventions

- All calls go through `pnpm control call <METHOD> <path> [--role=] [--data=]`. Anonymous = omit `--role`.
- Discover the exact route and DTO names from `curl -s localhost:3000/api-docs-json` instead of guessing.
- Name every row you create with the prefix `verify-backend` and write its `publicId` to the evidence dir.
- DB reads use `PGPASSWORD=postgres psql -h localhost -U postgres -d postgres -tAc`. Only `SELECT`.
- Soft-delete what you created through the API when done.

## Proof and skip reporting

- A proof has three parts: the request/response JSON, a follow-up read (GET or `SELECT`) showing the new state, and the role/anonymous negative case when auth is involved.
- Record the feature ID and route with every artifact.
- If a precondition cannot be met (no seeded hands, worker not running), report the attempted command and the unmet precondition. Do not report it as verified through a different route.

## Features

| ID | File | Routes |
| --- | --- | --- |
| auth | [auth.md](auth.md) | `/api/v1/auth/*` |
| tournament-events | [tournament-events.md](tournament-events.md) | `/api/v1/tournament/events*` |
| tournament-players | [tournament-players.md](tournament-players.md) | `/api/v1/tournament/events/:id/players`, `/api/v1/tournament/players/*` |
| event-viewer | [event-viewer.md](event-viewer.md) | `/api/v1/event-viewer/events/:id/*` |
| player-app | [player-app.md](player-app.md) | `/api/v1/me/*` (legacy `/api/v1/pokio/*`), `/api/v1/auth/logout` |
| hands | [hands.md](hands.md) | `/api/v1/tournament/tables/:id/hands`, `/api/v1/tournament/hands/*` |

Not yet mapped (add a file when you touch them): seats, tables, levels, payouts, winners, campaigns, series, series-groups, editorial-posts, event-photos, faces, tracker-scope-shifts, players (global `/api/v1/players`), post, news-feeds, notifications, files, share-preview, WebSocket gateway (`ws-gateway/event-viewer.gateway.ts`).

## Feature entry contract

Each feature file has an H1, one paragraph on the behavior, then exactly these H2s in order: `Sub-features`, `How to get to it (user POV)`, `Driving it with control-api`, `Gotchas`.
