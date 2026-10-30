# Event viewer

Public read side that the viewer app (separate `royal-web-app` repo) calls: recent feed of notable hands and busts, feed summaries, and paged hand lists. Output is embargoed by the broadcast delay (`table.delayMinutes ?? event.delayMinutes ?? 0`).

## Sub-features

- `viewer-recent-feed` returns notable hands and busts for an event.
- `viewer-feed-summary` and `viewer-feed-summary-paged` return aggregated feed items.
- `viewer-hands` and `viewer-hands-paged` list hands for an event.
- `viewer-embargo` hides items newer than the effective delay.
- `viewer-announcements` lets staff post an announcement (`POST .../announcements`, auth required).

## How to get to it (user POV)

- Public viewer app event page (Updates feed, Hands tab). No login.

## Driving it with control-api

Preconditions: an event with closed hands. Pick the busiest one:
`E=$(PGPASSWORD=postgres psql -h localhost -U postgres -d postgres -tAc "select e.public_id from tournament_events e join tournament_hands h on h.event_id=e.id where e.deleted_at is null group by e.public_id order by count(*) desc limit 1")`

- **Feed anonymous.** `pnpm control call GET /api/v1/event-viewer/events/$E/recent-feed 2>/dev/null`. Expect `status: 200` and `body[]` items with `kind` such as `notable-hand`.
- **Hands paged.** `pnpm control call GET "/api/v1/event-viewer/events/$E/hands-paged?limit=5" 2>/dev/null`. Expect `status: 200`.
- **New item appears.** `./scripts/dev-post-hand.sh 1 $E` clones the latest hand with `ended_at = now()`. Re-run the feed and hands calls. With `delayMinutes` 0 the new hand shows. With a delay set, it must not show until the delay passes. Run `./scripts/dev-post-hand.sh --clean` afterwards.
- **Proof.** Save before and after responses and the `dev-post-hand.sh` output.

## Gotchas

- `dev-post-hand.sh` writes straight to the DB and bypasses domain rules. Local only. Always `--clean`.
- Feed item `id`s are strings like `bigpot:<uuid>`, not int ids.
- Responses are cached. If a change does not show, check `src/shared/cache` TTLs before calling it a bug.
- Live updates also go over Socket.IO (`src/ws-gateway/event-viewer.gateway.ts`). This recipe covers only HTTP.
