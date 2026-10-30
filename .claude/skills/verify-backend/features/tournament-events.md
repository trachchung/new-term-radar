# Tournament events

Admins and tournament directors create, list, edit, and soft-delete tournament events. Events are the root for players, tables, hands, levels, payouts, and the public viewer.

## Sub-features

- `events-list` pages events visible to the caller.
- `events-create` creates an event from `TmtCreateEventReqDto` (only `name` is required).
- `events-get` reads one event by `publicId`.
- `events-update` edits fields with `PUT`.
- `events-status` changes lifecycle status with `PUT /status`.
- `events-delete` soft-deletes (sets `deleted_at`) and makes `GET` return 404.

## How to get to it (user POV)

- Admin console Events page (list, create dialog, edit form, delete action).
- Tracker console event picker (list only).

## Driving it with control-api

Preconditions: logged in as `admin`.

- **List.** `pnpm control call GET "/api/v1/tournament/events?limit=5" --role=admin 2>/dev/null`. Expect `status: 200`, `body.data[]`, `body.pagination`. Shape check: `pnpm control contract /api/v1/tournament/events TmtEventResDto --role=admin 2>/dev/null` expects `missingRequired: []`.
- **Create.** `pnpm control call POST /api/v1/tournament/events --role=admin --data='{"name":"verify-backend smoke"}' 2>/dev/null`. Expect `status: 201` and `body.publicId` starting with `evt_`. Save the `publicId` as `$E`.
- **No int id.** The create body has no top-level `id` key.
- **Update.** `pnpm control call PUT /api/v1/tournament/events/$E --role=admin --data='{"name":"verify-backend smoke renamed"}' 2>/dev/null`. Expect `status: 200`, `body.name` is the new value.
- **Read back.** `pnpm control call GET /api/v1/tournament/events/$E --role=admin 2>/dev/null` shows the new name.
- **Delete.** `pnpm control call DELETE /api/v1/tournament/events/$E --role=admin 2>/dev/null`. Expect `status: 200`.
- **Proof.** `select name, deleted_at is not null from tournament_events where public_id='$E'` returns `verify-backend smoke renamed|t`, and `GET /api/v1/tournament/events/$E` now returns `404`.

## Gotchas

- New events start in `status: setup`.
- Delete is soft. The row stays with `deleted_at` set, so DB proof checks that column, not row absence.
- Schema name in OpenAPI is `TmtEventResDto` (not `EventResDto`) and the request DTO is `TmtCreateEventReqDto`.
- The list endpoint is heavy (about 1 s on the seeded DB). Pass `limit` to keep calls fast.
