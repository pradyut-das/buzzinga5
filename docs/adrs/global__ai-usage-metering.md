# ADR: AI Usage Metering

Every model call passes through one metered wrapper that enforces spend caps before the call and
writes an immutable ledger row after it — including when the call fails or is refused.

## Context

Four surfaces spend Gemini tokens: the chat route's tool loop, the Live voice session, block
embeddings, and voice tool calls. Nothing recorded what any of them cost. A leaked key, a runaway
tool loop, or an indexing job triggered on every write could all have spent unbounded money with no
record of what happened or on whose behalf.

Two questions needed answering, and they pull in different directions. _"Are we about to
overspend?"_ has to be answered before every call and must stay fast as usage grows. _"What
actually happened?"_ is asked once, after something has already gone wrong, and needs the complete
history.

## Decision

**One wrapper, no exceptions.** `meterAiCall` in `src/lib/ai/meter.ts` is the only way to reach a
model. It checks the caps, runs the call, and records it. New call sites are metered by
construction rather than by remembering — the same reason the agent has one tool registry.

**Two stores, different jobs.** `ai_usage` is append-only and never pruned: it is the source of
truth when spend looks wrong. `ai_usage_counters` holds (subject, window, bucket) rows so a limit
check is a single indexed read; aggregating the ledger for that would get slower exactly as usage
grows. Counters are pruned by the notifications cron; the ledger is not.

**Record failures and refusals too.** A call that errored still cost money if the provider did the
work, and a run of errors is the shape of an incident. A blocked call spent nothing but explains a
gap. Without those rows, a broken API key looks identical to an idle day.

**The ledger outlives its subjects.** `user_id` and `user_email` are plain columns, not foreign
keys. Deleting an account must not erase the evidence of what that account spent.

**Integer micro-USD.** Costs are whole millionths of a dollar, never floats. A month of
floating-point accumulation would not tie out against a bill.

**Fail closed.** If the counter read itself throws, the call is refused. A database that cannot
answer "how much have we spent?" is exactly when unbounded spend is most dangerous.

**Admins are exempt from per-user caps, never the global ones.** Admins operate the console and get
asked to reproduce problems; the per-user caps would obstruct the person diagnosing them. The
global daily caps bind everyone, because they are the last line between a bug and the bill.

**Estimates are labelled, never disguised.** Gemini Live streams audio to the browser and
`embedContent` returns no token usage on the Gemini API path, so neither can be measured
server-side. Both are estimated and flagged `estimated`, and the report shows estimated spend
apart from measured spend.

## Consequences

- Adding a model call means calling `meterAiCall`; a call that bypasses it is invisible to both the
  budget and the audit trail.
- The chat loop is metered per step, not per request. A six-step tool loop is six ledger rows, so a
  loop that runs away trips the cap on the step that crosses it rather than after the whole request
  is already paid for.
- Caps are pre-flight and approximate: the cost of the call about to run is unknown until it
  returns, so a caller just under a cap is allowed through and the overshoot lands in the next
  check. Spend is bounded within one call's worth, which is what a budget needs.
- Voice sessions are charged for the token's full 30-minute lifetime up front and refunded down to
  their real duration on hang-up. Charging first means an abandoned session still counts; the
  refund is clamped to what was charged, so a client that lies about its duration can only ever
  give money back.
- Blocked calls do not advance the counters. Counting them would let a client that keeps retrying a
  refused request push its own limit further out.
- Prices in `src/lib/ai/pricing.ts` are list prices and drift with the provider's pricing page.
  They make spend visible and enforce budgets; they do not reproduce an invoice. `total_tokens` is
  the measured quantity and survives any repricing.
- A failed ledger write is logged and swallowed. Losing one row of accounting is a smaller harm
  than refusing a request the user is entitled to make.

## Cheatsheet

```ts
// Every model call. Caps enforced, ledger row written, failures recorded.
const response = await meterAiCall(
  { subject, surface: "chat", operation: "generateContent", model, detail: { step } },
  () => ai.models.generateContent({ model, contents, config }),
  countsFromResponse,
);
```

`AiLimitError` means a cap refused the call — surface it as a `429` with the error's own message,
which is worded for the person who hit it and never leaks the global budget.

## Caps

All optional; each falls back to a safe default in `src/lib/ai/limits.ts`, so an unset value means
"use the default cap", never "no cap".

| Variable                   | Default | Bounds                               |
| -------------------------- | ------- | ------------------------------------ |
| `AI_USER_CALLS_PER_MINUTE` | 30      | One user's burst rate                |
| `AI_USER_CALLS_PER_DAY`    | 1000    | One user's daily calls               |
| `AI_USER_TOKENS_PER_DAY`   | 2000000 | One user's daily tokens              |
| `AI_USER_USD_PER_DAY`      | 5       | One user's daily spend               |
| `AI_GLOBAL_CALLS_PER_DAY`  | 20000   | Everyone, admins included            |
| `AI_GLOBAL_USD_PER_DAY`    | 50      | Everyone, admins included            |
| `AI_VOICE_USD_PER_MINUTE`  | 0.05    | Estimated Live rate per audio minute |
