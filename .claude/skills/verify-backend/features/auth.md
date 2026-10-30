# Auth

Email/password login returns a JWT that every authenticated route accepts. `AuthGuard` is global, so a missing or bad token gets 401 and a valid token with the wrong role gets 403.

## Sub-features

- `auth-login` exchanges seeded email and password for an access token.
- `auth-me` returns the current user profile for a token.
- `auth-guard` rejects anonymous calls to `@ApiAuth` routes with 401.
- `auth-roles` rejects a valid token whose role is not in the route's `roles` with 403.

## How to get to it (user POV)

- Admin console login form posts to `POST /api/v1/auth/email/login`.
- Every page load calls `GET /api/v1/auth/me`.
- Mobile apps use `POST /api/v1/auth/firebase` and `/api/v1/auth/phone/*` (not covered here, needs Firebase and OTP).

## Driving it with control-api

- **Login.** `pnpm control login --role=admin 2>/dev/null`. Expect `ok: true`, `email: admin@fullring.io`.
- **Me.** `pnpm control call GET /api/v1/auth/me --role=admin 2>/dev/null`. Expect `status: 200`. Then `pnpm control contract /api/v1/auth/me MeResDto --role=admin 2>/dev/null` and expect `missingRequired: []`.
- **Anonymous.** `pnpm control call POST /api/v1/tournament/events --data='{"name":"verify-backend anon"}' 2>/dev/null`. Expect `status: 401`.
- **Wrong role.** `pnpm control login --role=tracker 2>/dev/null` then `pnpm control call POST /api/v1/tournament/events --role=tracker --data='{"name":"verify-backend forbidden"}' 2>/dev/null`. Expect `status: 403`, `message: Forbidden`.
- **Proof.** Save the four outputs to the evidence dir. Confirm no `verify-backend anon` / `verify-backend forbidden` row exists: `select count(*) from tournament_events where name in ('verify-backend anon','verify-backend forbidden')` returns `0`.

## Gotchas

- Tokens cache in `.control-api/tokens.json` and expire. A 401 on a call that worked earlier means log in again, not an auth bug.
- `users.json` holds several users per role. `login` uses the first one of each role.
- `MeResDto` optional fields (`bankroll`, `currency`, `language`, `onboardedAt`) are absent when null. `contract` lists them under `absentOptional`, which is not a failure.
