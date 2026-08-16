# QA Findings

Session 1 — priority areas: auth/admin authorization, AI usage metering.

**Status: all three findings below are fixed.** The fix persists the voice-session reservation
(`ai_voice_sessions`, migration `0013_peaceful_giant_girl.sql`) so a settlement can be checked
against a real charge, and puts the settlement endpoint under `checkAiLimits`. The three specs in
`playwright/ai-voice-settlement.spec.ts` now pass; re-running the original 43-request drain leaves
zero ledger rows and zero counter rows where it previously left −$193.50.

Environment: production build against a clean `test.db`, `PLAYWRIGHT_TEST=true`, port 5800.
`ADMIN_EMAILS` unset, so every test account is a non-admin. No real model calls were made —
every finding below is reached through routes that write to the ledger without calling Gemini.

Regression specs: `playwright/ai-voice-settlement.spec.ts` (3 tests). Each failed against the
code as found and passes against the fix, so each one pins a specific defect below.

Findings are recorded as they were observed before the fix; see "The fix" at the end.

---

### [S1 — FIXED] Voice settlement mints spend credit for any signed-in account

**Where:** `src/app/api/agent/voice-usage/route.ts:47-84`

**Repro:** from a clean db, against a running server:

1. Sign up any account (no admin rights, no board membership needed).
2. `POST /api/agent/voice-usage` with `{"sessionId": "never-issued", "durationMs": 0}`.
3. Repeat. Never call `POST /api/agent/session` at all.

**Expected:** ADR `global__ai-usage-metering` states the invariant this route is built on —
"the refund is clamped to what was charged, so a client that lies about its duration can only
ever give money back — never mint credit for itself." A settlement for a session that was never
granted has no charge behind it and must be refused.

**Actual:** every call returns `200 {"ok":true,"refundMicroUsd":1500000}` and writes a
`-1500000` micro-USD ledger row. `sessionId` is accepted as any non-empty string; it is never
persisted at grant time (`session/route.ts:88` mints a bare `crypto.randomUUID()` and returns it
without storing it), so the route has nothing to validate against and does not try.

Measured over 129 requests from two ordinary accounts, in roughly one minute:

```
ledger: {"n":129,"s":-193500000}
{"subject":"global","window":"day","calls":129,"cost_micro_usd":-193500000}
{"subject":"user:d774...","window":"day","calls":120,"cost_micro_usd":-180000000}
```

**Impact:** the clamp is relative to a charge that is never verified, so each call is a free
$1.50 credit. It lands in `ai_usage_counters`, which is the store `checkAiLimits` reads, so it
directly buys headroom under every USD cap:

- `AI_USER_USD_PER_DAY` ($5 default) — the account above must now spend $185 of real budget
  before its own cap fires.
- `AI_GLOBAL_USD_PER_DAY` ($50 default) — the cap the ADR calls "the last line between a bug and
  the bill", and which binds admins too. It sat at −$193.50 after one minute of requests from two
  accounts. Any signed-in user can disable the agency-wide spend ceiling for the remainder of the
  UTC day, and repeat it every day.

The ledger is also corrupted as an audit record: it is the documented source of truth for "what
did we actually spend", and it now shows a large negative balance for spend that never occurred.

Ceiling: bounded only by the call-count caps, which this route does not enforce either (see S2).
At $1.50 per call and 1000 calls/user/day, one account manufactures ~$1,500/day of global
headroom; more accounts scale it linearly.

**Suspected cause:** the up-front charge in `session/route.ts` and the refund in
`voice-usage/route.ts` are not tied together by any stored record. The reservation is never
persisted, so settlement cannot check that one exists, that it belongs to the caller, or that it
has not already been settled. Confirmed by reproduction, not merely by reading.

---

### [S1 — FIXED] Voice settlement bypasses the metering wrapper, so no cap applies to it

**Where:** `src/app/api/agent/voice-usage/route.ts:57-82`

**Repro:** as above; issue 40 settlement calls in under a minute from one account.

**Expected:** ADR `global__ai-usage-metering` — "One wrapper, no exceptions. `meterAiCall` in
`src/lib/ai/meter.ts` is the only way to reach a model. It checks the caps, runs the call, and
records it." `AI_USER_CALLS_PER_MINUTE` defaults to 30.

**Actual:** 120/120 calls returned 200, none refused. Counter state shows 85 calls inside a
single minute bucket against a cap of 30:

```
{"subject":"user:d774...","window":"minute","calls":85,"cost_micro_usd":-127500000}
```

The route calls `recordAiUsage` directly and never calls `checkAiLimits` or `meterAiCall`.

**Impact:** an unmetered, unauthenticated-by-session write endpoint that moves the same counters
every cap is read from. This is what makes S1 unbounded rather than a one-off $1.50: with the
rate cap enforced, the drain would be limited to 30 calls/minute; without it, it is limited only
by request throughput. It is also the exact failure mode the ADR's "metered by construction"
decision exists to prevent, which suggests the same gap could recur at the next call site added
outside the wrapper.

**Note on the ADR's own framing:** this route is arguably not "reaching a model" — it records a
correction rather than making a call — so a reader could defend it as out of scope for
`meterAiCall`. I believe the ADR is right and the code is wrong: the rule that matters is that
anything moving the counters passes the caps, and this route moves the counters. If the intent
was genuinely to exempt settlement, the ADR should say so explicitly, because as written it
promises "no exceptions".

---

### [S4 — FIXED] `formatUsd` renders negative and sub-cent amounts poorly

**Where:** `src/lib/ai/pricing.ts:70-75`

**Repro:** `formatUsd(-1500000)` → `"$-1.5000"`; `formatUsd(5)` → `"$0.0000"`.

**Expected:** conventional currency formatting places the sign before the symbol (`-$1.50`), and
the `< 0.01` branch exists to avoid showing a real cost as zero.

**Actual:** negatives take the `usd < 0.01` branch, so a $1.50 refund renders as `$-1.5000`— the
sign misplaced and four decimals shown for a round amount. Separately, a genuinely tiny cost
formats as`$0.0000`, which reads as free.

**Impact:** cosmetic, confined to the admin report. Worth noting only because refunds are a real
code path (the settlement rows above), so negative amounts do reach this function and will appear
in `/admin/ai`.

**Confidence:** verified directly against the function; the rendering path into the panel was not
separately exercised.

---

## Areas checked and found sound

- **Admin action authorization** — all 24 exported server actions in `src/actions/admin.ts` call
  `requireAdmin()` as their first statement. Verified by enumeration, not sampling. `requireAdmin`
  resolves the allowlist from `ADMIN_EMAILS` per call and throws otherwise; the set cannot be
  changed through the app. No gap between what the UI hides and what the server enforces.
- **Admin page and JSON-report access** — `/admin/ai` and `/api/admin/ai-usage` both resolve the
  admin server-side and 404 rather than 403. Already covered by `playwright/admin-console.spec.ts`
  and `playwright/ai-usage.spec.ts`; I re-read both and did not find a gap worth a new spec.
- **Pricing math** (`src/lib/ai/pricing.ts`) — longest-prefix model matching resolves correctly
  including dated ids; the unknown-model fallback is the expensive price, so no model is ever
  free; cached tokens are clamped to the prompt count and billed as a subset rather than added on
  top; costs stay whole integers in micro-USD. Probed directly, including empty model id and
  `cachedTokens > promptTokens`.
- **Voice settlement, unauthenticated** — correctly 401s. The defects above all require a valid
  session; they are privilege-preserving, not authentication bypasses.

## Not covered this session

Columns/tasks, comments/mentions, contributors/stakeholders, clients/docs, search, the AI agent
chat and tool round-trip, email notifications, local-first/offline reconciliation, and the
cross-cutting pass (dark mode, mobile, keyboard, security headers, env validation). Areas 1 and 2
(auth/accounts and board unlock) were read but not probed beyond what the existing specs cover —
I went at metering and admin authorization first and did not reach them.

---

## The fix

**`src/db/schema.ts` + `drizzle/0013_peaceful_giant_girl.sql`** — new `ai_voice_sessions` table
holding the reservation: id, owner, micro-USD charged, and a nullable `settled_at`. Additive
migration, no existing table touched.

**`src/app/api/agent/session/route.ts`** — the up-front charge now writes that row before the
ledger entry, so the grant leaves evidence the settlement can be checked against. This is the
root cause of the first finding: the id existed only in the response body.

**`src/app/api/agent/voice-usage/route.ts`** — settlement now:

1. runs `checkAiLimits` first, so the endpoint is capped like every other metered call (S2);
2. claims the reservation with a conditional `UPDATE ... WHERE id = ? AND user_id = ? AND
settled_at IS NULL ... RETURNING`. The conditional update is the lock — two concurrent posts
   for the same session both run it, but only one flips `settled_at` from null and gets a row
   back, so a replay cannot be paid twice without a transaction;
3. answers unknown id, wrong owner, and already-settled identically (`400 No session to settle.`),
   so a caller probing for real session ids learns nothing from the response;
4. clamps the refund to `chargedMicroUsd` as well as to the duration, so a rate change between
   grant and settlement can never refund more than the session actually paid.

**`src/lib/ai/pricing.ts`** — `formatUsd` formats sign and magnitude separately: `-$1.50`, not
`$-1.5000`. The sub-cent four-decimal branch is unchanged.

### Verification

- `playwright/ai-voice-settlement.spec.ts` — 3/3 pass (all three failed before the fix).
- Re-ran the original drain, 43 forged settlements from a fresh account: `ai_usage` 0 rows,
  `ai_usage_counters` 0 rows, 0 negative counter rows. Before the fix the same shape of run left
  the global day counter at −$193,500,000 micro-USD.
- `pnpm lint` — 0 errors, types clean. The 7 remaining warnings are pre-existing and live in
  `caption-studio.tsx`, `task-workspace.ts` and `verify-notifications.ts`; none are in changed
  files.
- `pnpm test` — 20 passed, against a baseline of 7 passed on a stash of these changes. The suite
  has substantial pre-existing failures (`accounts.spec.ts` and most UI specs time out on this
  working tree); they are unrelated to metering and were failing before this work. The AI and
  admin specs are not among them.
