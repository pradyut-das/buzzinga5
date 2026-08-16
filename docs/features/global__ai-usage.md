# Feature: AI Usage

## Overview

Every Gemini call the desk makes is recorded and every account has a spend ceiling. The record is
permanent and covers failures and refusals as well as successful calls, so when a bill looks wrong
there is a source of truth for what was asked, by whom, and what it cost.

Admins read it at `/admin/ai`. Everyone else only ever meets it as a limit message when a cap is
reached.

## User Flows

### Reaching the report

- Sign in with an email listed in `ADMIN_EMAILS`
- Open `/admin` and follow `AI usage →`, or go to `/admin/ai` directly
- Non-admins get a 404, so the page's existence is not advertised
- `7 days` / `30 days` / `90 days` change the window; `JSON` returns the same report for a
  spreadsheet or an external dashboard

### Overview tab

- `Today against the caps` — agency spend against the daily budget, calls used, and the per-user
  cap for reference. The bar turns amber at 80% and red once the cap is reached. Everything resets
  at midnight UTC
- `Window totals` — cost, tokens, calls, and errors/blocked for the chosen window. Estimated spend
  is called out separately from measured spend
- `Daily spend` — one bar per day, scaled to the window's own peak so a normal day is not flattened
  against a single spike. Hover for that day's cost and call count
- `By surface`, `By user`, `By model` — cost, tokens, calls, and errors for each

### Log tab

- The newest 100 calls: when, who, surface, operation, model, status, tokens, cost
- A cost marked `est.` was estimated from session duration or input length rather than measured
- Blocked and failed rows carry the cap that refused them or the error that ended them

### Problems tab

- Errors and refusals only, newest 50, so an incident is visible without filtering the full log
- The tab label carries the count when there is anything to see

### Hitting a limit

- The assistant answers with the limit message instead of a reply; the request is refused, not
  queued
- Per-user caps cover requests per minute, calls per day, tokens per day, and spend per day
- Admins are exempt from the per-user caps. The agency-wide daily caps apply to everyone
- The refusal is recorded in the report as `blocked`, with the cap that fired

### What gets recorded

- `chat` — one row per step of the chat agent's tool loop
- `voice` — one row when a voice session starts, and a correcting row when it ends
- `voice_tool` — one row per tool the voice agent runs, so the report also answers "what changed,
  and who asked for it?"
- `embedding` — one row per block indexed for semantic search

## Notes

- Voice cost is an estimate. Gemini Live streams audio straight to the browser, so no token count
  reaches the server; a session is charged for its 30-minute token lifetime up front and refunded
  down to its real length on hang-up. Charging first means an abandoned session still counts
  against the cap
- Embedding tokens are estimated from input length, because `embedContent` reports no usage on the
  Gemini API path. Treating them as free would understate real spend, since indexing runs on every
  task and comment write
- Prices are list prices and drift with Google's pricing page. Token counts are the measured
  quantity and stay correct regardless
- The ledger is never pruned and survives the deletion of the user it refers to. The rate-limit
  counters behind it are disposable and cleaned up by the notifications cron
- Caps live in the environment, so a compromised session cannot raise them. See ADR
  `global__ai-usage-metering`
