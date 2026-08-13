# Feature: Application sidebar on board routes

## Overview

Direct `/boards/*` routes use the same Squirrl Agency OS application shell as
the client, calendar, notification, and settings routes. There is no
separate board-list sidebar.

## User Flows

### Navigate from a board

- Desktop shows the fixed 240px application sidebar.
- The only items are `Home`, `Clients`, `Calendar`, `Notifications`, and
  `Settings`.
- `Clients` is active on both `/clients/*` and `/boards/*` routes.
- On screens below `lg`, `Open menu` reveals the same navigation in a 270px
  drawer.

### Access board functions

- Direct board URLs continue to enforce authentication, membership, and board
  password access.
- Board CRUD, task CRUD, contributors, tags, comments, local-first Zustand
  state, polling, and outbox synchronization remain inside the board surface.

## Notes

- The legacy collapsible board list and its localStorage collapsed state are no
  longer rendered.
