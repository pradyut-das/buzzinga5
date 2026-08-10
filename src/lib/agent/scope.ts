import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  boardMembers,
  boards,
  columns,
  contributors,
  tags,
  taskAssignees,
  taskCategories,
  taskTags,
  tasks,
} from "@/db/schema";
import { requireUser } from "@/lib/auth/session";

/**
 * The agent never uses the board-password cookie gate. It acts on behalf of a
 * signed-in user, so board membership is the only authorization it accepts —
 * a voice session lives longer than any single board's unlock cookie.
 */
export interface AgentScope {
  userId: string;
  userName: string;
  userEmail: string;
  /** Board ids the user is a member of. Every tool is confined to these. */
  boardIds: string[];
  boards: { id: string; title: string; role: string }[];
}

export async function getAgentScope(): Promise<AgentScope> {
  const user = await requireUser();

  const rows = await db
    .select({ id: boards.id, title: boards.title, role: boardMembers.role })
    .from(boardMembers)
    .innerJoin(boards, eq(boards.id, boardMembers.boardId))
    .where(eq(boardMembers.userId, user.id));

  return {
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    boardIds: rows.map((row) => row.id),
    boards: rows,
  };
}

/** Column names carry emoji ("📥 To do"), so strip non-letters before matching. */
function plain(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

/** Edit distance, used only to rank near-misses for a "did you mean" reply. */
function distance(a: string, b: string): number {
  const rows = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = rows[0];
    rows[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const carry = rows[j];
      rows[j] = Math.min(rows[j] + 1, rows[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = carry;
    }
  }
  return rows[b.length];
}

/**
 * Speech mishears names, so a miss is usually a near-miss. Ranks the candidates
 * closest to what was heard and phrases them as a question the agent can read
 * out — never as a silent guess.
 */
export function didYouMean(heard: string, candidates: string[], limit = 3): string {
  const needle = plain(heard);
  if (!needle || !candidates.length) return "";
  const ranked = candidates
    .map((candidate) => {
      const other = plain(candidate);
      const shared = needle
        .split(" ")
        .filter((word) => word.length > 2 && other.includes(word)).length;
      return { candidate, score: distance(needle, other) - shared * 3 };
    })
    // Anything wildly different is not a mishearing; keep the bar loose but real.
    .filter(({ score }) => score <= Math.max(4, Math.round(needle.length * 0.6)))
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map(({ candidate }) => `"${candidate}"`);

  if (!ranked.length) return "";
  return ranked.length === 1
    ? ` Did you mean ${ranked[0]}?`
    : ` Did you mean ${ranked.slice(0, -1).join(", ")} or ${ranked[ranked.length - 1]}?`;
}

export class AgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentError";
  }
}

/** Resolves a spoken/typed board name to exactly one board inside the scope. */
export function resolveBoard(scope: AgentScope, boardName?: string | null) {
  if (!scope.boards.length) {
    throw new AgentError("You are not a member of any board yet. Create one first.");
  }
  if (!boardName?.trim()) {
    if (scope.boards.length === 1) return scope.boards[0];
    throw new AgentError(
      `Which board? You are a member of: ${scope.boards.map((b) => b.title).join(", ")}.`,
    );
  }

  const needle = boardName.trim().toLowerCase();
  const exact = scope.boards.filter((b) => b.title.toLowerCase() === needle);
  if (exact.length === 1) return exact[0];

  const partial = scope.boards.filter((b) => b.title.toLowerCase().includes(needle));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    throw new AgentError(
      `"${boardName}" matches several boards: ${partial.map((b) => b.title).join(", ")}. Which one?`,
    );
  }
  const titles = scope.boards.map((b) => b.title);
  throw new AgentError(
    `No board called "${boardName}".${didYouMean(boardName, titles)} Your boards are: ${titles.join(", ")}.`,
  );
}

/**
 * A canonical-name snapshot handed to the model when a session opens, so it
 * resolves spoken names against real rows instead of inventing them.
 */
export interface AgentDirectory {
  today: string;
  user: { name: string; email: string };
  boards: {
    id: string;
    title: string;
    role: string;
    columns: string[];
    contributors: string[];
    tags: string[];
    /** The board's own task categories, in display order. */
    categories: string[];
    /** Every task the board holds, shortened — the model reads names, not ids. */
    tasks: {
      title: string;
      column: string;
      status: string;
      category?: string;
      priority: string;
      /** YYYY-MM-DD, absent when the task has no deadline. */
      due?: string;
      assignees?: string[];
      tags?: string[];
    }[];
    /** Set when the board was too big to inline; the rest live behind search_tasks. */
    tasksOmitted?: number;
  }[];
}

/**
 * How many tasks per board go into the system instruction. Big enough that the
 * agent recognises what the user is talking about without a lookup, small
 * enough that the instruction stays cheap on every session.
 */
const DIRECTORY_TASK_LIMIT = 150;

export async function getAgentDirectory(scope: AgentScope): Promise<AgentDirectory> {
  const ids = scope.boardIds;
  const [allColumns, allContributors, allTags, allCategories, allTasks, assignments, taggings] =
    ids.length
      ? await Promise.all([
          db
            .select({
              id: columns.id,
              boardId: columns.boardId,
              name: columns.name,
              position: columns.position,
            })
            .from(columns)
            .where(inArray(columns.boardId, ids)),
          db
            .select({ boardId: contributors.boardId, name: contributors.name })
            .from(contributors)
            .where(inArray(contributors.boardId, ids)),
          db
            .select({ boardId: tags.boardId, name: tags.name })
            .from(tags)
            .where(inArray(tags.boardId, ids)),
          db
            .select({
              id: taskCategories.id,
              boardId: taskCategories.boardId,
              name: taskCategories.name,
              position: taskCategories.position,
            })
            .from(taskCategories)
            .where(inArray(taskCategories.boardId, ids)),
          db
            .select({
              id: tasks.id,
              boardId: tasks.boardId,
              columnId: tasks.columnId,
              title: tasks.title,
              status: tasks.status,
              categoryId: tasks.categoryId,
              priority: tasks.priority,
              dueAt: tasks.dueAt,
              position: tasks.position,
            })
            .from(tasks)
            .where(inArray(tasks.boardId, ids))
            .orderBy(tasks.position),
          db
            .select({ taskId: taskAssignees.taskId, name: contributors.name })
            .from(taskAssignees)
            .innerJoin(contributors, eq(contributors.id, taskAssignees.contributorId))
            .where(inArray(contributors.boardId, ids)),
          db
            .select({ taskId: taskTags.taskId, name: tags.name })
            .from(taskTags)
            .innerJoin(tags, eq(tags.id, taskTags.tagId))
            .where(inArray(tags.boardId, ids)),
        ])
      : [[], [], [], [], [], [], []];

  const columnNameById = new Map(allColumns.map((column) => [column.id, column.name]));
  const categoryNameById = new Map(allCategories.map((category) => [category.id, category.name]));
  const assigneesByTask = new Map<string, string[]>();
  for (const row of assignments) {
    assigneesByTask.set(row.taskId, [...(assigneesByTask.get(row.taskId) ?? []), row.name]);
  }
  const tagsByTask = new Map<string, string[]>();
  for (const row of taggings) {
    tagsByTask.set(row.taskId, [...(tagsByTask.get(row.taskId) ?? []), row.name]);
  }

  return {
    today: new Date().toISOString().slice(0, 10),
    user: { name: scope.userName, email: scope.userEmail },
    boards: scope.boards.map((board) => {
      const boardColumns = allColumns
        .filter((c) => c.boardId === board.id)
        .sort((a, b) => a.position - b.position);
      const boardTasks = allTasks.filter((task) => task.boardId === board.id);
      const order = new Map(boardColumns.map((column, index) => [column.id, index]));
      const sorted = boardTasks.sort(
        (a, b) =>
          (order.get(a.columnId) ?? 99) - (order.get(b.columnId) ?? 99) || a.position - b.position,
      );

      return {
        id: board.id,
        title: board.title,
        role: board.role,
        columns: boardColumns.map((c) => c.name),
        contributors: allContributors.filter((c) => c.boardId === board.id).map((c) => c.name),
        tags: allTags.filter((t) => t.boardId === board.id).map((t) => t.name),
        categories: allCategories
          .filter((c) => c.boardId === board.id)
          .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
          .map((c) => c.name),
        tasks: sorted.slice(0, DIRECTORY_TASK_LIMIT).map((task) => {
          const assignees = assigneesByTask.get(task.id);
          const taskTagNames = tagsByTask.get(task.id);
          return {
            title: task.title,
            column: columnNameById.get(task.columnId) ?? "unknown",
            status: task.status,
            ...(categoryNameById.get(task.categoryId ?? "")
              ? { category: categoryNameById.get(task.categoryId ?? "")! }
              : {}),
            priority: task.priority,
            ...(task.dueAt ? { due: task.dueAt.toISOString().slice(0, 10) } : {}),
            ...(assignees?.length ? { assignees } : {}),
            ...(taskTagNames?.length ? { tags: taskTagNames } : {}),
          };
        }),
        ...(sorted.length > DIRECTORY_TASK_LIMIT
          ? { tasksOmitted: sorted.length - DIRECTORY_TASK_LIMIT }
          : {}),
      };
    }),
  };
}

/** Resolves a column name inside one board. */
export async function resolveColumn(boardId: string, columnName?: string | null) {
  const rows = await db
    .select({ id: columns.id, name: columns.name, position: columns.position })
    .from(columns)
    .where(eq(columns.boardId, boardId))
    .orderBy(columns.position);

  if (!rows.length) throw new AgentError("That board has no columns yet.");
  if (!columnName?.trim()) return rows[0];

  const needle = columnName.trim().toLowerCase();
  const exact = rows.filter((c) => c.name.toLowerCase() === needle);
  if (exact.length === 1) return exact[0];

  const loose = rows.filter((c) => plain(c.name).includes(plain(needle)) && plain(needle));
  if (loose.length === 1) return loose[0];
  if (loose.length > 1) {
    throw new AgentError(
      `"${columnName}" matches several columns: ${loose.map((c) => c.name).join(", ")}. Which one?`,
    );
  }
  const names = rows.map((c) => c.name);
  throw new AgentError(
    `No column called "${columnName}".${didYouMean(columnName, names)} This board has: ${names.join(", ")}.`,
  );
}

/** Resolves a contributor name inside one board. */
export async function resolveContributor(boardId: string, name: string) {
  const rows = await db
    .select({ id: contributors.id, name: contributors.name, email: contributors.email })
    .from(contributors)
    .where(eq(contributors.boardId, boardId));

  const needle = name.trim().toLowerCase();
  const exact = rows.filter((c) => c.name.toLowerCase() === needle);
  if (exact.length === 1) return exact[0];

  const partial = rows.filter((c) => c.name.toLowerCase().includes(needle));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    throw new AgentError(
      `"${name}" matches several people: ${partial.map((c) => c.name).join(", ")}. Which one?`,
    );
  }
  const people = rows.map((c) => c.name);
  throw new AgentError(
    `No contributor called "${name}" on this board.${didYouMean(name, people)} Known people: ${people.join(", ") || "none yet"}.`,
  );
}

/** Resolves a tag name inside one board. */
export async function resolveTag(boardId: string, name: string) {
  const rows = await db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(and(eq(tags.boardId, boardId)));

  const needle = name.trim().toLowerCase();
  const match =
    rows.find((t) => t.name.toLowerCase() === needle) ??
    rows.find((t) => t.name.toLowerCase().includes(needle));
  if (!match) {
    const names = rows.map((t) => t.name);
    throw new AgentError(
      `No tag called "${name}".${didYouMean(name, names)} This board has: ${names.join(", ") || "no tags yet"}.`,
    );
  }
  return match;
}
