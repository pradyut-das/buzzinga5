# Feature: Docs

## Overview

Every task brief is a doc: the task's TipTap JSON, split into one searchable
block per top-level node. Docs live in the Agency OS as a first-class surface —
a list, a single-doc viewer, and a read-only copy in the board task sidebar.
Search indexes the blocks, so a doc deep-links to the exact block that matched.

## User Flows

### Browse docs

- Open `Docs` in the left rail → `/docs`.
- Docs are grouped by client, sorted alphabetically; each card shows the task
  title, a snippet of the first block, and the block count.
- Click a card → the single doc viewer at `/docs/{taskId}`.

### View a doc

- `/docs/{taskId}` renders the brief read-only, block by block.
- The header shows the task title, its `Status` chip, block count, a breadcrumb
  to the client, and a `Back to task` link into the board sidebar.
- Arriving with `?blockIndex=N` (or `?blockId=…`) scrolls the block into view
  and flashes it (`.search-block-flash`, ~2.6s).

### Read a doc in the task sidebar

- Opening a task on `/boards/{boardId}?task={taskId}` shows a read-only `Docs`
  section (the brief) above comments.
- `Open` in that header links to the full viewer.

## Notes

- A doc is only a doc when it has at least one text block; empty briefs are
  excluded from the list and the viewer (`listDocs`, `getDocViewer`).
- The viewer is read-only today; editing stays on the client workspace
  (`/clients/{clientId}/tasks/{taskId}`) and in the board sidebar.
- Block deep links from search point at `/docs/{taskId}` rather than the
  board sidebar so the target is a stable, block-addressable page.
