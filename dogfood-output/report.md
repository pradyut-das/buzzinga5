# Dogfood Report: Squirrl Agency OS

| Field   | Value                                                 |
| ------- | ----------------------------------------------------- |
| Date    | 2026-08-13                                            |
| App URL | `http://localhost:5800`                               |
| Session | `buzzinga5-audit`                                     |
| Scope   | Authenticated platform, read-only, desktop and mobile |

## Summary

| Severity  | Count |
| --------- | ----: |
| Critical  |     0 |
| High      |     4 |
| Medium    |     5 |
| Low       |     0 |
| **Total** | **9** |

## Issues

### ISSUE-001: The product has no single current identity or operating model

- **Severity:** high
- **Category:** UX / content
- **Evidence:** `docs/vision.md:3-10,29-36`, `docs/features/global__creator-desk.md:5-20,78-87`, `src/app/layout.tsx:13-16`
- **Description:** The shipped experience alternates between a no-sign-up glass Kanban, a light-only Agency OS, Squirrl, Buzzinga, clients, and boards. Users cannot infer which model is authoritative.

### ISSUE-002: Core workspaces are implemented but absent from navigation

- **Severity:** high
- **Category:** UX / navigation
- **Evidence:** `src/components/sq/client-rail.tsx:21-27`; implemented `/admin`, `/assistant`, `/communities`, `/health`, `/publishing`, `/radar`, and `/studio` routes.
- **Description:** The five-link shell hides major surfaces, while Admin requirements explicitly promise a rail path. Work appears missing even when code exists.

### ISSUE-003: Independent board column and task Stage create two truths for progress

- **Severity:** high
- **Category:** UX / functional model
- **Evidence:** `docs/features/task__categories-and-workspace.md:49-54`, `docs/features/task__crud.md:74-78`, screenshot `screenshots/task-workspace-1280x720.png`.
- **Description:** A card can live in one column while its modal Stage says something else. The two controls use similar status language but do not synchronize.

### ISSUE-004: Several user-facing claims are factually false

- **Severity:** high
- **Category:** content / trust
- **Evidence:** false AI checks `src/components/sq/caption-studio.tsx:212-218`; hard-coded health delta `src/lib/agency/queries.ts:561-566`; password revocation mismatch `src/components/board/change-password-dialog.tsx:77-89` and `src/lib/secure-board.ts:41-56`; global “You” notifications `src/lib/agency/queries.ts:439-464`.
- **Description:** These are not polish issues; they can cause users to trust checks, metrics, security outcomes, or personal notifications that are not actually guaranteed.

### ISSUE-005: Home is an AI demo surface instead of an agency control surface

- **Severity:** medium
- **Category:** UX
- **URL:** `/`
- **Evidence:** `screenshots/initial.png`
- **Description:** The largest area is an animated orb with one microphone action. Deadlines, approvals, blocked work, and creation are not first-class, and there is no text alternative when voice is unavailable.

### ISSUE-006: Settings promises management but is almost entirely read-only

- **Severity:** medium
- **Category:** content / UX
- **URL:** `/settings`
- **Evidence:** `screenshots/settings.png`, `screenshots/settings-workspace.png`, `screenshots/settings-notifications.png`, `screenshots/settings-team.png`; `src/components/reference/settings-view.tsx:15-93`.
- **Description:** “Manage workspace, notifications, and voice preferences” leads to informational cards; only Sign out is a real setting action.

### ISSUE-007: Calendar turns the unscheduled backlog into an undifferentiated wall

- **Severity:** medium
- **Category:** UX / visual
- **URL:** `/calendar`
- **Evidence:** `screenshots/calendar-loaded.png`, `screenshots/calendar-unscheduled.png`.
- **Description:** The current dataset shows 62 unscheduled tasks after a full month grid. There is no priority, owner, age, or compact triage view, so the page exposes data without helping resolve it.

### ISSUE-008: Search advertises Escape dismissal, but Escape did not close it

- **Severity:** medium
- **Category:** functional / accessibility
- **URL:** `/clients`, `/settings`
- **Evidence:** Reproduced twice with browser keyboard input; `src/components/sq/client-rail.tsx:98-163,183-197`; screenshot `screenshots/search.png`.
- **Description:** After opening Search, pressing Escape left the overlay open. The backdrop closes it, but the visible `ESC` affordance and keyboard expectation fail.

### ISSUE-009: Responsive density and accessibility details are unfinished

- **Severity:** medium
- **Category:** accessibility / visual
- **Evidence:** `screenshots/clients-mobile.png`; Axe found nine serious contrast failures in open Search (lowest 1.42:1), non-unique landmarks, and uncertain contrast on 21 pale client initials; linter label warnings at `src/components/sq/caption-studio.tsx:124,128,213` and `src/app/(desk)/communities/page.tsx:100,104`.
- **Description:** Mobile client cards waste large amounts of vertical space, while overlay contrast and semantic labeling do not meet a consistent WCAG AA floor.
