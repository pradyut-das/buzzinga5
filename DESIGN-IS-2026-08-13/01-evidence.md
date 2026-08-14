# Evidence

## 1. Innovative

- The signed-in shell is explicitly supplied by a reference implementation rather than developed as one coherent extension of the original product (`docs/features/global__creator-desk.md:5-9`).
- Home uses a voice-first Gemini planner and WebGL plasma visualizer (`src/components/reference/voice-planner.tsx:47-115`), but its interaction model is a familiar AI-orb pattern rather than a novel agency workflow.

## 2. Useful

- The client task workspace successfully puts stage, due date, category, brief, assignee, collaborators, stakeholders, and client into one flow (`src/components/task/task-workspace.tsx:70-135`; `src/components/task/people-rail.tsx:35-71`).
- The documented product vision says “no sign-up required,” while current board access and homepage flows require sign-in (`docs/vision.md:3-9`; `docs/features/global__homepage.md:17-20`; `docs/features/board__crud.md:19-25`).
- Home's primary input is only a microphone, and it becomes unavailable when Gemini is not configured (`src/components/reference/voice-planner.tsx:41-45,68-105`; screenshot `initial.png`).
- Seven implemented workspaces—Admin, Assistant, Communities, Health, Publishing, Studio, and Radar—are absent from the five-item navigation (`src/components/sq/client-rail.tsx:21-27`; `src/app/(desk)/*/page.tsx`).
- The calendar renders 62 unscheduled tasks as one long list after the month grid, making the backlog technically available but poorly triaged (screenshot `calendar-unscheduled.png`).

## 3. Aesthetic

- The main Agency OS shell uses a coherent type scale of 14, 15, 16, 20, 22, and 40px, a restrained canvas/white/blue surface system, and consistent 13/18px radii on the Clients screen (computed styles from `/clients`).
- The same live screen renders 18 distinct text colors and 20 distinct nontransparent backgrounds because client accent colors are used decoratively.
- At 375px, each client card consumes roughly 214px of vertical space while showing only a name, task count, and empty deadline, producing a slow, sparse scan (`clients-mobile.png`).
- Two visual systems coexist: the light-only reference shell and legacy direct-board glass/theme surfaces (`docs/features/global__creator-desk.md:78-81`; `docs/vision.md:29-36`; `src/components/board/board-header.tsx:191-225`).
- The 610px task modal is polished at 1280px, but its rich editor and people controls form a dense second UI language inside the simpler client board (`task-workspace-1280x720.png`).

## 4. Understandable

- Board column and task Stage are independent concepts; moving a card does not update Stage (`docs/features/task__categories-and-workspace.md:49-54`), while older task documentation says Status moves between columns (`docs/features/task__crud.md:74-78`).
- `Done` closes the task modal instead of marking work done (`src/components/task/task-workspace.tsx:49-67`).
- `nextDeadlineAt` is labeled `Next review` (`src/app/(desk)/clients/[clientId]/page.tsx:16-29`; `src/components/sq/client-board.tsx:214-220`).
- Settings says “Manage … preferences,” but every section except Sign out is informational (`src/app/(desk)/settings/page.tsx:13-16`; `src/components/reference/settings-view.tsx:15-93`; screenshots `settings*.png`).
- Product vocabulary alternates among Squirrl, Buzzinga, Agency OS, Kanban Board, client accounts, boards, columns, Status, and Stage (`src/app/layout.tsx:13-16`; `src/components/reference/settings-view.tsx:50-93`).
- The command palette displays an `ESC` hint, but two live retries with `Escape` left it open; backdrop dismissal remained the workaround (`src/components/sq/client-rail.tsx:98-163,183-197`).

## 5. Unobtrusive

- The primary Home canvas is dominated by a 420–500px animated plasma visual with minimal operational information (`src/components/reference/voice-planner.tsx:49-91`; `initial.png`).
- Every desktop view reserves 240px for navigation and 82px for the utility header (`src/components/sq/client-rail.tsx:199-247`).
- Client boards add three metrics and a contact/review card before the Kanban (`src/components/sq/client-board.tsx:177-222`; `client-detail.png`).
- The brief permanently exposes 15 formatting controls above the document (`src/components/ui/rich-text-editor.tsx:83-209,316-325`).

## 6. Honest

- Caption “Squirrl checks” renders a pass mark even when stored Boolean values are false (`src/components/sq/caption-studio.tsx:212-218`).
- “Generate variants” keeps only one local paragraph rather than multiple selectable persisted variants (`src/components/sq/caption-studio.tsx:61-80,137-175`).
- “Instagram · last 48 hours” has no time predicate (`src/components/sq/topic-radar.tsx:49-52`; `src/lib/agency/queries.ts:354-366`).
- The Health delta is a hard-coded `-4` rather than a calculated change (`src/app/(desk)/health/page.tsx:16-22`; `src/lib/agency/queries.ts:561-566`).
- Password-change copy says old access will be revoked, but existing members bypass the password (`src/components/board/change-password-dialog.tsx:77-89`; `src/lib/secure-board.ts:41-56`).
- “Anyone with this [public] link” omits mandatory sign-in (`src/components/board/share-dialog.tsx:147-153`; `src/app/boards/layout.tsx:8-11`).
- “You were mentioned” is generated from a pending queue query that is not scoped to the signed-in user (`src/lib/agency/queries.ts:439-464`).
- Positive evidence: voice writes clearly say nothing is written until approval and require Cancel/Approve (`src/components/reference/voice-planner.tsx:117-155`).

## 7. Long-lasting

- The shell uses conventional navigation, Inter, solid surfaces, restrained borders, and shadows (`src/app/layout.tsx:6-11`; `src/components/sq/client-rail.tsx:21-71`).
- Dated markers remain: a glowing AI orb, legacy glassmorphism, and two overlapping visual systems (`src/components/reference/voice-planner.tsx:49-91`; `src/styles/glassmorphism.css`; `src/styles/creator-desk.css`).

## 8. Thorough

- Empty states exist on Home, Clients, Calendar, Notifications, comments, and other surfaces; loading, success, error, focus, and disabled states are represented across the platform.
- Live browser diagnostics found a duplicate Tiptap `link` extension warning after opening a task.
- Axe found two violations in the open search state: nine serious contrast failures (lowest measured ratio 1.42:1) and non-unique landmark naming. The client grid itself had zero definite violations but 21 incomplete contrast checks on pale initial badges.
- The configured linter reports five label/control association warnings (`src/components/sq/caption-studio.tsx:124,128,213`; `src/app/(desk)/communities/page.tsx:100,104`).

## 9. Environmentally friendly

- Authenticated Home loaded 1,571,041 transferred JS bytes / 9,167,263 decoded bytes across 29 initial JS requests in development; 33 total initial requests. This is not a production bundle measurement.
- Local load/interactive proxy was about 1,198ms, with FCP at 1,156ms and hydration around 20ms.
- One WebGL canvas animates continuously at idle (`src/components/reference/plasma-voice-visualizer.tsx:8-25,43-71`).
- Reduced-motion CSS exists, but the canvas continued changing under `prefers-reduced-motion: reduce`.
- System dark mode is overridden by `forcedTheme="light"` and `enableSystem={false}` (`src/components/theme-provider.tsx:7-13`).

## 10. As little design as possible

- Five normalized primary desktop surfaces contain 95 affordances, reach seven JSX levels, and show four duplicate-purpose groups: brand/Home, two Notifications entries, header/per-column task creation, and X/Done dismissal.
- Two distinct board implementations coexist (`src/components/sq/client-board.tsx:177-347`; `src/components/board/board-client.tsx:219-270`).
- Five navigation destinations coexist with seven implemented but unnavigated top-level workspaces (`src/components/sq/client-rail.tsx:21-27`; `src/app/(desk)/*/page.tsx`).
- The excess is architectural rather than unused code: configured lint/Knip scans found zero unused imports and zero dead props.

## Known gaps

- Production bundle size and field performance were not measured; development tooling inflates the recorded weight.
- Voice, write confirmations, destructive actions, integrations, email delivery, and admin mutations were not exercised because this was a read-only audit.
- Dynamic list counts depend on the current authenticated dataset.
