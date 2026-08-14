# Planning handoff

```text
/make-plan Redesign Squirrl Agency OS. Current design failed audit at 8/30 with critical gaps in principles #2 useful, #4 understandable, #6 honest, #9 environmentally friendly, and #10 as little design as possible.

Verdict paragraph (quoted from 03-verdict.md):
> REDESIGN — at 8/30, the platform needs a user-facing product and information-architecture redesign because usefulness, understandability, honesty, and restraint fail as one system even though several individual work surfaces and the local-first backend are worth preserving.

Why redesign and not refine: The total is below 20 and the load-bearing honesty principle scored 0; the problems come from conflicting product models and duplicate structures, not isolated styling defects.

Preserve from current design:
- The local-first normalized board/outbox architecture and responsive interaction guarantees (`docs/adrs/store__local-first-architecture.md:1-134`).
- The clean Squirrl shell tokens, client grid, calendar controls, and unified task-workspace data model (`src/components/sq/client-rail.tsx:21-71,199-247`; `src/components/task/task-workspace.tsx:70-135`).

Discard:
- The coexistence of reference client boards and legacy direct-board UI. Evidence: `src/components/sq/client-board.tsx:177-347`; `src/components/board/board-client.tsx:219-270`. Caused failure on principles #4 and #10.
- The orb-dominated Home and five-link navigation that hides seven implemented workspaces. Evidence: `src/components/reference/voice-planner.tsx:47-115`; `src/components/sq/client-rail.tsx:21-27`; `src/app/(desk)/*/page.tsx`. Caused failure on principles #2, #5, and #10.

Top 3–5 moves from the audit (verbatim):
1. Principles #2/#4 — Define one operating model: choose one canonical path from client → deliverable → workflow state → deadline → approval/publication, then make every surface use the same entities and vocabulary. Evidence: `01-evidence.md#2-useful`, `01-evidence.md#4-understandable`.
2. Principles #6/#4 — Make every promise literal: remove or correct false checks, fabricated metrics, unscoped personal notifications, password/public-link claims, inert actions, and preference language before adding features. Evidence: `01-evidence.md#6-honest`.
3. Principles #10/#5 — Collapse the duplicate product shells: keep one board/task experience, one visual system, and a navigation model that either exposes or retires every implemented workspace. Evidence: `01-evidence.md#10-as-little-design-as-possible`, `01-evidence.md#5-unobtrusive`.
4. Principles #2/#5 — Replace the orb-first Home with an action-first agency dashboard: surface attention, deadlines, approvals, and quick creation first; keep voice as an optional accelerator with a text equivalent. Evidence: `01-evidence.md#2-useful`, `01-evidence.md#5-unobtrusive`.
5. Principles #8/#9 — Establish a release-quality floor: WCAG AA, reduced-motion canvas fallback, responsive density, state verification, and production bundle budgets must be acceptance criteria. Evidence: `01-evidence.md#8-thorough`, `01-evidence.md#9-environmentally-friendly`.

Redesign principles in priority order:
1. Principle #6 — Honest — every label, metric, check, and security statement must map exactly to behavior and data scope.
2. Principle #4 — Understandable — one vocabulary and one canonical flow must explain the platform without help copy.
3. Principle #2 — Useful — the first screen and global navigation must shorten the daily agency workflow.

Deliverables for the plan:
- New information architecture (not derived from old)
- New primary flow (low-fi, labeled, compared side-by-side to current)
- States checklist (empty, loading, error, success, focus, disabled)
- Migration path for users currently on the old design
- Cutover criteria (when is the old design retired)

Anti-patterns to guard against (specific to REDESIGN):
- Porting old structure under new styling
- Keeping both designs behind a flag indefinitely
- Redesigning to follow a trend rather than the principles above
- Treating the Preserve list as optional — it must be filled before this handoff is valid
```

