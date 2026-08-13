# Feature: Admin Console

## Overview

One screen at `/admin` where an admin does top-level CRUD over the four things nothing else can
create or destroy: user accounts, clients, boards and task categories.

Admins are an environment allowlist (`ADMIN_EMAILS`, comma-separated), never a database flag — the
set only changes with a deploy, so a compromised account cannot promote anyone. Non-admins get a
404 on `/admin`, and the rail link only appears for admins.

## User Flows

### Reaching the console

- Sign in with an email listed in `ADMIN_EMAILS`
- Open `＋ More tools` → `Admin` in the rail, or go to `/admin`
- Four tabs: `Users`, `Clients`, `Boards`, `Categories`

### Users

- Add: name, email, password (8+ characters) → `Add user`
- Edit: `Edit` on a row changes name and email; the password field only changes the password when
  something is typed into it
- Delete: `Delete` asks for the account's email back, then removes the account, its sessions and its
  board memberships. Boards they owned survive without an owner
- Admins carry an `admin` tag; the console cannot grant or revoke it
- You cannot delete your own account

### Clients

- Add: name, initials (2 letters), color, account manager, cadence → `Add client`
- Edit: same fields inline
- `Archive` hides a client from the rail and leaves all their work readable; `Restore` undoes it
- `Delete` asks for the client name back, then removes their boards, assets, caption
  drafts, scheduled posts, communities and topics

### Boards

- Add: title, client (optional) and a share password (optional). The board is created with the usual
  `To do / Doing / Done / Archive` columns and the admin as owner
- Edit: title, client, and a new share password when one is typed
- `Clear password` drops the password gate; membership still controls access
- `Add member` / `Remove member` take the account's email
- `Delete` asks for the board title back, then removes its tasks, comments, tags, contributors,
  columns and memberships. Assets made from those tasks survive with the task link cleared

### Categories

- A category is a board's own word for what a task is — there are no built-in task types
- Add: board, name, colour and display order → `Add category`
- Edit: name, colour and order inline
- `Delete` asks for the category name back, then removes it; tasks filed under it stay and become
  uncategorized
- Names are unique per board

## Notes

- Every action re-checks `ADMIN_EMAILS` on the server — hiding a button is presentation, not
  authorization
- Deletes run leaf-first in `src/lib/admin/cascade.ts` because the schema uses `onDelete: restrict`
  almost everywhere
- Row counts (boards, members, tasks) are shown before a delete so nobody wipes a client blind
