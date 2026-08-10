import { and, desc, eq, inArray, like } from "drizzle-orm";
import { db } from "@/db";
import {
  boardMembers,
  columns,
  comments,
  contributors,
  tags,
  taskAssignees,
  taskStakeholders,
  taskTags,
  tasks,
  users,
  type TaskPriority,
} from "@/db/schema";
import { AgentError, resolveBoard, resolveColumn, type AgentScope } from "@/lib/agent/scope";
import { classifyColumn, getDashboardStats, isOpenKind } from "@/lib/agent/stats";
import { plainTextFromContent } from "@/lib/agent/text";

/** Every read tool takes plain names, never ids — the model never sees UUIDs. */
export interface SearchTasksInput {
  boardName?: string | null;
  titleContains?: string | null;
  columnName?: string | null;
  priorities?: TaskPriority[] | null;
  assigneeName?: string | null;
  tagName?: string | null;
  unassigned?: boolean | null;
  onlyOpen?: boolean | null;
  staleDays?: number | null;
  /** Only tasks due on or before this YYYY-MM-DD date. */
  dueBefore?: string | null;
  /** Only tasks whose due date has already passed. */
  overdue?: boolean | null;
  /** true for tasks that carry a due date, false for those that do not. */
  hasDueDate?: boolean | null;
  limit?: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

interface TaskShape {
  title: string;
  board: string;
  column: string;
  columnKind: string;
  priority: TaskPriority;
  assignees: string[];
  stakeholders: string[];
  tags: string[];
  comments: number;
  dueAt: string | null;
  /** Days until the due date; negative once it has passed. Null when unset. */
  dueInDays: number | null;
  createdAt: string | null;
  lastActivityAt: string | null;
  idleDays: number;
}

/**
 * Task search is the workhorse behind almost every spoken question, so it takes
 * the union of every filter the dashboard itself can express.
 */
export async function searchTasks(scope: AgentScope, input: SearchTasksInput) {
  const boardIds = input.boardName ? [resolveBoard(scope, input.boardName).id] : scope.boardIds;
  if (!boardIds.length) return { total: 0, returned: 0, tasks: [] as TaskShape[] };

  const limit = Math.min(Math.max(input.limit ?? 25, 1), 50);
  const rows = await db
    .select()
    .from(tasks)
    .where(
      and(
        inArray(tasks.boardId, boardIds),
        input.titleContains ? like(tasks.title, `%${input.titleContains}%`) : undefined,
      ),
    );

  const [
    columnRows,
    assigneeRows,
    stakeholderRows,
    tagLinkRows,
    tagRows,
    contributorRows,
    commentRows,
  ] = await Promise.all([
    db.select().from(columns).where(inArray(columns.boardId, boardIds)),
    db.select().from(taskAssignees),
    db.select().from(taskStakeholders),
    db.select().from(taskTags),
    db.select().from(tags).where(inArray(tags.boardId, boardIds)),
    db.select().from(contributors).where(inArray(contributors.boardId, boardIds)),
    db.select().from(comments).where(inArray(comments.boardId, boardIds)),
  ]);

  const columnById = new Map(columnRows.map((c) => [c.id, c]));
  const contributorById = new Map(contributorRows.map((c) => [c.id, c]));
  const tagById = new Map(tagRows.map((t) => [t.id, t]));
  const boardTitle = new Map(scope.boards.map((b) => [b.id, b.title]));
  const now = new Date();

  const nameOf = (id: string) => contributorById.get(id)?.name ?? "Unknown";
  const namesFor = (taskId: string, links: { taskId: string; contributorId: string }[]) =>
    links.filter((link) => link.taskId === taskId).map((link) => nameOf(link.contributorId));

  let shaped: TaskShape[] = rows.map((task) => {
    const column = columnById.get(task.columnId);
    const taskComments = commentRows.filter((comment) => comment.taskId === task.id);
    const lastComment = taskComments
      .map((comment) => comment.createdAt?.getTime() ?? 0)
      .reduce((max, value) => Math.max(max, value), 0);
    const lastActivity = Math.max(lastComment, task.createdAt?.getTime() ?? 0);
    return {
      title: task.title,
      board: boardTitle.get(task.boardId) ?? "Board",
      column: column?.name ?? "Unknown",
      columnKind: column ? classifyColumn(column.name) : "active",
      priority: task.priority,
      assignees: namesFor(task.id, assigneeRows),
      stakeholders: namesFor(task.id, stakeholderRows),
      tags: tagLinkRows
        .filter((link) => link.taskId === task.id)
        .map((link) => tagById.get(link.tagId)?.name ?? "")
        .filter(Boolean),
      comments: taskComments.length,
      dueAt: task.dueAt?.toISOString() ?? null,
      dueInDays: task.dueAt ? Math.ceil((task.dueAt.getTime() - now.getTime()) / DAY_MS) : null,
      createdAt: task.createdAt?.toISOString() ?? null,
      lastActivityAt: lastActivity ? new Date(lastActivity).toISOString() : null,
      idleDays: lastActivity ? Math.floor((now.getTime() - lastActivity) / DAY_MS) : 0,
    };
  });

  if (input.columnName) {
    const needle = input.columnName
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .trim();
    shaped = shaped.filter((task) =>
      task.column
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, "")
        .trim()
        .includes(needle),
    );
  }
  if (input.priorities?.length) {
    shaped = shaped.filter((task) => input.priorities?.includes(task.priority));
  }
  if (input.assigneeName) {
    const needle = input.assigneeName.toLowerCase();
    shaped = shaped.filter((task) =>
      task.assignees.some((name) => name.toLowerCase().includes(needle)),
    );
  }
  if (input.tagName) {
    const needle = input.tagName.toLowerCase();
    shaped = shaped.filter((task) => task.tags.some((name) => name.toLowerCase().includes(needle)));
  }
  if (input.unassigned) shaped = shaped.filter((task) => task.assignees.length === 0);
  if (input.onlyOpen) {
    shaped = shaped.filter((task) => isOpenKind(task.columnKind as "active"));
  }
  if (input.staleDays !== null && input.staleDays !== undefined) {
    shaped = shaped.filter((task) => task.idleDays >= (input.staleDays ?? 0));
  }
  if (input.hasDueDate !== null && input.hasDueDate !== undefined) {
    shaped = shaped.filter((task) => (task.dueAt !== null) === input.hasDueDate);
  }
  if (input.overdue)
    shaped = shaped.filter((task) => task.dueInDays !== null && task.dueInDays < 0);
  if (input.dueBefore) {
    const cutoff = new Date(`${input.dueBefore.slice(0, 10)}T23:59:59`).getTime();
    if (Number.isNaN(cutoff)) throw new AgentError(`"${input.dueBefore}" is not a real date.`);
    shaped = shaped.filter(
      (task) => task.dueAt !== null && new Date(task.dueAt).getTime() <= cutoff,
    );
  }

  shaped.sort((a, b) => b.idleDays - a.idleDays);
  return {
    total: shaped.length,
    returned: Math.min(shaped.length, limit),
    tasks: shaped.slice(0, limit),
  };
}

/** Full state of exactly one task, resolved by title inside the scope. */
export async function getTaskDetails(
  scope: AgentScope,
  taskTitle: string,
  boardName?: string | null,
) {
  const result = await searchTasks(scope, { boardName, titleContains: taskTitle, limit: 6 });
  const exact = result.tasks.filter(
    (task) => task.title.toLowerCase() === taskTitle.trim().toLowerCase(),
  );
  const candidates = exact.length ? exact : result.tasks;
  if (!candidates.length) throw new AgentError(`No task matching "${taskTitle}".`);
  if (candidates.length > 1) {
    throw new AgentError(
      `"${taskTitle}" matches several tasks: ${candidates.map((t) => `${t.title} (${t.board})`).join("; ")}. Which one?`,
    );
  }
  return candidates[0];
}

export async function listBoards(scope: AgentScope) {
  const stats = await getDashboardStats(scope);
  return { boards: stats.boards };
}

export async function listColumns(scope: AgentScope, boardName?: string | null) {
  const board = resolveBoard(scope, boardName);
  const rows = await db
    .select()
    .from(columns)
    .where(eq(columns.boardId, board.id))
    .orderBy(columns.position);
  const counts = await db.select().from(tasks).where(eq(tasks.boardId, board.id));
  return {
    board: board.title,
    columns: rows.map((column) => ({
      name: column.name,
      position: column.position,
      kind: classifyColumn(column.name),
      collapsed: Boolean(column.isCollapsed),
      tasks: counts.filter((task) => task.columnId === column.id).length,
    })),
  };
}

export async function listContributors(scope: AgentScope, boardName?: string | null) {
  const board = resolveBoard(scope, boardName);
  const rows = await db.select().from(contributors).where(eq(contributors.boardId, board.id));
  const assignments = await db.select().from(taskAssignees);
  return {
    board: board.title,
    contributors: rows.map((contributor) => ({
      name: contributor.name,
      email: contributor.email,
      color: contributor.color,
      assignedTasks: assignments.filter((link) => link.contributorId === contributor.id).length,
    })),
  };
}

export async function listTags(scope: AgentScope, boardName?: string | null) {
  const board = resolveBoard(scope, boardName);
  const rows = await db.select().from(tags).where(eq(tags.boardId, board.id));
  const links = await db.select().from(taskTags);
  return {
    board: board.title,
    tags: rows.map((tag) => ({
      name: tag.name,
      color: tag.color,
      tasks: links.filter((link) => link.tagId === tag.id).length,
    })),
  };
}

/**
 * Collaborators are user accounts with a membership row — distinct from
 * contributors, who are board-local people that work can be assigned to.
 */
export async function listCollaborators(scope: AgentScope, boardName?: string | null) {
  const board = resolveBoard(scope, boardName);
  const rows = await db
    .select({ name: users.name, email: users.email, role: boardMembers.role })
    .from(boardMembers)
    .innerJoin(users, eq(users.id, boardMembers.userId))
    .where(eq(boardMembers.boardId, board.id));
  return { board: board.title, collaborators: rows };
}

export async function getTaskComments(
  scope: AgentScope,
  taskTitle: string,
  boardName?: string | null,
) {
  const boardIds = boardName ? [resolveBoard(scope, boardName).id] : scope.boardIds;
  const matches = await db
    .select()
    .from(tasks)
    .where(and(inArray(tasks.boardId, boardIds), like(tasks.title, `%${taskTitle}%`)));
  if (!matches.length) throw new AgentError(`No task matching "${taskTitle}".`);
  if (matches.length > 1) {
    throw new AgentError(
      `"${taskTitle}" matches several tasks: ${matches.map((t) => t.title).join("; ")}. Which one?`,
    );
  }

  const task = matches[0];
  const rows = await db
    .select()
    .from(comments)
    .where(eq(comments.taskId, task.id))
    .orderBy(desc(comments.createdAt))
    .limit(20);
  const people = await db.select().from(contributors).where(eq(contributors.boardId, task.boardId));
  const nameOf = (id: string) => people.find((person) => person.id === id)?.name ?? "Someone";

  return {
    task: task.title,
    comments: rows.map((comment) => ({
      author: nameOf(comment.authorId),
      stakeholder: comment.stakeholderId ? nameOf(comment.stakeholderId) : null,
      text: plainTextFromContent(comment.content).slice(0, 600),
      createdAt: comment.createdAt?.toISOString() ?? null,
    })),
  };
}

export async function getRecentActivity(scope: AgentScope, limit?: number | null) {
  const stats = await getDashboardStats(scope);
  return { activity: stats.activity.slice(0, Math.min(Math.max(limit ?? 10, 1), 12)) };
}

export async function getWorkload(scope: AgentScope) {
  const stats = await getDashboardStats(scope);
  return { workload: stats.workload, unassigned: stats.totals.unassigned };
}

export async function getRisks(scope: AgentScope) {
  const stats = await getDashboardStats(scope);
  return {
    risks: stats.risks,
    blocked: stats.totals.blocked,
    stale: stats.totals.stale,
    unassigned: stats.totals.unassigned,
  };
}

export async function getVelocity(scope: AgentScope) {
  const stats = await getDashboardStats(scope);
  return { velocity: stats.velocity, doneThisWeek: stats.totals.doneThisWeek };
}

/** The exact numbers rendered on the homepage, so answers never drift from it. */
export async function getPulse(scope: AgentScope) {
  const stats = await getDashboardStats(scope);
  return {
    generatedAt: stats.generatedAt,
    totals: stats.totals,
    health: stats.health,
    pipeline: stats.pipeline,
    priorityMix: stats.priorityMix,
    topPriority: stats.topPriority,
  };
}

/** Board-scoped column preview used before a move, so positions stay sane. */
export async function previewColumn(
  scope: AgentScope,
  boardName: string | null,
  columnName: string,
) {
  const board = resolveBoard(scope, boardName);
  const column = await resolveColumn(board.id, columnName);
  const rows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.columnId, column.id))
    .orderBy(tasks.position);
  return {
    board: board.title,
    column: column.name,
    tasks: rows.map((task, index) => ({
      position: index,
      title: task.title,
      priority: task.priority,
    })),
  };
}
