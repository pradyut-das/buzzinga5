# Feature: Task categories and the workspace

## Overview

There are no built-in task types. A task is a title, a document, people, a
status, and — optionally — one **category** that its own board defines. Every
task opens the same workspace; nothing about the screen changes with the
category, so the board stays one product instead of five.

- **Categories**: created per board (`task_categories`), free text with a colour
  and a display order. A task points at one, or at none (`tasks.category_id`)
- **Statuses**: To do, Review, Accepted, Rejected, In production, Done
  (`tasks.status`) — deliberately free-form, any state can follow any other
- **People**: assignee (owns it), collaborators (work on it), stakeholders
  (sign it off), client (whose brand it is)

Status vocabulary lives in [`src/lib/task-types.ts`](../../src/lib/task-types.ts);
every write goes through
[`src/actions/task-workspace.ts`](../../src/actions/task-workspace.ts).

## User Flows

### Opening a task

- Click a card on the client board, or go to `/clients/{clientId}/tasks/{taskId}`
- The workspace opens in the same centered 610px reference modal shell used by
  create dialogs, over a 20% slate backdrop.
- `Stage`, `Due date`, and `Category` use the shared modal field treatment.
- The brief and ownership controls form one vertically scrolling flow instead
  of a separate wide workspace and side rail.
- On narrow screens the modal keeps a 16px viewport gutter and all controls
  collapse to one column.

### Writing the brief

- A TipTap document — headings, lists, checkboxes, `@mentions` — that saves on a
  700 ms debounce and shows `Saving…` / `Saved`
- Files cannot be attached anywhere in the app; link to them instead

### Categorizing

- `Category` in the workspace header lists the board's categories plus
  `No category`
- A card shows its category as a coloured tag, and `Uncategorized` shows as a
  plain chip on the workspace
- New cards pick a category in the `Add a task…` row when the board has any
- Categories themselves are managed in the admin console — see
  [global\_\_admin-console.md](global__admin-console.md)

### Status

- `Stage` sets the status; any status can follow any other
- Status is independent of the board column: moving a card does not change it

## Notes

- Deleting a category leaves its tasks alone; they become uncategorized
- The voice/chat agent reads a board's category names and can file a task under
  one by name (`set_task_category`), but never invents a new category
