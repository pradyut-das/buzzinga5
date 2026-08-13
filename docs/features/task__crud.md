# Feature: Tasks

## Overview

Tasks are the individual work items that live within columns. Each task can have a title, multiple assignees, multiple stakeholders, a creation date, and comments.

## User Flows

### Create Task

- Click "Add task" button at top of column
- Task created with "{emoji} New task" title
- Sidebar automatically opens for editing
- URL updates to `/boards/{boardId}?task={taskId}`
- Created at date is set automatically

### Create Task from a Client Board

- `Create` in the client header targets the first board column; `Add task`
  targets the selected column.
- Enter a title, required due date, and optional board category.
- `Create` on `/calendar` uses the same title, client, due date, and optional
  board-category fields; changing the client refreshes the category choices to
  that client's board vocabulary.
- The task and due date are written together, so the new task immediately
  appears on both the client board and `/calendar`.
- Older board tasks without a due date remain visible in Calendar under
  `Unscheduled` until a date is assigned.

### Schedule an Unscheduled Task

- Open `/calendar` and use an unscheduled task's drag handle to drop it onto
  any visible date.
- The task moves into the target day immediately while the authenticated due
  date mutation runs in the background.
- The target day highlights during the drag and a compact task preview follows
  the pointer; touch uses a short hold to avoid fighting page scrolling.
- A success toast confirms the date. If persistence fails, the task returns to
  `Unscheduled` and an error toast explains that it was not scheduled.

### View Task

- Click on task card in the board
- Sidebar opens with task details
- URL updates to `/boards/{boardId}?task={taskId}`
- **Desktop**: 70/30 split layout (comments left, details right), each panel scrolls independently
- **Mobile**: Full-width sidebar, stacked vertically (details first, then comments), scrolls as one unit

### Edit Task

- Open task sidebar (click on task card)
- Editable fields (right panel):
  - **Title**: Click to edit, auto-saves after 1 second or on Enter/blur
  - **Status**: Dropdown to move between columns
  - **Assignees**: Multi-select with ability to create new contributors
  - **More details**: Expand to reveal less-frequent controls
  - **Priority**: Dropdown (No priority, Low, Medium, High, Urgent). Defaults to **No priority**
  - **Stakeholders**: Multi-select with ability to create new contributors (reuses same contributor list)
  - **Tags**: Multi-select for board tags
  - **Created at**: Date picker to view/change creation date

### Move Task (Drag & Drop)

- Drag task card from one column to another
- Can drop into empty columns
- The card follows a lightweight overlay and moves into the hovered column
  before release, so neighboring cards animate out of the way instead of
  jumping after the drop.
- Pointer, touch, and keyboard sensors are supported; edge dragging
  auto-scrolls the horizontal board.
- The move is optimistic. Cancelling or a failed authenticated write restores
  the exact pre-drag board and a failed write shows an error toast.

### Move Task (Sidebar)

- Open task sidebar
- Use Status dropdown to select target column
- Task moves immediately

### Reorder Tasks (Board Header)

- Click **Reorder** button in board header
- Select ordering option:
  - **Created (oldest first)** - Sort by task creation date, oldest first
  - **Created (newest first)** - Sort by task creation date, newest first
  - **Last comment (newest first)** - Sort by most recent comment timestamp, newest first
  - **Last comment (oldest first)** - Sort by most recent comment timestamp, oldest first
- Confirmation dialog appears (since this affects everyone on the board)
- Tasks are reordered within each column separately (no cross-column moves)
- For tasks with no comments, task creation date is used as the activity timestamp
- Order persists for all users and survives page refresh

### Delete Task

- Open task sidebar
- Click trash icon (`Trash2`) in bottom right corner (subtle)
- Confirmation dialog appears
- Confirm to delete

### Send to Linear

- Open task sidebar
- Click Linear icon in bottom right corner (next to delete button)
- Opens `https://linear.new` in a new tab with pre-filled fields:
  - **Title**: Task title
  - **Description**: Status, priority, assignees, and a source link back to the task

## Notes

- Tasks can be dropped into collapsed columns
- Task position within a column is determined by drop location
- Priority is **visual only** and does **not** affect task ordering within a column
- Task cards show comment count and days since last comment
- Comment age indicator uses color coding (green → yellow → red)
- Adding a comment moves the task to the top of its column
- Initial task title (including emoji) is generated on the client and passed to the server to ensure consistency between optimistic UI and server response
- **Reorder tasks** feature applies ordering within each column separately (all columns are reordered)
- When reordering by "last comment", tasks with zero comments use their creation date as the activity timestamp
- Reorder uses stable tie-breakers (createdAt, then taskId) to avoid jitter
- See `comment__crud.md` for full comment documentation
