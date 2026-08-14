# Scope

- **Artifact:** The complete Buzzinga5/Squirrl platform in this repository, including the authenticated Squirrl Agency OS shell, Home, Clients, a populated client board, task workspace, Calendar, Notifications, Settings, authentication, direct-board surfaces, and implemented but unnavigated desk routes.
- **Live URL:** `http://localhost:5800`, audited with the existing authenticated QA account at 1280px desktop and 375px mobile. No product data was changed.
- **Primary user:** An agency founder or content-operations lead coordinating work across many clients.
- **Primary task:** See what needs attention, create or assign client work, and move it from brief to scheduled/published completion without losing context.
- **Constraints:** Next.js 16, existing Turso/Supabase-backed data and local-first board behavior, the Squirrl brand, the current production data model, WCAG 2.1 AA minimum. No deadline was supplied.
- **References:** `docs/vision.md`, `docs/features/global__creator-desk.md`, the rest of `docs/features/`, relevant UI/store ADRs, and the repository's stated reference implementation. No competitor set was supplied.

## Evidence surfaces

- `dogfood-output/screenshots/initial.png`
- `dogfood-output/screenshots/clients.png`
- `dogfood-output/screenshots/clients-mobile.png`
- `dogfood-output/screenshots/client-detail.png`
- `dogfood-output/screenshots/task-workspace-loaded.png`
- `dogfood-output/screenshots/task-workspace-1280x720.png`
- `dogfood-output/screenshots/calendar-loaded.png`
- `dogfood-output/screenshots/calendar-unscheduled.png`
- `dogfood-output/screenshots/notifications.png`
- `dogfood-output/screenshots/settings.png`
