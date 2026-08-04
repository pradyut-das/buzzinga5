# ADR: User Accounts and Sessions on Turso

Own the authentication stack: users, password hashes and sessions are rows in the existing Turso database, accessed with Drizzle. No auth vendor and no extra runtime dependency.

- Turso is a database, not an auth provider — "Turso Auth" only refers to the `TURSO_AUTH_TOKEN` used to reach the database
- Password hashing reuses `src/lib/password-hash.ts` (scrypt), the same primitive board passwords use
- Accounts are **required** to open any board; the board password is a second gate on top, not an alternative to signing in

## Session Strategy

- **Token**: 32 random bytes, base64url, generated per sign-in
- **Storage**: only `sha256(token)` is stored as `sessions.id`, so a leaked database row cannot be replayed as a cookie
- **Cookie**: `session`, HTTP-only, `SameSite=Lax`, `Secure` in production
- **Lifetime**: 30 days, slid forward on read when less than a third remains
- **Expiry**: expired sessions are deleted lazily when read

`getCurrentUser()` is wrapped in React `cache()` so a layout, page and action in the same request share one lookup. It swallows cookie-write failures because Server Components cannot set cookies — the next action or route handler refreshes instead.

## Authorization

`canAccessBoard(boardId)` requires a signed-in user, and then either:

1. board membership, or
2. a valid board password cookie (verified against `boards.passwordHash`, unchanged)

`requireBoardAccess()` throws unless that holds, so every existing server action and route handler picks up the rule without changes. `src/middleware.ts` redirects `/boards/*` requests that carry no session cookie; `BoardsLayout` re-validates the session against the database.

Membership is created when a signed-in user creates a board (role `owner`), unlocks it with the correct password, or opens a board they already hold a valid password cookie for. Membership is never inferred from anything weaker than a successful password check.

## Consequences

### Positive

- One less vendor; sessions and boards live in the same transactional store
- Signed-in users stop re-entering board passwords across devices they have unlocked once
- Every board request has a known actor, which future auditing or per-user permissions can build on

### Negative

- No password reset, email verification, MFA or SSO — those would need building or a vendor
- Session lookup costs one or two extra queries per request on `/boards/*`
- `boards.owner_id` is nullable: boards created before accounts existed have no owner
