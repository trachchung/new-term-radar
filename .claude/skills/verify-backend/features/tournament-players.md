# Tournament players

Directors register players into an event, either linking an existing global player, creating a new one, or importing an external one. The event player row carries per-event overrides (VIP, featured, starting chips).

## Sub-features

- `players-add-create` adds a new player with `mode: "create"` and a `profile`.
- `players-add-link` adds an existing global player with `mode: "link"`.
- `players-bulk` adds many players with `POST .../players/bulk`.
- `players-list` pages an event's players.
- `players-update` edits one event player with `PUT /api/v1/tournament/players/:publicId`.
- `players-delete` removes one with `DELETE /api/v1/tournament/players/:publicId`.

## How to get to it (user POV)

- Admin console event page, Players tab: Add player dialog, bulk import, row edit and delete.

## Driving it with control-api

Preconditions: logged in as `admin`, a fresh event `$E` created as in `tournament-events.md`.

- **Add (create mode).** `pnpm control call POST /api/v1/tournament/events/$E/players --role=admin --data='{"mode":"create","startingChips":30000,"profile":{"fullName":"Verify Smoke"}}' 2>/dev/null`. Expect `status: 201`, `body.fullName: "Verify Smoke"`. Save `body.publicId` as `$P`.
- **List.** `pnpm control call GET "/api/v1/tournament/events/$E/players?limit=10" --role=admin 2>/dev/null`. Expect `pagination.totalRecords: 1` and the row with `$P`.
- **Proof.** `select public_id, deleted_at from tournament_players where public_id='$P'` returns one live row.
- **Cleanup.** `DELETE /api/v1/tournament/players/$P` then delete event `$E`.

## Gotchas

- `TmtPlayerResDto` exposes int `tenantId` and `playerId`. This is known debt, frozen in `src/architecture/res-dto-baseline.json`. Do not treat it as a regression, but do flag new int ids.
- Event player `publicId` is a bare UUID, not `evt_`-style prefixed.
- `mode: "link"` needs `playerId` (int) of a global player, which is itself the debt above. Prefer `create` mode for smoke runs.
- Creating a player in `create` mode also inserts a global `players` row, which the event delete does not remove.
