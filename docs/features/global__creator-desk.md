# Feature: Squirrl Creator Desk

## Overview

The signed-in homepage (`/`) is **Squirrl**: a live operations view of every board the user
collaborates on, plus a Gemini Live voice agent and a text chatbot that can read and change the
planner through the same tool registry.

The interface uses a solid neutral canvas with dark glass panels and a Three.js intelligence core.
The core adapts the official MIT-licensed Three.js custom-attribute particle and particle-wave
examples into a shader-driven spherical shell, three orbital paths, a low-poly center and sparse
depth particles. It behaves like a Jarvis-style live system while the centered HTML button remains
the accessible microphone control. Attribution lives in `THIRD_PARTY_NOTICES.md`. A lighter shared
2D canvas gives every route spatial continuity.
It uses progressive disclosure to keep the founder focused: one review item, one primary agent
prompt and one overview link are visible by default. Signed out, `/` stays the marketing page.

The shared visual hierarchy is editorial rather than decorative: a flat edge-to-edge workspace, a
compact divider-separated icon rail, neutral white/graphite canvases, and system blue reserved for
decisions and contextual Squirrl actions. The collapsed desktop rail shows icons, client avatars,
and count badges only; labels appear after the rail is expanded. Typography uses sentence case with
larger, calmer hierarchy. Every route consumes the full canvas below the shared header; multi-pane
workspaces use divider-separated columns and collapse to one column on narrower screens. Desktop
workspaces optimise for one active task; mobile workspaces stack content between persistent flat top
and bottom navigation bars.

## User Flows

### Reading the desk

- The desktop rail is a fixed 88px icon strip showing client avatars and approval counts only; full client context is available
  from the link title and opened board. This keeps client switching present without making the
  roster a second dashboard.
- The newest task in a review-like column appears as the single focus card. `View more` opens the
  complete review queue; approval mutations still happen through the board or the agent's confirmed
  write flow.
- Squirrel illustrations identify Squirrl-authored guidance and decorate the voice surface without
  covering task content.
- The homepage offers one free-form `Ask Squirrl anything…` field and one example prompt. A compact
  `What can Squirrl do?` disclosure explains read and write capabilities without competing with the
  current decision.
- The intelligence core reacts to listening, thinking and speaking states. Pointer movement changes
  the camera slightly; microphone level changes the shell's energy. Reduced-motion users receive a
  static rendered scene, and browsers without WebGL receive a solid-ring fallback.
- During a live session, the squirrel illustration clears the core and the latest transcript is
  clamped to a compact two-line caption above the composer. Voice output never becomes hero text or
  sits behind the input.
- The `Executive pulse` strip shows delivery health (0–100), open work, unassigned, awaiting
  review and blocked, plus the single highest-priority signal.
- `Planner status` (left) shows today's creation and comment counts, open and blocked totals, a
  completion bar, and a fourteen-day activity trace.
- `Data center` tabs through `Boards`, `Pipeline`, `Team`, `Risks` and `Activity`.
  Clicking a board or a risk opens that board (`/boards/{boardId}`).
- `Throughput` (bottom right) plots tasks created and comments posted per day over 7 or 14 days.
- Figures refresh every 30 seconds, on `Refresh`, and immediately after any agent change.

### Progressive disclosure

- The desktop rail uses icons for clients, approvals, and calendar. Communities, topic radar,
  caption studio, publishing, and agency health live in a compact `More tools` popover.
- Approval triage shows one decision at a time. Remaining and sent-back items stay in collapsed
  queues until requested.
- Contextual agent explanations use a collapsed `What Squirrl can do here` disclosure on every
  workspace; the header exposes one consistent `Ask Squirrl` action.
- Structured answers are generated for the question instead of reusing a fixed dashboard. They lead
  with one conclusion, render only the query-specific facts the agent returned, and keep sources plus
  no more than two relevant follow-up questions in the same compact surface.
- The console has three plain-language sections: `Clients`, `Ask Squirrl`, and `Overview`.
- Board column management controls appear on hover or keyboard focus on desktop and remain visible
  on touch layouts.

### Opening a client board

- Selecting a client in the rail opens that board without navigating away from `/`.
- The rail stays visible on desktop; on mobile it becomes a horizontal avatar switcher.
- The board remains full-height beside/below the rail. Its actions stay bottom-left and the compact
  live orb stays bottom-right, so an active voice session is not unmounted.

### Talking to the agent by voice

- Click anywhere on the plate (the orb is the microphone) or the `Talk` button.
- The browser requests a short-lived Gemini token from `/api/agent/session`, opens the microphone
  and connects to Gemini Live.
- The orb reflects the session: gold while listening, blue with white rings while speaking, red
  while a tool runs.
- Tool calls are posted to `/api/agent/tool`, which re-checks the session and board membership.
- Click again, or `End voice`, to close the session.

### Talking to the agent by text

- Type in the `Planner agent` terminal and press `Send`.
- With no voice session open, the message goes to `/api/agent/chat`, which runs the tool loop
  server-side and returns the answer plus which tools ran.
- With a voice session open, typing joins that conversation instead, so the agent keeps one
  thread of context.

### Making changes

- Every write is two steps. The agent's first call prepares a change and reads back a summary.
- The change only happens after the user explicitly confirms, in a later turn.
- Changing a detail re-prepares; declining cancels.
- Deleting a task and removing a collaborator are called out as irreversible.

### Adding collaborators

- "Add priya@example.com to the Launch board" prepares the change, then applies it on confirmation.
- The person must already have an account — the agent never creates one or emails a stranger.
- Collaborators (accounts with board access) are a different list from contributors (people work
  is assigned to). The agent keeps them distinct.

## Notes

- **No gradients.** Canvas, asset placeholders, charts, loading states, and agent surfaces use
  solid colors, borders, and restrained shadows. Seed/import data stores solid accent colors.
- **Rendering budget.** The Three.js scene exists only on the homepage, caps device pixel ratio at
  1.5, uses a single `Points` draw call with `BufferGeometry` attributes for the shell, and disposes
  renderers, materials and geometry on unmount. Board and workflow screens use the shared
  low-frequency 2D canvas instead.
- **No due dates.** This planner has none. Workflow lives in column order, and "gone quiet" means
  no comment activity for seven or more days. The agent is told to never invent a deadline.
- **Column kinds** are inferred from column names (backlog, active, review, blocked, done,
  archive), which is how "blocked" and "done" counts exist without a status field.
- **Scope.** Every tool is confined to boards the signed-in user is a member of. The board
  password cookie is not used: a voice session outlives any single board unlock.
- **Without `GEMINI_API_KEY`** the desk still renders and polls; only the voice agent and chatbot
  are disabled, and the terminal says so.
