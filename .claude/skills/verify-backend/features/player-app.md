# Player app

The mobile player app API in `backend/src/domains/player-app`. Every route is owner-scoped: the user always comes from the token. Each controller answers on a new path and on its legacy `pokio/*` path (`/me/goals` and `/pokio/goals` hit the same handler). Logout disables the phone's push token, and account deletion purges the user's data.

## Sub-features

- `player-app-alias` new and legacy paths return the same body for the same token.
- `player-app-push-token` `POST /me/push-tokens` registers (upserts) an Expo token, 204.
- `player-app-logout-push` `POST /auth/logout {expoPushToken}` disables that token only. Logging out without a body still works.
- `player-app-account-delete` `DELETE /me/account {confirm: "DELETE"}` scrubs the user and purges personal rows. See `docs/backend/auth.md` "Account deletion" for the full table.

## How to get to it (user POV)

- The mobile app (`pokio/`) still calls the legacy `/pokio/*` paths. New clients use `/me/*`, `/me/push-tokens`, `/tournament-events`, `/feedback`.
- Logout button in the app posts to `/auth/logout` with the cached Expo token.
- Profile, then Delete account, sends `DELETE /pokio/account {confirm: "DELETE"}`.

## Driving it with control-api

Use a throwaway user, not a seed user, because deletion is permanent. Register one with `POST /api/v1/auth/email/register {email, password}` (email `verify-backend-<ts>@example.com`), then log in with `POST /api/v1/auth/email/login` and pass the access token as `Authorization: Bearer`.

- **Alias.** `GET /api/v1/pokio/goals` and `GET /api/v1/me/goals`. Expect the same status and identical bodies. Repeat for `rules`, `notification-prefs`, `home`.
- **Register token.** `POST /api/v1/me/push-tokens {"expoPushToken":"ExponentPushToken[verify-backend]","platform":"IOS"}`. Expect 204. `select disabled_at from device_push_tokens where expo_push_token='ExponentPushToken[verify-backend]'` is null.
- **Logout.** `POST /api/v1/auth/logout {"expoPushToken":"ExponentPushToken[verify-backend]"}`. Expect 200. The same select now has `disabled_reason = 'logout'`. Another token of the same user stays active. The old access token now gets 401.
- **Delete.** Log in again, create a hand with `POST /api/v1/me/hands` and note its `publicId`, then `DELETE /api/v1/me/account {"confirm":"DELETE"}`. Expect 204, then:
  - `GET /api/v1/pokio/hands/share/<publicId>` is 404 (it was 200 before).
  - `bankroll_rules`, `notification_preferences`, `device_push_tokens` have 0 rows for the user id.
  - `users.email` is `deleted+<id>@pokio.invalid`, and `bankroll`, `currency`, `language` are null.
  - Logging in with the old password is 401.
- **Negative.** `DELETE /api/v1/me/account {"confirm":"YES"}` is 422 (the global `ValidationPipe` uses 422; the controller e2e builds its own pipe and sees 400). Any route without a token is 401.

## Gotchas

- `/auth/logout` returns 200, not 204.
- Firebase user deletion is skipped locally when the `FIREBASE_*` vars are unset (no-op, nothing logged). Verify it on dev by deleting a Google sign-in test account and checking the Firebase console.
- `GET /me/notification-prefs` creates default rows on first read, so a fresh user has rows after one GET.
- Deleted users stay in the local DB as scrubbed shells. That is expected, not leftover test data.
