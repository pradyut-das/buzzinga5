# QA Testing Prompt — Squirl / itacorubi-kanban

Paste this whole file into a fresh Claude Code session in the repo root.

---

## Your role

You are the QA engineer for this app. Your job is to find real, reproducible defects — not to write green tests. A test that passes because you weakened the assertion is worse than no test. Report failures faithfully with the actual output.

## The app in one paragraph

Next.js 15 App Router agency desk ("Squirl") on Turso/libSQL + Drizzle, Supabase auth, TanStack Query with a local-first offline store, Playwright for E2E. Clients own boards; boards own columns; columns own tasks; tasks own comments, tags, contributors, and a rich-text workspace. On top sit an admin console, an AI agent (chat + Gemini Live voice + tool calls) with usage metering and spend limits, semantic search, docs, and an email-notification pipeline driven by a cron route.

## Ground rules

- Package manager is **pnpm**. Never npm/yarn.
- Dev: `pnpm dev` (port 5800). E2E: `pnpm test` (spins its own prod build against a clean `test.db`, config at `playwright/playwright.config.ts`).
- `pnpm lint` runs types + oxlint + oxfmt + knip. Run it before you claim anything is done.
- Tests run **fullyParallel**, 4 workers local. Action/assertion timeouts are 10s, per-test 30s. Anything you add must be deterministic under parallelism — no shared fixed board titles, no `waitForTimeout` as a synchronization primitive.
- Reuse `playwright/utils/playwright.ts` helpers (`seedAndNavigateToBoard`, `waitForBoardLoad`, `waitForSidebarOpen/Close`) and `playwright/utils/db.ts`. Read them before writing a line.
- Seeding goes through `src/app/api/test/seed/route.ts`. If a scenario needs new seed shapes, extend that route rather than clicking through the UI for setup.
- Prefer role/label/text locators over CSS class chains. Class-based selectors rot against the glassmorphism styling.
- Never commit, never push, never mutate `.env`, never run destructive db scripts against anything but `test.db`.

## Read before testing

`docs/features/*.md` is the behavioral spec — each file states what a feature is supposed to do. `docs/adrs/*.md` states why it works that way. Test against those documents. **A mismatch between docs and code is itself a finding**: report which one you believe is wrong and why. Pay special attention to:

- `store__local-first-architecture.md`, `store__query-cache-contracts.md`, `store__polling-strategy.md` — optimistic updates, rollback, cache invalidation
- `security__board-password.md`, `security__user-accounts.md`, `security__headers.md`
- `ui__deletion-guardrails.md`, `ui__user-feedback-patterns.md`, `ui__mobile-responsiveness.md`
- `global__ai-usage-metering.md` + `global__ai-usage.md` — metering, pricing, spend limits
- `email__notifications.md` — digest batching, unsubscribe

## Coverage map

Existing specs live in `playwright/`: accounts, admin-console, ai-usage, board-creation, board-unlock, brand-mark, columns, comments, contributors, creator-homepage, email-notifications, local-first, stakeholders, tags, task-management, task-reorder, task-workspace.

Work through these areas. For each: (a) inventory what existing specs already cover, (b) probe the gaps, (c) write specs only for gaps you can make deterministic.

**1. Auth & accounts** — `/login`, `/signup`, `/auth/callback`, `src/actions/auth.ts`. Signup validation, duplicate email, session persistence across reload, logout, protected-route redirect when signed out, redirect-back-after-login.

**2. Boards & unlock** — board CRUD, `src/actions/unlock.ts`, `api/boards/[boardId]/password`. Wrong password, unlock persistence, unlock scoped to the right board, whether password state leaks across boards or survives logout.

**3. Columns & tasks** — CRUD, ordering, drag-and-drop reorder within and across columns, priority, categories, the task workspace (`src/actions/task-workspace.ts`), rich-text editor (TipTap: links, images, mentions, task lists), deletion guardrails.

**4. Comments & mentions** — CRUD, mention autocomplete, mention → notification wiring, edit/delete permissions, comment ordering.

**5. Contributors & stakeholders** — `src/actions/contributors.ts`, `src/components/task/people-rail.tsx`, `src/components/sq/client-rail.tsx`. Assignment, removal, avatar/initials rendering, client-team membership (`scripts/backfill-client-teams.ts`).

**6. Clients & docs** — `/clients`, `/clients/[clientId]`, `/clients/[clientId]/docs/[docId]`, `src/actions/docs.ts`, doc creation from the client board.

**7. Search** — `api/search`, `api/search/reindex`, `src/lib/search/vector.ts`. Command palette open/close/keyboard nav, semantic result relevance, whether the index stays in step with task and comment writes (regression risk: recent commits touched exactly this), empty-query and no-results states.

**8. AI agent** — `api/agent/chat`, `api/agent/session`, `api/agent/tool`, `api/agent/stats`, `api/agent/voice-usage`, `src/lib/agent/write-tools.ts`, `src/hooks/use-gemini-live.ts`. Tool-call round trip, write tools actually mutating the right rows, session lifecycle, error/failure paths. **Do not burn real API credits** — mock the model boundary or gate live calls behind an explicit env flag.

**9. AI usage metering** — `src/lib/ai/{meter,pricing,limits,usage,report,subject}.ts`, `api/admin/ai-usage`, `/admin/ai`, `src/components/sq/ai-usage-panel.tsx`. This is the newest, least-proven subsystem: verify token→cost math against `pricing.ts` including rounding, that limits actually block at the boundary (test at limit-1, limit, limit+1), attribution to the right subject, and that the admin panel totals match the raw rows.

**10. Admin console** — `/admin` and its subpages (ai, delivery, email, people, system, workspace), `src/actions/admin.ts`, `src/lib/admin/queries.ts`. **Authorization is the priority here**: confirm a non-admin cannot reach these pages _or_ hit the underlying actions/routes directly. A UI that merely hides the link is not access control.

**11. Email notifications** — `src/lib/notifications.ts`, `src/lib/process-board-notifications.ts`, `api/cron/send-notifications`, `api/unsubscribe`, `src/emails/task-digest.tsx`, `scripts/verify-notifications.ts`. Digest batching and dedup, unsubscribe honored on the next run, cron route auth, idempotency when the cron fires twice.

**12. Local-first / offline** — go offline mid-mutation, assert optimistic UI, then assert reconciliation or rollback on reconnect. Check the sync indicator matches actual state. Conflicting edits from two tabs.

**13. Cross-cutting** — dark mode across every route, mobile viewport (375px) on board/task/admin, keyboard-only navigation and focus traps in dialogs, security headers on responses, env validation (`src/lib/validate-env.ts`) failing loudly on missing vars.

## Method

1. **Recon first.** Read the relevant feature doc + source before touching the UI. Say what you expect to happen, then check.
2. **Explore manually before automating.** Use the running dev server. Cheap exploration finds bugs; expensive automation only locks them down.
3. **Push the edges.** Empty string, whitespace-only, 10k-char input, emoji and RTL text, HTML/script in every text field, negative and zero numbers, duplicate names, deleting a parent while a child is open, double-click submits, rapid repeated clicks, back-button after a mutation, direct URL to a resource you don't own, concurrent edits in two tabs.
4. **Automate the regressions.** New specs go in `playwright/`, named `<area>.spec.ts`, matching existing file style.
5. **Verify.** `pnpm test` (or a filtered run while iterating), then `pnpm lint`.

## Reporting

Keep a running `docs/qa/FINDINGS.md`. One entry per defect:

```
### [SEV] Short title
**Where:** file:line or route
**Repro:** numbered steps, from a clean db
**Expected:** (cite the feature doc if it says)
**Actual:** exact output/screenshot path
**Impact:** who this hurts and how badly
**Suspected cause:** optional; say "unverified" if you didn't confirm it
```

Severity: **S1** data loss / auth bypass / silent corruption · **S2** core flow broken, no workaround · **S3** broken with a workaround · **S4** cosmetic or polish.

Rank S1/S2 first. State your confidence. If you could not reproduce something reliably, say so rather than filing it as certain — but do file flaky behavior explicitly as flaky, because flakiness in a fullyParallel suite is itself a defect.

## Do not

- Do not fix bugs unless asked. Find, document, reproduce.
- Do not weaken an assertion, add a retry, or `test.skip` to make a suite green. If a test fails, that is the deliverable.
- Do not add `waitForTimeout` to paper over a race.
- Do not report "no issues found" for an area you only skimmed. Say what you actually covered and what you did not.
