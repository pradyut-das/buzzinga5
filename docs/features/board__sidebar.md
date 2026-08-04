# Feature: Board Sidebar

## Overview

A persistent sidebar on every `/boards/*` page listing the boards the signed-in user belongs to.

## User Flows

### Browse Boards

- Sidebar is visible on desktop for all `/boards/*` routes (hidden below `md`; the board header hamburger menu remains the mobile navigation)
- Below a `Boards` heading, each board links to `/boards/{uuid}`
- The board matching the current URL is highlighted
- Boards the user is a member of, newest board first

### Collapse the Sidebar

- Click the collapse button in the sidebar header
- Collapsed sidebar shows icons only
- The choice is stored in localStorage under `itacorubi:sidebar-collapsed` and survives navigation and reloads

### Create a Board

- Click `New board` at the bottom of the sidebar
- Opens the same create-board dialog as the homepage

### Account Actions

- The signed-in user's name is shown above a `Sign out` button

## Notes

- `BoardSidebar` (server) reads the session and membership; `BoardSidebarClient` renders and handles collapse state
- Lives in `src/app/boards/layout.tsx` so board pages, the unlock page and the emails pages all share it
