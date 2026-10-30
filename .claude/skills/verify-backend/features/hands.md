# Hands

Trackers deal and record hands at a table: start a hand, post actions, close it, and correct it afterwards. Closing a hand updates stacks and emits events that feed the viewer and PRM.

## Sub-features

- `hands-deal-readiness` checks whether a table can start a hand.
- `hands-start` starts a hand at a table (`POST /api/v1/tournament/tables/:tablePublicId/hands`).
- `hands-current` reads the table's current hand.
- `hands-state` and `hands-replay` read hand state and replay.
- `hands-close` closes a hand (`POST /api/v1/tournament/hands/:publicId/close`).
- `hands-correction` edits a closed hand (`PUT /api/v1/tournament/hands/:publicId/correction`).
- `hands-lineup` returns the felt rendering projection (`GET .../hand-lineup`, auth optional).

## How to get to it (user POV)

- Tracker console table screen: Deal button, action pad, Close hand, Correction dialog.

## Driving it with control-api

Preconditions: logged in as `tracker` or `admin`. A table with seated players. Find one:
`PGPASSWORD=postgres psql -h localhost -U postgres -d postgres -tAc "select t.public_id from tournament_event_tables t join tournament_events e on e.id=t.event_id where e.deleted_at is null order by t.updated_at desc limit 5"`

- **Readiness.** `pnpm control call GET /api/v1/tournament/tables/$T/deal-readiness --role=tracker 2>/dev/null`. Read the reasons if it is not ready.
- **Current hand.** `pnpm control call GET /api/v1/tournament/tables/$T/hands/current --role=tracker 2>/dev/null`.
- **Lineup anonymous.** `pnpm control call GET /api/v1/tournament/tables/$T/hand-lineup 2>/dev/null`. Expect `status: 200`.
- **Start.** Read the request schema first: `TmtCreateHandReqDto` in `/api-docs-json`. Then `POST /api/v1/tournament/tables/$T/hands`. Expect `201` and a hand `publicId`.
- **Proof.** `select public_id, status from tournament_hands where public_id='<hand>'` plus the `hands/:publicId/state` response.

Scripted end-to-end (throwaway event, level, table, 3 seated players, deal, then UTG call and SB call to reach the BB option):

```bash
EV=$PWD/.control-api/evidence/$(date +%Y%m%d-%H%M)-hands
../.claude/skills/verify-backend/scripts/hand-state-probe.sh $EV       # deal + GET /state
../.claude/skills/verify-backend/scripts/hand-state-bb-option.sh $EV   # BB option: allowedActions must be [fold, all_in, check, raise]
```

Cleanup: `DELETE /api/v1/tournament/hands/$(cat $EV/hand.txt)` then `DELETE /api/v1/tournament/events/$(cat $EV/event.txt)`.

## Gotchas

- Starting and closing hands mutates stacks, seats, and PRM state and emits BullMQ jobs. Use a throwaway event built for the run (create event, add players, create table, seat them) rather than a seeded event you care about.
- Closing triggers async work. Check `.control-api/api.log` for consumer errors, not only the HTTP status.
- Hand state has one engine: `HandLiveStateService` (Redis key `fr:hand:<id>:live`, rebuilt from Postgres on miss). The old `fr:hand:state:<id>` key and `HandStateService` were removed on 2026-09-27.
- The deal response omits `handState` (the `@Exclude` DTO drops the ad-hoc field). The tracker FE reads it via WS broadcast and `GET /hands/:id/state`, so assert there.
- Create-table requires int `tenantId` and seats require int `playerId` (debt in the baseline). The probe script reads them from earlier responses.
