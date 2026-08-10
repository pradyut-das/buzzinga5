import { TASK_PRIORITIES, type TaskPriority, type TaskStatus } from "@/db/schema";
import { AgentError, type AgentScope } from "@/lib/agent/scope";
import * as read from "@/lib/agent/read-tools";
import * as write from "@/lib/agent/write-tools";
import type { PreparedMutation } from "@/lib/agent/write-tools";

/**
 * One registry, two front ends. The Gemini Live voice session and the text
 * chatbot are both given exactly these declarations and both dispatch through
 * `runTool`, so a capability can never exist in one surface and not the other.
 */
export interface ToolDeclaration {
  name: string;
  description: string;
  parametersJsonSchema: Record<string, unknown>;
}

type JsonValue = unknown;
type ToolInput = Record<string, JsonValue>;

const str = (description: string) => ({ type: "string", description });
const bool = (description: string) => ({ type: "boolean", description });
const num = (description: string) => ({ type: "number", description });
const board = str("Board title. Omit only when you are a member of exactly one board.");
const priorityEnum = { type: "string", enum: [...TASK_PRIORITIES] };

function object(properties: Record<string, unknown>, required: string[] = []) {
  return { type: "object", properties, required, additionalProperties: false };
}

/** Mutations all carry the same confirmation field, described identically. */
const confirmed = bool(
  "False while preparing — this never writes. True only after the tool returned confirmation_required and the user explicitly confirmed in a later turn.",
);

export const READ_TOOLS: ToolDeclaration[] = [
  {
    name: "get_pulse",
    description:
      "The exact figures on the creator homepage: totals, delivery-health score and its drivers, pipeline distribution by column, priority mix, and the single highest-priority signal. Call this for 'how are we doing', 'what should I look at', or any overall status question.",
    parametersJsonSchema: object({}),
  },
  {
    name: "list_boards",
    description:
      "List every board you collaborate on with its open/done/blocked/stale counts, completion percentage and last activity. Use to answer 'which board is behind' and to learn canonical board titles.",
    parametersJsonSchema: object({}),
  },
  {
    name: "search_tasks",
    description:
      "Search tasks across your boards with any combination of filters. Returns title, board, column, column kind, priority, assignees, stakeholders, tags, comment count, due date and idle days. This is the workhorse for nearly every question about work.",
    parametersJsonSchema: object({
      boardName: board,
      titleContains: str("Words that appear in the task title."),
      columnName: str("Limit to one column, matched loosely so emoji prefixes do not matter."),
      priorities: { type: "array", items: priorityEnum, description: "Limit to these priorities." },
      assigneeName: str("Limit to tasks assigned to this contributor."),
      tagName: str("Limit to tasks carrying this tag."),
      unassigned: bool("True to return only tasks with no assignee."),
      onlyOpen: bool("True to exclude tasks sitting in done or archive columns."),
      staleDays: num("Return only tasks with no activity for at least this many days."),
      dueBefore: str("Only tasks due on or before this YYYY-MM-DD date."),
      overdue: bool("True to return only tasks whose due date has passed."),
      hasDueDate: bool("True for tasks that have a due date, false for those that do not."),
      limit: num("Maximum rows to return, 1 to 50. Defaults to 25."),
    }),
  },
  {
    name: "get_task_details",
    description:
      "Full current state of exactly one task, resolved by title. Call this before changing a task so you quote its real column, priority and owners.",
    parametersJsonSchema: object({ taskTitle: str("The task title."), boardName: board }, [
      "taskTitle",
    ]),
  },
  {
    name: "list_columns",
    description:
      "List one board's columns in order, with their workflow kind (backlog, active, review, blocked, done, archive) and task counts. Call before moving work so you name a real column.",
    parametersJsonSchema: object({ boardName: board }),
  },
  {
    name: "preview_column",
    description:
      "List the tasks inside one column in board order with their positions. Use before inserting a task at a specific position.",
    parametersJsonSchema: object({ boardName: board, columnName: str("The column name.") }, [
      "columnName",
    ]),
  },
  {
    name: "list_contributors",
    description:
      "List one board's contributors — the people work is assigned to — with their colour and current assignment count. Call before assigning anything.",
    parametersJsonSchema: object({ boardName: board }),
  },
  {
    name: "list_collaborators",
    description:
      "List the user accounts that can open one board, with their role. Collaborators are accounts with access; contributors are the people tasks are assigned to. They are different lists.",
    parametersJsonSchema: object({ boardName: board }),
  },
  {
    name: "list_tags",
    description: "List one board's tags with how many tasks carry each.",
    parametersJsonSchema: object({ boardName: board }),
  },
  {
    name: "get_task_comments",
    description:
      "Read the most recent comments on one task as plain text, with author and timestamp. Use for 'what did people say about X'.",
    parametersJsonSchema: object({ taskTitle: str("The task title."), boardName: board }, [
      "taskTitle",
    ]),
  },
  {
    name: "get_recent_activity",
    description:
      "The latest comment activity across every board you collaborate on. Use for 'what happened recently' and 'what did I miss'.",
    parametersJsonSchema: object({ limit: num("How many entries, 1 to 12.") }),
  },
  {
    name: "get_workload",
    description:
      "Open task counts per contributor, ranked, plus how much work has no owner at all. Use for 'who is overloaded' and balancing questions.",
    parametersJsonSchema: object({}),
  },
  {
    name: "get_risks",
    description:
      "Everything currently dragging delivery: blocked tasks, ownerless tasks, work that has gone quiet, and urgent work still open — each with the reason and how long it has been idle.",
    parametersJsonSchema: object({}),
  },
  {
    name: "get_velocity",
    description:
      "Tasks created and comments posted per day for the last fourteen days, plus how much finished this week. Use for throughput and trend questions.",
    parametersJsonSchema: object({}),
  },
];

export const WRITE_TOOLS: ToolDeclaration[] = [
  {
    name: "create_task",
    description:
      "Create one task. Optionally place it in a named column and set its priority, assignee and tag in the same call.",
    parametersJsonSchema: object(
      {
        title: str("The task title, written concisely without command scaffolding."),
        boardName: board,
        columnName: str("Where it lands. Defaults to the board's first column."),
        priority: priorityEnum,
        assigneeName: str("An existing contributor on that board."),
        tagName: str("An existing tag on that board."),
        confirmed,
      },
      ["title", "confirmed"],
    ),
  },
  {
    name: "rename_task",
    description: "Change one task's title.",
    parametersJsonSchema: object(
      {
        taskTitle: str("The current title."),
        newTitle: str("The new title."),
        boardName: board,
        confirmed,
      },
      ["taskTitle", "newTitle", "confirmed"],
    ),
  },
  {
    name: "move_task",
    description:
      "Move one task into a different column, optionally at a specific position. This is how status changes are expressed: the workflow lives in the columns.",
    parametersJsonSchema: object(
      {
        taskTitle: str("The task title."),
        columnName: str("The destination column."),
        position: num("Zero-based slot in the destination column. Defaults to the end."),
        boardName: board,
        confirmed,
      },
      ["taskTitle", "columnName", "confirmed"],
    ),
  },
  {
    name: "set_task_priority",
    description: "Set one task's priority to none, low, medium, high or urgent.",
    parametersJsonSchema: object(
      { taskTitle: str("The task title."), priority: priorityEnum, boardName: board, confirmed },
      ["taskTitle", "priority", "confirmed"],
    ),
  },
  {
    name: "delete_task",
    description:
      "Permanently delete one task with its comments, tags and assignments. Irreversible — always confirm carefully.",
    parametersJsonSchema: object(
      { taskTitle: str("The task title."), boardName: board, confirmed },
      ["taskTitle", "confirmed"],
    ),
  },
  {
    name: "bulk_move_tasks",
    description:
      "Move every task matching a bounded filter into one column. Requires at least one of fromColumnName, priorities, assigneeName or titleContains, and touches at most 25 rows.",
    parametersJsonSchema: object(
      {
        columnName: str("The destination column."),
        fromColumnName: str("Only move tasks currently in this column."),
        priorities: { type: "array", items: priorityEnum, description: "Only these priorities." },
        assigneeName: str("Only tasks assigned to this contributor."),
        titleContains: str("Only tasks whose title contains this text."),
        boardName: board,
        confirmed,
      },
      ["columnName", "confirmed"],
    ),
  },
  {
    name: "sort_column",
    description:
      "Reorder one column's tasks by age or last comment: createdAsc, createdDesc, lastCommentDesc or lastCommentAsc.",
    parametersJsonSchema: object(
      {
        columnName: str("The column to reorder."),
        mode: {
          type: "string",
          enum: ["createdAsc", "createdDesc", "lastCommentDesc", "lastCommentAsc"],
        },
        boardName: board,
        confirmed,
      },
      ["columnName", "mode", "confirmed"],
    ),
  },
  {
    name: "archive_done",
    description: "Move everything sitting in the board's done column into its archive column.",
    parametersJsonSchema: object({ boardName: board, confirmed }, ["confirmed"]),
  },
  {
    name: "cleanup_empty_tasks",
    description:
      "Delete tasks that were never given a real title (blank, 'New task' or 'Untitled').",
    parametersJsonSchema: object({ boardName: board, confirmed }, ["confirmed"]),
  },
  {
    name: "create_column",
    description: "Add a new column at the end of one board.",
    parametersJsonSchema: object({ name: str("The column name."), boardName: board, confirmed }, [
      "name",
      "confirmed",
    ]),
  },
  {
    name: "rename_column",
    description: "Rename one column on a board.",
    parametersJsonSchema: object(
      {
        columnName: str("The current column name."),
        newName: str("The new name."),
        boardName: board,
        confirmed,
      },
      ["columnName", "newName", "confirmed"],
    ),
  },
  {
    name: "create_board",
    description:
      "Create a new board that you own, with the default To do / Doing / Done / Archive columns. It needs a share password of at least four characters, which the user must supply.",
    parametersJsonSchema: object(
      {
        title: str("The board title."),
        password: str("The share password the user chose."),
        confirmed,
      },
      ["title", "password", "confirmed"],
    ),
  },
  {
    name: "rename_board",
    description: "Rename one of your boards.",
    parametersJsonSchema: object({ newTitle: str("The new title."), boardName: board, confirmed }, [
      "newTitle",
      "confirmed",
    ]),
  },
  {
    name: "add_collaborator",
    description:
      "Give an existing account access to one of your boards, by email. The person must already have signed up; this never creates an account or sends an invitation to a stranger.",
    parametersJsonSchema: object(
      {
        email: str("The collaborator's account email."),
        role: { type: "string", enum: ["member", "owner"], description: "Defaults to member." },
        boardName: board,
        confirmed,
      },
      ["email", "confirmed"],
    ),
  },
  {
    name: "remove_collaborator",
    description: "Remove an account's access to one of your boards, by email.",
    parametersJsonSchema: object(
      { email: str("The collaborator's email."), boardName: board, confirmed },
      ["email", "confirmed"],
    ),
  },
  {
    name: "add_contributor",
    description:
      "Add a person to one board so work can be assigned to them. A contributor is board-local and does not need an account; an email only enables notifications.",
    parametersJsonSchema: object(
      {
        name: str("The person's name."),
        email: str("Optional email for notifications."),
        boardName: board,
        confirmed,
      },
      ["name", "confirmed"],
    ),
  },
  {
    name: "assign_task",
    description: "Assign one task to a contributor on the same board.",
    parametersJsonSchema: object(
      {
        taskTitle: str("The task title."),
        assigneeName: str("An existing contributor."),
        boardName: board,
        confirmed,
      },
      ["taskTitle", "assigneeName", "confirmed"],
    ),
  },
  {
    name: "unassign_task",
    description: "Take a contributor off one task.",
    parametersJsonSchema: object(
      {
        taskTitle: str("The task title."),
        assigneeName: str("The contributor to remove."),
        boardName: board,
        confirmed,
      },
      ["taskTitle", "assigneeName", "confirmed"],
    ),
  },
  {
    name: "add_stakeholder",
    description:
      "Add a contributor as a stakeholder on one task — someone kept informed rather than doing the work.",
    parametersJsonSchema: object(
      {
        taskTitle: str("The task title."),
        personName: str("An existing contributor."),
        boardName: board,
        confirmed,
      },
      ["taskTitle", "personName", "confirmed"],
    ),
  },
  {
    name: "create_tag",
    description: "Create a new tag on one board.",
    parametersJsonSchema: object({ name: str("The tag name."), boardName: board, confirmed }, [
      "name",
      "confirmed",
    ]),
  },
  {
    name: "tag_task",
    description: "Add an existing tag to one task, or remove it when remove is true.",
    parametersJsonSchema: object(
      {
        taskTitle: str("The task title."),
        tagName: str("An existing tag on that board."),
        remove: bool("True to take the tag off instead of adding it."),
        boardName: board,
        confirmed,
      },
      ["taskTitle", "tagName", "confirmed"],
    ),
  },
  {
    name: "add_comment",
    description:
      "Post a comment on one task. Comments are authored by a contributor, so authorName must be an existing contributor on that board.",
    parametersJsonSchema: object(
      {
        taskTitle: str("The task title."),
        text: str("The comment, written as the author would write it."),
        authorName: str("An existing contributor on that board."),
        boardName: board,
        confirmed,
      },
      ["taskTitle", "text", "authorName", "confirmed"],
    ),
  },
  {
    name: "set_task_status",
    description: "Set one task's status: todo, review, accepted, rejected, in_production or done.",
    parametersJsonSchema: object(
      {
        taskTitle: str("The task title."),
        status: {
          type: "string",
          enum: ["todo", "review", "accepted", "rejected", "in_production", "done"],
        },
        boardName: board,
        confirmed,
      },
      ["taskTitle", "status", "confirmed"],
    ),
  },
  {
    name: "set_task_category",
    description:
      "File a task under one of its board's own categories, by name. Pass an empty category to clear it. The board's categories are listed in the directory.",
    parametersJsonSchema: object(
      {
        taskTitle: str("The task title."),
        category: str("A category name already on that board, or empty to clear it."),
        boardName: board,
        confirmed,
      },
      ["taskTitle", "category", "confirmed"],
    ),
  },
  {
    name: "set_task_description",
    description: "Replace the description (the idea document) on one task.",
    parametersJsonSchema: object(
      {
        taskTitle: str("The task title."),
        text: str("The new description, in plain text."),
        boardName: board,
        confirmed,
      },
      ["taskTitle", "text", "confirmed"],
    ),
  },
  {
    name: "reorder_task",
    description: "Move one task to a given 1-based position inside the column it already sits in.",
    parametersJsonSchema: object(
      {
        taskTitle: str("The task title."),
        position: { type: "number", description: "1-based position within the column." },
        boardName: board,
        confirmed,
      },
      ["taskTitle", "position", "confirmed"],
    ),
  },
  {
    name: "delete_column",
    description:
      "Delete one column. If it still holds tasks, moveTasksTo must name the column they move to.",
    parametersJsonSchema: object(
      {
        columnName: str("The column to delete."),
        moveTasksTo: str("Column its tasks should move to, if it is not empty."),
        boardName: board,
        confirmed,
      },
      ["columnName", "confirmed"],
    ),
  },
  {
    name: "move_column",
    description: "Move one column to a given 1-based position on its board.",
    parametersJsonSchema: object(
      {
        columnName: str("The column to move."),
        position: { type: "number", description: "1-based position on the board." },
        boardName: board,
        confirmed,
      },
      ["columnName", "position", "confirmed"],
    ),
  },
  {
    name: "delete_comment",
    description:
      "Delete one comment on a task, identified by a few words it contains. Irreversible.",
    parametersJsonSchema: object(
      {
        taskTitle: str("The task title."),
        textContains: str("A few words from the comment to delete."),
        boardName: board,
        confirmed,
      },
      ["taskTitle", "textContains", "confirmed"],
    ),
  },
  {
    name: "set_task_due_date",
    description:
      "Give one task a due date. The date must be an absolute calendar date in YYYY-MM-DD form; resolve 'Friday' or 'next week' against today before calling.",
    parametersJsonSchema: object(
      {
        taskTitle: str("The task title."),
        date: str("The due date as YYYY-MM-DD."),
        boardName: board,
        confirmed,
      },
      ["taskTitle", "date", "confirmed"],
    ),
  },
  {
    name: "clear_task_due_date",
    description: "Remove the due date from one task.",
    parametersJsonSchema: object(
      { taskTitle: str("The task title."), boardName: board, confirmed },
      ["taskTitle", "confirmed"],
    ),
  },
  {
    name: "delete_board",
    description:
      "Permanently delete an entire board with every task, comment, tag, contributor and attachment on it. Owner only, irreversible. confirmTitle must repeat the board title exactly.",
    parametersJsonSchema: object(
      {
        boardName: str("The board to delete."),
        confirmTitle: str("The board title repeated back exactly, as a safety check."),
        confirmed,
      },
      ["boardName", "confirmTitle", "confirmed"],
    ),
  },
];

export const ALL_TOOLS: ToolDeclaration[] = [...READ_TOOLS, ...WRITE_TOOLS];

const WRITE_TOOL_NAMES = new Set(WRITE_TOOLS.map((tool) => tool.name));

export type ToolResult =
  | { status: "ok"; data: unknown }
  | { status: "confirmation_required"; summary: string }
  | { status: "executed"; summary: string }
  | { status: "error"; message: string };

function priorityOf(value: JsonValue): TaskPriority {
  const priority = String(value ?? "none") as TaskPriority;
  if (!TASK_PRIORITIES.includes(priority)) {
    throw new AgentError(`Priority must be one of: ${TASK_PRIORITIES.join(", ")}.`);
  }
  return priority;
}

function priorityListOf(value: JsonValue): TaskPriority[] | null {
  if (!Array.isArray(value) || !value.length) return null;
  return value.map((entry) => priorityOf(entry));
}

function text(value: JsonValue): string {
  const result = typeof value === "string" ? value.trim() : "";
  return result;
}

function optional(value: JsonValue): string | null {
  const result = text(value);
  return result || null;
}

async function prepareMutation(
  name: string,
  scope: AgentScope,
  input: ToolInput,
): Promise<PreparedMutation> {
  switch (name) {
    case "create_task":
      return write.createTask(scope, {
        boardName: optional(input.boardName),
        columnName: optional(input.columnName),
        title: text(input.title),
        priority: input.priority ? priorityOf(input.priority) : null,
        assigneeName: optional(input.assigneeName),
        tagName: optional(input.tagName),
      });
    case "rename_task":
      return write.renameTask(scope, {
        taskTitle: text(input.taskTitle),
        newTitle: text(input.newTitle),
        boardName: optional(input.boardName),
      });
    case "move_task":
      return write.moveTask(scope, {
        taskTitle: text(input.taskTitle),
        columnName: text(input.columnName),
        position: typeof input.position === "number" ? input.position : null,
        boardName: optional(input.boardName),
      });
    case "set_task_priority":
      return write.setTaskPriority(scope, {
        taskTitle: text(input.taskTitle),
        priority: priorityOf(input.priority),
        boardName: optional(input.boardName),
      });
    case "set_task_status":
      return write.setTaskStatus(scope, {
        taskTitle: text(input.taskTitle),
        status: text(input.status) as TaskStatus,
        boardName: optional(input.boardName),
      });
    case "set_task_category":
      return write.setTaskCategory(scope, {
        taskTitle: text(input.taskTitle),
        category: optional(input.category) ?? null,
        boardName: optional(input.boardName),
      });
    case "set_task_description":
      return write.setTaskDescription(scope, {
        taskTitle: text(input.taskTitle),
        text: text(input.text),
        boardName: optional(input.boardName),
      });
    case "reorder_task":
      return write.reorderTask(scope, {
        taskTitle: text(input.taskTitle),
        position: Number(input.position),
        boardName: optional(input.boardName),
      });
    case "delete_column":
      return write.deleteColumn(scope, {
        columnName: text(input.columnName),
        moveTasksTo: optional(input.moveTasksTo),
        boardName: optional(input.boardName),
      });
    case "move_column":
      return write.moveColumn(scope, {
        columnName: text(input.columnName),
        position: Number(input.position),
        boardName: optional(input.boardName),
      });
    case "delete_comment":
      return write.deleteComment(scope, {
        taskTitle: text(input.taskTitle),
        textContains: text(input.textContains),
        boardName: optional(input.boardName),
      });
    case "set_task_due_date":
      return write.setTaskDueDate(scope, {
        taskTitle: text(input.taskTitle),
        date: text(input.date),
        boardName: optional(input.boardName),
      });
    case "clear_task_due_date":
      return write.clearTaskDueDate(scope, {
        taskTitle: text(input.taskTitle),
        boardName: optional(input.boardName),
      });
    case "delete_board":
      return write.deleteBoard(scope, {
        boardName: text(input.boardName),
        confirmTitle: optional(input.confirmTitle),
      });
    case "delete_task":
      return write.deleteTask(scope, {
        taskTitle: text(input.taskTitle),
        boardName: optional(input.boardName),
      });
    case "bulk_move_tasks":
      return write.bulkMoveTasks(scope, {
        boardName: optional(input.boardName),
        columnName: text(input.columnName),
        fromColumnName: optional(input.fromColumnName),
        priorities: priorityListOf(input.priorities),
        assigneeName: optional(input.assigneeName),
        titleContains: optional(input.titleContains),
      });
    case "sort_column":
      return write.sortColumn(scope, {
        boardName: optional(input.boardName),
        columnName: text(input.columnName),
        mode: text(input.mode) as "createdAsc",
      });
    case "archive_done":
      return write.archiveDone(scope, { boardName: optional(input.boardName) });
    case "cleanup_empty_tasks":
      return write.cleanupEmptyTasks(scope, { boardName: optional(input.boardName) });
    case "create_column":
      return write.createColumn(scope, {
        boardName: optional(input.boardName),
        name: text(input.name),
      });
    case "rename_column":
      return write.renameColumn(scope, {
        boardName: optional(input.boardName),
        columnName: text(input.columnName),
        newName: text(input.newName),
      });
    case "create_board":
      return write.createBoard(scope, { title: text(input.title), password: text(input.password) });
    case "rename_board":
      return write.renameBoard(scope, {
        boardName: optional(input.boardName),
        newTitle: text(input.newTitle),
      });
    case "add_collaborator":
      return write.addCollaborator(scope, {
        boardName: optional(input.boardName),
        email: text(input.email),
        role: optional(input.role),
      });
    case "remove_collaborator":
      return write.removeCollaborator(scope, {
        boardName: optional(input.boardName),
        email: text(input.email),
      });
    case "add_contributor":
      return write.addContributor(scope, {
        boardName: optional(input.boardName),
        name: text(input.name),
        email: optional(input.email),
      });
    case "assign_task":
      return write.assignTask(scope, {
        taskTitle: text(input.taskTitle),
        assigneeName: text(input.assigneeName),
        boardName: optional(input.boardName),
      });
    case "unassign_task":
      return write.unassignTask(scope, {
        taskTitle: text(input.taskTitle),
        assigneeName: text(input.assigneeName),
        boardName: optional(input.boardName),
      });
    case "add_stakeholder":
      return write.addStakeholder(scope, {
        taskTitle: text(input.taskTitle),
        personName: text(input.personName),
        boardName: optional(input.boardName),
      });
    case "create_tag":
      return write.createTag(scope, {
        boardName: optional(input.boardName),
        name: text(input.name),
      });
    case "tag_task":
      return write.tagTask(scope, {
        taskTitle: text(input.taskTitle),
        tagName: text(input.tagName),
        remove: Boolean(input.remove),
        boardName: optional(input.boardName),
      });
    case "add_comment":
      return write.addComment(scope, {
        taskTitle: text(input.taskTitle),
        text: text(input.text),
        authorName: text(input.authorName),
        boardName: optional(input.boardName),
      });
    default:
      throw new AgentError(`Unknown tool "${name}".`);
  }
}

async function runReadTool(name: string, scope: AgentScope, input: ToolInput): Promise<unknown> {
  switch (name) {
    case "get_pulse":
      return read.getPulse(scope);
    case "list_boards":
      return read.listBoards(scope);
    case "search_tasks":
      return read.searchTasks(scope, {
        boardName: optional(input.boardName),
        titleContains: optional(input.titleContains),
        columnName: optional(input.columnName),
        priorities: priorityListOf(input.priorities),
        assigneeName: optional(input.assigneeName),
        tagName: optional(input.tagName),
        unassigned:
          input.unassigned === undefined || input.unassigned === null
            ? null
            : Boolean(input.unassigned),
        onlyOpen:
          input.onlyOpen === undefined || input.onlyOpen === null ? null : Boolean(input.onlyOpen),
        staleDays: typeof input.staleDays === "number" ? input.staleDays : null,
        dueBefore: optional(input.dueBefore),
        overdue: input.overdue === true,
        hasDueDate: typeof input.hasDueDate === "boolean" ? input.hasDueDate : null,
        limit: typeof input.limit === "number" ? input.limit : null,
      });
    case "get_task_details":
      return read.getTaskDetails(scope, text(input.taskTitle), optional(input.boardName));
    case "list_columns":
      return read.listColumns(scope, optional(input.boardName));
    case "preview_column":
      return read.previewColumn(scope, optional(input.boardName), text(input.columnName));
    case "list_contributors":
      return read.listContributors(scope, optional(input.boardName));
    case "list_collaborators":
      return read.listCollaborators(scope, optional(input.boardName));
    case "list_tags":
      return read.listTags(scope, optional(input.boardName));
    case "get_task_comments":
      return read.getTaskComments(scope, text(input.taskTitle), optional(input.boardName));
    case "get_recent_activity":
      return read.getRecentActivity(scope, typeof input.limit === "number" ? input.limit : null);
    case "get_workload":
      return read.getWorkload(scope);
    case "get_risks":
      return read.getRisks(scope);
    case "get_velocity":
      return read.getVelocity(scope);
    default:
      throw new AgentError(`Unknown tool "${name}".`);
  }
}

/**
 * The single entry point both front ends call. Reads execute immediately;
 * writes always describe themselves first and only run on a second call whose
 * `confirmed` is true.
 */
export async function runTool(
  scope: AgentScope,
  name: string,
  input: ToolInput,
): Promise<ToolResult> {
  try {
    if (!WRITE_TOOL_NAMES.has(name)) {
      return { status: "ok", data: await runReadTool(name, scope, input) };
    }

    const prepared = await prepareMutation(name, scope, input);
    if (input.confirmed !== true) {
      return { status: "confirmation_required", summary: prepared.summary };
    }
    return { status: "executed", summary: await prepared.run() };
  } catch (error) {
    if (error instanceof AgentError) return { status: "error", message: error.message };
    const message = error instanceof Error ? error.message : "That failed.";
    console.error(`[agent] tool ${name} failed:`, message);
    return { status: "error", message: `That did not work: ${message}` };
  }
}
