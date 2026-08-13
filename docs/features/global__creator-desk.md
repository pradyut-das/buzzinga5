# Feature: Squirrl Agency OS shell

## Overview

The signed-in application uses the Squirrl Agency OS frontend from the
`squirrl-main` reference implementation. Buzzinga supplies authentication,
queries, mutations, local-first board state, outbox synchronization, and agent
tools; the reference supplies the rendered information architecture and visual
system.

## User Flows

### Navigate the application

- Desktop uses a fixed 240px white sidebar.
- The sidebar contains only `Home`, `Clients`, `Calendar`, `Notifications`, and
  `Settings`, in that order.
- Search, help, and notifications appear in the 82px utility header.
- `Cmd+K` / `Ctrl+K` opens real client search.
- Below `lg`, the sidebar is replaced by a menu button and 270px modal drawer.
- The previous client roster, collapsible icon rail, `More tools` menu, floating
  board controls, depth canvas, glass shell, and Jarvis core are not rendered.

### Use the voice planner

- `Home` keeps the primary navigation in the shared left sidebar, presents the
  Voice UI Kit WebGL Plasma visualizer and Gemini reply in the center, and
  keeps `Today` in a dedicated right sidebar on wide screens.
- The Plasma renderer uses Voice UI Kit's published idle and thinking presets;
  Buzzinga's real Gemini input/output levels drive its intensity, rings, size,
  and motion without introducing a second voice transport.
- The four telemetry tiles and the bottom `Start planning` / `Review client
boards` action row are not rendered. The microphone control lives directly
  on the visualizer and the latest user line and agent reply appear below it.
- The microphone uses Buzzinga's authenticated Gemini Live session.
- Tool calls still go through `/api/agent/tool` and require on-screen
  confirmation before writes.
- The `Today` card reads real scheduled posts and shows an empty state when
  none exist; it never seeds demonstration items.

### Browse clients and work

- `Clients` renders the reference account-card grid from `listClients()`.
- A client opens `/clients/{clientId}` with the reference header, summary
  metrics, contact card, and horizontally scrolling Kanban.
- Kanban columns and tasks come from the real client board query.
- Dragging uses the existing authenticated move mutation with live cross-column
  previews, animated card displacement, edge auto-scroll, and exact rollback
  on cancel or failure.
- The client header `Create` action and each column's `Add task` action open
  the same reference modal shell and write through the existing task action;
  header creation defaults to the first board column and board-defined
  categories remain available. A due date is required so newly created work
  appears immediately on `Calendar`.
- Opening a task preserves the rich Buzzinga task workspace, including its
  brief, contributors, stakeholders, categories, due date, and status.

### Use cross-client routes

- `Calendar` reads the complete real client-board task set. Dated tasks appear
  in the month grid and tasks without a deadline remain accessible under
  `Unscheduled`.
- `Clients` and `Calendar` use the same page-header `Create` button and
  reference modal shell at every viewport.
- `Create` on `Calendar` adds a real board task with a due date and the same
  client-specific category choice available from the client board create flow.
- Calendar's `Unscheduled` list is draggable: dropping a task on a visible day
  optimistically assigns that date, persists it through the authenticated task
  mutation, and rolls back with feedback if the write fails.
- Calendar toolbar controls are live: previous/next step one month, month and
  year selectors jump directly, `Today` returns to the current month, and the
  task selector filters the grid, Upcoming, and Unscheduled by client.
- Client creation remains admin-only and uses the existing admin mutation.
- `Notifications` reads the real pending digest queue and links to its board.
- `Settings` reports real session, Gemini, notification, and contributor
  behavior; it does not persist unsupported mock preferences.

## Notes

- The UI is intentionally light-only to remain visually identical to the
  authoritative reference.
- Existing backend schemas and business logic are unchanged.
- The retired approval queue has no navigation, routes, actions, counts, or
  seed/import producers. Its database rows remain dormant historical data; no
  destructive migration is run as part of the UI removal.
- Reference mock Zustand data is not copied into Buzzinga.
- Responsive checks are required at 375px, 768px, and 1280px.
