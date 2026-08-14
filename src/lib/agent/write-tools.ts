import { and, eq, gt, gte, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  BOARD_MEMBER_ROLES,
  boardMembers,
  boards,
  columns,
  comments,
  contributors,
  docs,
  tags,
  taskAssignees,
  taskCategories,
  taskStakeholders,
  taskTags,
  tasks,
  users,
  TASK_STATUSES,
  type TaskPriority,
  type TaskStatus,
} from "@/db/schema";
import { getRandomContributorColor } from "@/lib/contributor-colors";
import { hashPassword } from "@/lib/password-hash";
import { addBoardMember } from "@/lib/auth/membership";
import {
  queueAssignNotification,
  queueCommentNotification,
  queueMoveNotification,
  queuePriorityNotification,
} from "@/lib/notifications";
import {
  AgentError,
  didYouMean,
  resolveBoard,
  resolveColumn,
  resolveContributor,
  resolveTag,
  type AgentScope,
} from "@/lib/agent/scope";
import { contentFromPlainText } from "@/lib/agent/text";
import { semanticSearch, TASK_SOURCE_TYPES } from "@/lib/search/semantic";
import { createDocument, deleteDocument, renameDocument, saveDocument } from "@/actions/docs";
import { resolveClient, resolveDocByTitle } from "@/lib/agent/read-tools";

/**
 * Every mutation is prepared before it runs. The first tool call always returns
 * the summary for confirmation; only a second call with `confirmed: true`
 * invokes `run`. This is the same two-step contract Squirrl uses so a voice
 * session can never write on a misheard sentence.
 */
export interface PreparedMutation {
  summary: string;
  run: () => Promise<string>;
}

const MAX_BULK = 25;

function refresh(boardId: string) {
  revalidatePath(`/boards/${boardId}`);
  revalidatePath("/");
}

async function findTask(scope: AgentScope, taskTitle: string, boardName?: string | null) {
  const boardIds = boardName ? [resolveBoard(scope, boardName).id] : scope.boardIds;
  if (!boardIds.length) throw new AgentError("You are not a member of any board yet.");

  const rows = await db.select().from(tasks).where(inArray(tasks.boardId, boardIds));
  const needle = taskTitle.trim().toLowerCase();
  const exact = rows.filter((task) => task.title.toLowerCase() === needle);
  const substring = rows.filter((task) => task.title.toLowerCase().includes(needle));

  // A write resolves by wording first. Meaning is consulted every time, but
  // only ever to *offer* candidates: silently mutating the task an embedding
  // suggested is not something the user can undo by saying "no".
  const candidates = exact.length ? exact : substring;

  if (!candidates.length) {
    // Spoken requests describe work rather than quote it, so before giving up
    // ask the index what this sounds like. The suggestions are offered as a
    // question, never acted on — a write still needs the user to confirm.
    const byId = new Map(rows.map((task) => [task.id, task]));
    const { rows: hits } = await semanticSearch({
      query: taskTitle,
      boardIds,
      sourceTypes: [...TASK_SOURCE_TYPES],
      limit: 8,
    });
    const suggested: string[] = [];
    for (const hit of hits) {
      const task = hit.row.taskId ? byId.get(hit.row.taskId) : undefined;
      if (task && !suggested.includes(task.title)) suggested.push(task.title);
      if (suggested.length === 3) break;
    }

    throw new AgentError(
      suggested.length
        ? `No task titled "${taskTitle}". Closest by meaning: ${suggested.join("; ")}. Which one?`
        : `No task matching "${taskTitle}".${didYouMean(
            taskTitle,
            rows.map((task) => task.title),
          )}`,
    );
  }
  if (candidates.length > 1) {
    throw new AgentError(
      `"${taskTitle}" matches ${candidates.length} tasks: ${candidates
        .slice(0, 5)
        .map((t) => t.title)
        .join("; ")}. Which one?`,
    );
  }
  return candidates[0];
}

function boardTitleOf(scope: AgentScope, boardId: string) {
  return scope.boards.find((board) => board.id === boardId)?.title ?? "board";
}

async function nextPosition(columnId: string) {
  const result = await db
    .select({ max: sql<number>`COALESCE(MAX(${tasks.position}), -1)` })
    .from(tasks)
    .where(eq(tasks.columnId, columnId));
  return (result[0]?.max ?? -1) + 1;
}

// ── Boards and collaborators ────────────────────────────────────────────────

export function createBoard(
  scope: AgentScope,
  input: { title: string; password: string },
): PreparedMutation {
  const title = input.title?.trim();
  if (!title) throw new AgentError("What should the new board be called?");
  if (!input.password || input.password.length < 4) {
    throw new AgentError("A new board needs a share password of at least 4 characters.");
  }

  return {
    summary: `Create a new board "${title}" owned by you, with the default To do / Doing / Done / Archive columns.`,
    run: async () => {
      const id = crypto.randomUUID();
      await db.insert(boards).values({
        id,
        title,
        passwordHash: hashPassword(input.password),
        ownerId: scope.userId,
        createdAt: new Date(),
      });
      await addBoardMember(id, scope.userId, "owner");

      const defaults = ["📥 To do", "🔄 Doing", "✅ Done"];
      for (let index = 0; index < defaults.length; index += 1) {
        await db.insert(columns).values({
          id: crypto.randomUUID(),
          boardId: id,
          name: defaults[index],
          position: index,
        });
      }
      await db.insert(columns).values({
        id: crypto.randomUUID(),
        boardId: id,
        name: "📦 Archive",
        position: defaults.length,
        isCollapsed: true,
      });

      refresh(id);
      return `Created board "${title}".`;
    },
  };
}

export function renameBoard(
  scope: AgentScope,
  input: { boardName?: string | null; newTitle: string },
): PreparedMutation {
  const board = resolveBoard(scope, input.boardName);
  const newTitle = input.newTitle?.trim();
  if (!newTitle) throw new AgentError("What should the board be renamed to?");

  return {
    summary: `Rename the board "${board.title}" to "${newTitle}".`,
    run: async () => {
      await db.update(boards).set({ title: newTitle }).where(eq(boards.id, board.id));
      refresh(board.id);
      return `Renamed "${board.title}" to "${newTitle}".`;
    },
  };
}

/**
 * A collaborator is an existing account, added to the board by email. Accounts
 * are never created here: inviting a stranger by voice would hand board access
 * to an address nobody verified.
 */
export function addCollaborator(
  scope: AgentScope,
  input: { boardName?: string | null; email: string; role?: string | null },
): PreparedMutation {
  const board = resolveBoard(scope, input.boardName);
  const email = input.email?.trim().toLowerCase();
  if (!email) throw new AgentError("Which email address should I add as a collaborator?");
  const role = (input.role ?? "member").toLowerCase();
  if (!BOARD_MEMBER_ROLES.includes(role as "member")) {
    throw new AgentError(`Role must be one of: ${BOARD_MEMBER_ROLES.join(", ")}.`);
  }

  return {
    summary: `Give ${email} ${role} access to the board "${board.title}".`,
    run: async () => {
      const account = await db.query.users.findFirst({ where: eq(users.email, email) });
      if (!account) {
        throw new AgentError(
          `No account uses ${email}. They need to sign up first, then you can add them.`,
        );
      }
      await addBoardMember(board.id, account.id, role as "member");
      refresh(board.id);
      return `${account.name} (${email}) can now open "${board.title}".`;
    },
  };
}

export function removeCollaborator(
  scope: AgentScope,
  input: { boardName?: string | null; email: string },
): PreparedMutation {
  const board = resolveBoard(scope, input.boardName);
  const email = input.email?.trim().toLowerCase();
  if (!email) throw new AgentError("Which collaborator should I remove?");

  return {
    summary: `Remove ${email} from the board "${board.title}". They lose access immediately.`,
    run: async () => {
      const account = await db.query.users.findFirst({ where: eq(users.email, email) });
      if (!account) throw new AgentError(`No account uses ${email}.`);
      if (account.id === scope.userId) {
        throw new AgentError("You cannot remove your own access from a board.");
      }
      await db
        .delete(boardMembers)
        .where(and(eq(boardMembers.boardId, board.id), eq(boardMembers.userId, account.id)));
      refresh(board.id);
      return `Removed ${email} from "${board.title}".`;
    },
  };
}

// ── Columns ─────────────────────────────────────────────────────────────────

export function createColumn(
  scope: AgentScope,
  input: { boardName?: string | null; name: string },
): PreparedMutation {
  const board = resolveBoard(scope, input.boardName);
  const name = input.name?.trim();
  if (!name) throw new AgentError("What should the new column be called?");

  return {
    summary: `Add a column "${name}" to the end of "${board.title}".`,
    run: async () => {
      const result = await db
        .select({ max: sql<number>`COALESCE(MAX(${columns.position}), -1)` })
        .from(columns)
        .where(eq(columns.boardId, board.id));
      await db.insert(columns).values({
        id: crypto.randomUUID(),
        boardId: board.id,
        name,
        position: (result[0]?.max ?? -1) + 1,
      });
      refresh(board.id);
      return `Added column "${name}" to "${board.title}".`;
    },
  };
}

export function renameColumn(
  scope: AgentScope,
  input: { boardName?: string | null; columnName: string; newName: string },
): PreparedMutation {
  const board = resolveBoard(scope, input.boardName);
  const newName = input.newName?.trim();
  if (!newName) throw new AgentError("What should the column be renamed to?");

  return {
    summary: `Rename the "${input.columnName}" column on "${board.title}" to "${newName}".`,
    run: async () => {
      const column = await resolveColumn(board.id, input.columnName);
      await db.update(columns).set({ name: newName }).where(eq(columns.id, column.id));
      refresh(board.id);
      return `Renamed "${column.name}" to "${newName}".`;
    },
  };
}

// ── Tasks ───────────────────────────────────────────────────────────────────

export function createTask(
  scope: AgentScope,
  input: {
    boardName?: string | null;
    columnName?: string | null;
    title: string;
    priority?: TaskPriority | null;
    assigneeName?: string | null;
    tagName?: string | null;
  },
): PreparedMutation {
  const board = resolveBoard(scope, input.boardName);
  const title = input.title?.trim();
  if (!title) throw new AgentError("What should the task be called?");

  const extras = [
    input.priority && input.priority !== "none" ? `priority ${input.priority}` : null,
    input.assigneeName ? `assigned to ${input.assigneeName}` : null,
    input.tagName ? `tagged ${input.tagName}` : null,
  ].filter(Boolean);

  return {
    summary: `Create "${title}" in ${input.columnName ?? "the first column"} on "${board.title}"${extras.length ? `, ${extras.join(", ")}` : ""}.`,
    run: async () => {
      const column = await resolveColumn(board.id, input.columnName);
      const id = crypto.randomUUID();
      await db.insert(tasks).values({
        id,
        boardId: board.id,
        columnId: column.id,
        title,
        priority: input.priority ?? "none",
        position: await nextPosition(column.id),
        createdAt: new Date(),
      });

      if (input.assigneeName) {
        const contributor = await resolveContributor(board.id, input.assigneeName);
        await db.insert(taskAssignees).values({ taskId: id, contributorId: contributor.id });
        await queueAssignNotification({
          boardId: board.id,
          taskId: id,
          assigneeId: contributor.id,
        });
      }
      if (input.tagName) {
        const tag = await resolveTag(board.id, input.tagName);
        await db.insert(taskTags).values({ taskId: id, tagId: tag.id });
      }

      refresh(board.id);
      return `Created "${title}" in ${column.name} on "${board.title}".`;
    },
  };
}

export async function renameTask(
  scope: AgentScope,
  input: { taskTitle: string; newTitle: string; boardName?: string | null },
): Promise<PreparedMutation> {
  const task = await findTask(scope, input.taskTitle, input.boardName);
  const newTitle = input.newTitle?.trim();
  if (!newTitle) throw new AgentError("What should the task be renamed to?");

  return {
    summary: `Rename "${task.title}" to "${newTitle}".`,
    run: async () => {
      await db.update(tasks).set({ title: newTitle }).where(eq(tasks.id, task.id));
      refresh(task.boardId);
      return `Renamed "${task.title}" to "${newTitle}".`;
    },
  };
}

export async function moveTask(
  scope: AgentScope,
  input: {
    taskTitle: string;
    columnName: string;
    boardName?: string | null;
    position?: number | null;
  },
): Promise<PreparedMutation> {
  const task = await findTask(scope, input.taskTitle, input.boardName);
  const target = await resolveColumn(task.boardId, input.columnName);
  const from = await db.query.columns.findFirst({ where: eq(columns.id, task.columnId) });

  return {
    summary: `Move "${task.title}" from ${from?.name ?? "its column"} to ${target.name} on "${boardTitleOf(scope, task.boardId)}".`,
    run: async () => {
      if (
        target.id === task.columnId &&
        (input.position === null || input.position === undefined)
      ) {
        return `"${task.title}" is already in ${target.name}.`;
      }

      // Close the gap the task leaves behind, then open one where it lands, so
      // positions stay dense and the board renders in the requested order.
      await db
        .update(tasks)
        .set({ position: sql`${tasks.position} - 1` })
        .where(and(eq(tasks.columnId, task.columnId), gt(tasks.position, task.position)));

      const end = await nextPosition(target.id);
      const position = Math.max(0, Math.min(input.position ?? end, end));
      await db
        .update(tasks)
        .set({ position: sql`${tasks.position} + 1` })
        .where(and(eq(tasks.columnId, target.id), gte(tasks.position, position)));

      await db.update(tasks).set({ columnId: target.id, position }).where(eq(tasks.id, task.id));

      if (from && from.id !== target.id) {
        await queueMoveNotification({
          boardId: task.boardId,
          taskId: task.id,
          fromColumnName: from.name,
          toColumnName: target.name,
        });
      }
      refresh(task.boardId);
      return `Moved "${task.title}" to ${target.name}.`;
    },
  };
}

export async function setTaskPriority(
  scope: AgentScope,
  input: { taskTitle: string; priority: TaskPriority; boardName?: string | null },
): Promise<PreparedMutation> {
  const task = await findTask(scope, input.taskTitle, input.boardName);
  return {
    summary: `Set "${task.title}" to ${input.priority} priority (currently ${task.priority}).`,
    run: async () => {
      await db.update(tasks).set({ priority: input.priority }).where(eq(tasks.id, task.id));
      await queuePriorityNotification({
        boardId: task.boardId,
        taskId: task.id,
        priority: input.priority,
      });
      refresh(task.boardId);
      return `"${task.title}" is now ${input.priority} priority.`;
    },
  };
}

export async function deleteTask(
  scope: AgentScope,
  input: { taskTitle: string; boardName?: string | null },
): Promise<PreparedMutation> {
  const task = await findTask(scope, input.taskTitle, input.boardName);
  return {
    summary: `Permanently delete "${task.title}" from "${boardTitleOf(scope, task.boardId)}", including its comments, tags and assignments.`,
    run: async () => {
      // Every link table uses onDelete: restrict, so the joins go first.
      await db.delete(taskAssignees).where(eq(taskAssignees.taskId, task.id));
      await db.delete(taskStakeholders).where(eq(taskStakeholders.taskId, task.id));
      await db.delete(taskTags).where(eq(taskTags.taskId, task.id));
      await db.delete(comments).where(eq(comments.taskId, task.id));
      await db.delete(tasks).where(eq(tasks.id, task.id));
      await db
        .update(tasks)
        .set({ position: sql`${tasks.position} - 1` })
        .where(and(eq(tasks.columnId, task.columnId), gt(tasks.position, task.position)));
      refresh(task.boardId);
      return `Deleted "${task.title}".`;
    },
  };
}

/** Moves every task matching a bounded filter — the one shape that can rewrite a board. */
export async function bulkMoveTasks(
  scope: AgentScope,
  input: {
    boardName?: string | null;
    columnName: string;
    fromColumnName?: string | null;
    priorities?: TaskPriority[] | null;
    assigneeName?: string | null;
    titleContains?: string | null;
  },
): Promise<PreparedMutation> {
  const board = resolveBoard(scope, input.boardName);
  const hasBoundary = Boolean(
    input.fromColumnName || input.priorities?.length || input.assigneeName || input.titleContains,
  );
  if (!hasBoundary) {
    throw new AgentError(
      "A bulk move needs a boundary. Name a source column, a priority, a person, or words in the title.",
    );
  }

  const target = await resolveColumn(board.id, input.columnName);
  const source = input.fromColumnName ? await resolveColumn(board.id, input.fromColumnName) : null;
  let candidates = await db.select().from(tasks).where(eq(tasks.boardId, board.id));
  if (source) candidates = candidates.filter((task) => task.columnId === source.id);
  if (input.priorities?.length) {
    candidates = candidates.filter((task) => input.priorities?.includes(task.priority));
  }
  if (input.titleContains) {
    const needle = input.titleContains.toLowerCase();
    candidates = candidates.filter((task) => task.title.toLowerCase().includes(needle));
  }
  if (input.assigneeName) {
    const contributor = await resolveContributor(board.id, input.assigneeName);
    const links = await db
      .select()
      .from(taskAssignees)
      .where(eq(taskAssignees.contributorId, contributor.id));
    const assigned = new Set(links.map((link) => link.taskId));
    candidates = candidates.filter((task) => assigned.has(task.id));
  }
  candidates = candidates.filter((task) => task.columnId !== target.id);

  if (!candidates.length)
    throw new AgentError("Nothing matches that filter, so there is nothing to move.");
  if (candidates.length > MAX_BULK) {
    throw new AgentError(
      `That would move ${candidates.length} tasks, over the ${MAX_BULK}-row limit. Narrow it down.`,
    );
  }

  return {
    summary: `Move ${candidates.length} task${candidates.length === 1 ? "" : "s"} into ${target.name} on "${board.title}": ${candidates
      .slice(0, 8)
      .map((task) => task.title)
      .join("; ")}${candidates.length > 8 ? "…" : ""}.`,
    run: async () => {
      let position = await nextPosition(target.id);
      for (const task of candidates) {
        await db.update(tasks).set({ columnId: target.id, position }).where(eq(tasks.id, task.id));
        position += 1;
      }
      refresh(board.id);
      return `Moved ${candidates.length} task${candidates.length === 1 ? "" : "s"} to ${target.name}.`;
    },
  };
}

// ── People, tags and comments ───────────────────────────────────────────────

export function addContributor(
  scope: AgentScope,
  input: { boardName?: string | null; name: string; email?: string | null },
): PreparedMutation {
  const board = resolveBoard(scope, input.boardName);
  const name = input.name?.trim();
  if (!name) throw new AgentError("What is the person's name?");

  return {
    summary: `Add ${name}${input.email ? ` (${input.email})` : ""} as a contributor on "${board.title}".`,
    run: async () => {
      const existing = await db
        .select()
        .from(contributors)
        .where(eq(contributors.boardId, board.id));
      if (existing.some((person) => person.name.toLowerCase() === name.toLowerCase())) {
        throw new AgentError(`${name} is already a contributor on "${board.title}".`);
      }
      await db.insert(contributors).values({
        id: crypto.randomUUID(),
        boardId: board.id,
        name,
        email: input.email?.trim() || null,
        color: getRandomContributorColor(),
      });
      refresh(board.id);
      return `Added ${name} to "${board.title}".`;
    },
  };
}

export async function assignTask(
  scope: AgentScope,
  input: { taskTitle: string; assigneeName: string; boardName?: string | null },
): Promise<PreparedMutation> {
  const task = await findTask(scope, input.taskTitle, input.boardName);
  const contributor = await resolveContributor(task.boardId, input.assigneeName);

  return {
    summary: `Assign "${task.title}" to ${contributor.name}.`,
    run: async () => {
      const existing = await db
        .select()
        .from(taskAssignees)
        .where(
          and(eq(taskAssignees.taskId, task.id), eq(taskAssignees.contributorId, contributor.id)),
        );
      if (existing.length) return `${contributor.name} is already on "${task.title}".`;

      await db.insert(taskAssignees).values({ taskId: task.id, contributorId: contributor.id });
      await queueAssignNotification({
        boardId: task.boardId,
        taskId: task.id,
        assigneeId: contributor.id,
      });
      refresh(task.boardId);
      return `Assigned "${task.title}" to ${contributor.name}.`;
    },
  };
}

export async function unassignTask(
  scope: AgentScope,
  input: { taskTitle: string; assigneeName: string; boardName?: string | null },
): Promise<PreparedMutation> {
  const task = await findTask(scope, input.taskTitle, input.boardName);
  const contributor = await resolveContributor(task.boardId, input.assigneeName);

  return {
    summary: `Take ${contributor.name} off "${task.title}".`,
    run: async () => {
      await db
        .delete(taskAssignees)
        .where(
          and(eq(taskAssignees.taskId, task.id), eq(taskAssignees.contributorId, contributor.id)),
        );
      refresh(task.boardId);
      return `${contributor.name} is no longer assigned to "${task.title}".`;
    },
  };
}

export async function addStakeholder(
  scope: AgentScope,
  input: { taskTitle: string; personName: string; boardName?: string | null },
): Promise<PreparedMutation> {
  const task = await findTask(scope, input.taskTitle, input.boardName);
  const contributor = await resolveContributor(task.boardId, input.personName);

  return {
    summary: `Add ${contributor.name} as a stakeholder on "${task.title}".`,
    run: async () => {
      const existing = await db
        .select()
        .from(taskStakeholders)
        .where(
          and(
            eq(taskStakeholders.taskId, task.id),
            eq(taskStakeholders.contributorId, contributor.id),
          ),
        );
      if (existing.length)
        return `${contributor.name} is already a stakeholder on "${task.title}".`;
      await db.insert(taskStakeholders).values({ taskId: task.id, contributorId: contributor.id });
      refresh(task.boardId);
      return `${contributor.name} is now a stakeholder on "${task.title}".`;
    },
  };
}

export function createTag(
  scope: AgentScope,
  input: { boardName?: string | null; name: string },
): PreparedMutation {
  const board = resolveBoard(scope, input.boardName);
  const name = input.name?.trim();
  if (!name) throw new AgentError("What should the tag be called?");

  return {
    summary: `Create the tag "${name}" on "${board.title}".`,
    run: async () => {
      const existing = await db.select().from(tags).where(eq(tags.boardId, board.id));
      if (existing.some((tag) => tag.name.toLowerCase() === name.toLowerCase())) {
        throw new AgentError(`"${name}" already exists on "${board.title}".`);
      }
      await db.insert(tags).values({
        id: crypto.randomUUID(),
        boardId: board.id,
        name,
        color: getRandomContributorColor(),
      });
      refresh(board.id);
      return `Created tag "${name}".`;
    },
  };
}

export async function tagTask(
  scope: AgentScope,
  input: { taskTitle: string; tagName: string; boardName?: string | null; remove?: boolean | null },
): Promise<PreparedMutation> {
  const task = await findTask(scope, input.taskTitle, input.boardName);
  const tag = await resolveTag(task.boardId, input.tagName);
  const remove = Boolean(input.remove);

  return {
    summary: remove
      ? `Remove the "${tag.name}" tag from "${task.title}".`
      : `Tag "${task.title}" with "${tag.name}".`,
    run: async () => {
      if (remove) {
        await db
          .delete(taskTags)
          .where(and(eq(taskTags.taskId, task.id), eq(taskTags.tagId, tag.id)));
        refresh(task.boardId);
        return `Removed "${tag.name}" from "${task.title}".`;
      }
      const existing = await db
        .select()
        .from(taskTags)
        .where(and(eq(taskTags.taskId, task.id), eq(taskTags.tagId, tag.id)));
      if (existing.length) return `"${task.title}" already has the "${tag.name}" tag.`;
      await db.insert(taskTags).values({ taskId: task.id, tagId: tag.id });
      refresh(task.boardId);
      return `Tagged "${task.title}" with "${tag.name}".`;
    },
  };
}

export async function addComment(
  scope: AgentScope,
  input: { taskTitle: string; text: string; authorName: string; boardName?: string | null },
): Promise<PreparedMutation> {
  const task = await findTask(scope, input.taskTitle, input.boardName);
  const text = input.text?.trim();
  if (!text) throw new AgentError("What should the comment say?");
  const author = await resolveContributor(task.boardId, input.authorName);

  return {
    summary: `Post a comment on "${task.title}" as ${author.name}: "${text.slice(0, 160)}".`,
    run: async () => {
      const id = crypto.randomUUID();
      await db.insert(comments).values({
        id,
        taskId: task.id,
        boardId: task.boardId,
        authorId: author.id,
        content: contentFromPlainText(text),
        createdAt: new Date(),
      });
      await queueCommentNotification({
        boardId: task.boardId,
        taskId: task.id,
        authorId: author.id,
        commentContent: contentFromPlainText(text),
      });
      refresh(task.boardId);
      return `Commented on "${task.title}" as ${author.name}.`;
    },
  };
}

/** Re-numbers one column's tasks by age or last comment, matching the board's own reorder. */
export async function sortColumn(
  scope: AgentScope,
  input: {
    boardName?: string | null;
    columnName: string;
    mode: "createdAsc" | "createdDesc" | "lastCommentDesc" | "lastCommentAsc";
  },
): Promise<PreparedMutation> {
  const board = resolveBoard(scope, input.boardName);
  const column = await resolveColumn(board.id, input.columnName);

  return {
    summary: `Reorder ${column.name} on "${board.title}" by ${input.mode}.`,
    run: async () => {
      const rows = await db
        .select({
          id: tasks.id,
          createdAt: tasks.createdAt,
          lastCommentAt: sql<number | null>`MAX(${comments.createdAt})`,
        })
        .from(tasks)
        .leftJoin(comments, eq(comments.taskId, tasks.id))
        .where(eq(tasks.columnId, column.id))
        .groupBy(tasks.id);

      const key = (row: (typeof rows)[number]) =>
        input.mode.startsWith("created")
          ? (row.createdAt?.getTime() ?? 0)
          : Number(row.lastCommentAt) || (row.createdAt?.getTime() ?? 0);
      const ascending = input.mode.endsWith("Asc");
      const ordered = rows.slice().sort((a, b) => (ascending ? key(a) - key(b) : key(b) - key(a)));

      for (let index = 0; index < ordered.length; index += 1) {
        await db.update(tasks).set({ position: index }).where(eq(tasks.id, ordered[index].id));
      }
      refresh(board.id);
      return `Reordered ${ordered.length} task${ordered.length === 1 ? "" : "s"} in ${column.name}.`;
    },
  };
}

/** Archives everything sitting in done columns, keeping active boards readable. */
export async function archiveDone(
  scope: AgentScope,
  input: { boardName?: string | null },
): Promise<PreparedMutation> {
  const board = resolveBoard(scope, input.boardName);
  const archive = await resolveColumn(board.id, "archive");
  const done = await resolveColumn(board.id, "done");
  const candidates = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.boardId, board.id), eq(tasks.columnId, done.id)));

  if (!candidates.length)
    throw new AgentError(`Nothing is sitting in ${done.name} on "${board.title}".`);
  if (candidates.length > MAX_BULK) {
    throw new AgentError(
      `${candidates.length} tasks would move, over the ${MAX_BULK}-row limit. Archive them in smaller batches.`,
    );
  }

  return {
    summary: `Move ${candidates.length} finished task${candidates.length === 1 ? "" : "s"} from ${done.name} into ${archive.name} on "${board.title}".`,
    run: async () => {
      let position = await nextPosition(archive.id);
      for (const task of candidates) {
        await db.update(tasks).set({ columnId: archive.id, position }).where(eq(tasks.id, task.id));
        position += 1;
      }
      refresh(board.id);
      return `Archived ${candidates.length} task${candidates.length === 1 ? "" : "s"}.`;
    },
  };
}

/** Deletes tasks that were created but never titled beyond the placeholder. */
export async function cleanupEmptyTasks(
  scope: AgentScope,
  input: { boardName?: string | null },
): Promise<PreparedMutation> {
  const board = resolveBoard(scope, input.boardName);
  const rows = await db.select().from(tasks).where(eq(tasks.boardId, board.id));
  const empties = rows.filter(
    (task) => !task.title.trim() || /^(new task|untitled)$/i.test(task.title.trim()),
  );
  if (!empties.length) throw new AgentError(`No empty or untitled tasks on "${board.title}".`);

  return {
    summary: `Delete ${empties.length} untitled task${empties.length === 1 ? "" : "s"} from "${board.title}".`,
    run: async () => {
      const ids = empties.map((task) => task.id);
      await db.delete(taskAssignees).where(inArray(taskAssignees.taskId, ids));
      await db.delete(taskStakeholders).where(inArray(taskStakeholders.taskId, ids));
      await db.delete(taskTags).where(inArray(taskTags.taskId, ids));
      await db.delete(comments).where(inArray(comments.taskId, ids));
      await db.delete(tasks).where(inArray(tasks.id, ids));
      refresh(board.id);
      return `Deleted ${ids.length} untitled task${ids.length === 1 ? "" : "s"}.`;
    },
  };
}

// ── Task fields the board edits but voice could not reach ───────────────────

export async function setTaskStatus(
  scope: AgentScope,
  input: { taskTitle: string; status: TaskStatus; boardName?: string | null },
): Promise<PreparedMutation> {
  const task = await findTask(scope, input.taskTitle, input.boardName);
  if (!TASK_STATUSES.includes(input.status)) {
    throw new AgentError(`Status must be one of ${TASK_STATUSES.join(", ")}.`);
  }
  return {
    summary: `Set "${task.title}" to status ${input.status} (currently ${task.status}).`,
    run: async () => {
      await db.update(tasks).set({ status: input.status }).where(eq(tasks.id, task.id));
      refresh(task.boardId);
      return `"${task.title}" is now ${input.status}.`;
    },
  };
}

/**
 * Files a task under one of its board's categories, by name. Categories are
 * the board's own words, so an unknown name is a question, not a new row.
 */
export async function setTaskCategory(
  scope: AgentScope,
  input: { taskTitle: string; category: string | null; boardName?: string | null },
): Promise<PreparedMutation> {
  const task = await findTask(scope, input.taskTitle, input.boardName);
  const wanted = input.category?.trim();

  if (!wanted) {
    return {
      summary: `Clear the category on "${task.title}".`,
      run: async () => {
        await db.update(tasks).set({ categoryId: null }).where(eq(tasks.id, task.id));
        refresh(task.boardId);
        return `"${task.title}" has no category now.`;
      },
    };
  }

  const boardCategories = await db
    .select()
    .from(taskCategories)
    .where(eq(taskCategories.boardId, task.boardId));
  const category = boardCategories.find(
    (row) => row.name.trim().toLowerCase() === wanted.toLowerCase(),
  );
  if (!category) {
    const names = boardCategories.map((row) => row.name).join(", ");
    throw new AgentError(
      names
        ? `That board has no category called "${wanted}". It has: ${names}.`
        : `That board has no categories yet, so "${wanted}" cannot be used.`,
    );
  }

  return {
    summary: `File "${task.title}" under ${category.name}.`,
    run: async () => {
      await db.update(tasks).set({ categoryId: category.id }).where(eq(tasks.id, task.id));
      refresh(task.boardId);
      return `"${task.title}" is filed under ${category.name}.`;
    },
  };
}

/** Replaces the idea document — the body the task card opens with. */
export async function setTaskDescription(
  scope: AgentScope,
  input: { taskTitle: string; text: string; boardName?: string | null },
): Promise<PreparedMutation> {
  const task = await findTask(scope, input.taskTitle, input.boardName);
  const text = input.text?.trim();
  if (!text) throw new AgentError("What should the description say?");

  return {
    summary: `Replace the description on "${task.title}" with: "${text.slice(0, 160)}".`,
    run: async () => {
      await db
        .update(tasks)
        .set({ doc: JSON.stringify(contentFromPlainText(text)) })
        .where(eq(tasks.id, task.id));
      refresh(task.boardId);
      return `Updated the description on "${task.title}".`;
    },
  };
}

export async function reorderTask(
  scope: AgentScope,
  input: { taskTitle: string; position: number; boardName?: string | null },
): Promise<PreparedMutation> {
  const task = await findTask(scope, input.taskTitle, input.boardName);
  const siblings = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.columnId, task.columnId));
  // Voice speaks in 1-based positions; the column stores 0-based ones.
  const target = Math.min(Math.max(1, Math.round(input.position)), siblings.length) - 1;

  return {
    summary: `Move "${task.title}" to position ${target + 1} of ${siblings.length} in its column.`,
    run: async () => {
      if (target === task.position) return `"${task.title}" is already there.`;
      if (target < task.position) {
        await db
          .update(tasks)
          .set({ position: sql`${tasks.position} + 1` })
          .where(
            and(
              eq(tasks.columnId, task.columnId),
              gte(tasks.position, target),
              gt(tasks.position, -1),
              sql`${tasks.position} < ${task.position}`,
            ),
          );
      } else {
        await db
          .update(tasks)
          .set({ position: sql`${tasks.position} - 1` })
          .where(
            and(
              eq(tasks.columnId, task.columnId),
              gt(tasks.position, task.position),
              sql`${tasks.position} <= ${target}`,
            ),
          );
      }
      await db.update(tasks).set({ position: target }).where(eq(tasks.id, task.id));
      refresh(task.boardId);
      return `Moved "${task.title}" to position ${target + 1}.`;
    },
  };
}

// ── Columns ────────────────────────────────────────────────────────────────

export function deleteColumn(
  scope: AgentScope,
  input: { boardName?: string | null; columnName: string; moveTasksTo?: string | null },
): PreparedMutation {
  const board = resolveBoard(scope, input.boardName);

  return {
    summary: input.moveTasksTo
      ? `Delete the "${input.columnName}" column on "${board.title}", moving its tasks to "${input.moveTasksTo}".`
      : `Delete the "${input.columnName}" column on "${board.title}". It must be empty, or name a column to move its tasks to.`,
    run: async () => {
      const column = await resolveColumn(board.id, input.columnName);
      const held = await db.select().from(tasks).where(eq(tasks.columnId, column.id));

      if (held.length) {
        if (!input.moveTasksTo) {
          throw new AgentError(
            `"${column.name}" still holds ${held.length} task${held.length === 1 ? "" : "s"}. Name a column to move them to.`,
          );
        }
        const destination = await resolveColumn(board.id, input.moveTasksTo);
        if (destination.id === column.id) {
          throw new AgentError("Tasks cannot move to the column being deleted.");
        }
        let position = await nextPosition(destination.id);
        for (const task of held) {
          await db
            .update(tasks)
            .set({ columnId: destination.id, position })
            .where(eq(tasks.id, task.id));
          position += 1;
        }
      }

      await db.delete(columns).where(eq(columns.id, column.id));
      await db
        .update(columns)
        .set({ position: sql`${columns.position} - 1` })
        .where(and(eq(columns.boardId, board.id), gt(columns.position, column.position)));
      refresh(board.id);
      return `Deleted the "${column.name}" column${held.length ? ` and moved ${held.length} task${held.length === 1 ? "" : "s"}` : ""}.`;
    },
  };
}

export function moveColumn(
  scope: AgentScope,
  input: { boardName?: string | null; columnName: string; position: number },
): PreparedMutation {
  const board = resolveBoard(scope, input.boardName);

  return {
    summary: `Move the "${input.columnName}" column on "${board.title}" to position ${Math.round(input.position)}.`,
    run: async () => {
      const column = await resolveColumn(board.id, input.columnName);
      const all = await db
        .select({ id: columns.id })
        .from(columns)
        .where(eq(columns.boardId, board.id));
      const target = Math.min(Math.max(1, Math.round(input.position)), all.length) - 1;
      if (target === column.position) return `"${column.name}" is already there.`;

      if (target < column.position) {
        await db
          .update(columns)
          .set({ position: sql`${columns.position} + 1` })
          .where(
            and(
              eq(columns.boardId, board.id),
              gte(columns.position, target),
              sql`${columns.position} < ${column.position}`,
            ),
          );
      } else {
        await db
          .update(columns)
          .set({ position: sql`${columns.position} - 1` })
          .where(
            and(
              eq(columns.boardId, board.id),
              gt(columns.position, column.position),
              sql`${columns.position} <= ${target}`,
            ),
          );
      }
      await db.update(columns).set({ position: target }).where(eq(columns.id, column.id));
      refresh(board.id);
      return `Moved "${column.name}" to position ${target + 1}.`;
    },
  };
}

export async function deleteComment(
  scope: AgentScope,
  input: { taskTitle: string; textContains: string; boardName?: string | null },
): Promise<PreparedMutation> {
  const task = await findTask(scope, input.taskTitle, input.boardName);
  const needle = input.textContains?.trim().toLowerCase();
  if (!needle) throw new AgentError("Which comment? Quote a few words from it.");

  const rows = await db.select().from(comments).where(eq(comments.taskId, task.id));
  const matches = rows.filter((row) => row.content.toLowerCase().includes(needle));
  if (!matches.length) throw new AgentError(`No comment on "${task.title}" mentions that.`);
  if (matches.length > 1) {
    throw new AgentError(
      `That matches ${matches.length} comments on "${task.title}". Be more specific.`,
    );
  }
  const comment = matches[0];

  return {
    summary: `Delete the comment on "${task.title}": "${comment.content.slice(0, 120)}".`,
    run: async () => {
      await db.delete(comments).where(eq(comments.id, comment.id));
      refresh(task.boardId);
      return `Deleted that comment on "${task.title}".`;
    },
  };
}

// ── Due dates ──────────────────────────────────────────────────────────────

/** Spoken dates arrive as ISO from the model; anything else is a mishearing. */
function parseDueDate(value: string): Date {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(trimmed)) {
    throw new AgentError(`I need the date as YYYY-MM-DD, not "${value}".`);
  }
  // A bare date means end of that day, so "due Friday" is not overdue at 9am.
  const parsed = new Date(trimmed.length === 10 ? `${trimmed}T23:59:59` : trimmed);
  if (Number.isNaN(parsed.getTime())) throw new AgentError(`"${value}" is not a real date.`);
  return parsed;
}

export async function setTaskDueDate(
  scope: AgentScope,
  input: { taskTitle: string; date: string; boardName?: string | null },
): Promise<PreparedMutation> {
  const task = await findTask(scope, input.taskTitle, input.boardName);
  const due = parseDueDate(input.date);
  const spoken = due.toISOString().slice(0, 10);
  const current = task.dueAt
    ? ` It is currently due ${task.dueAt.toISOString().slice(0, 10)}.`
    : "";

  return {
    summary: `Set "${task.title}" to be due ${spoken}.${current}`,
    run: async () => {
      await db.update(tasks).set({ dueAt: due }).where(eq(tasks.id, task.id));
      refresh(task.boardId);
      return `"${task.title}" is due ${spoken}.`;
    },
  };
}

export async function clearTaskDueDate(
  scope: AgentScope,
  input: { taskTitle: string; boardName?: string | null },
): Promise<PreparedMutation> {
  const task = await findTask(scope, input.taskTitle, input.boardName);
  if (!task.dueAt) throw new AgentError(`"${task.title}" has no due date to clear.`);

  return {
    summary: `Remove the ${task.dueAt.toISOString().slice(0, 10)} due date from "${task.title}".`,
    run: async () => {
      await db.update(tasks).set({ dueAt: null }).where(eq(tasks.id, task.id));
      refresh(task.boardId);
      return `"${task.title}" no longer has a due date.`;
    },
  };
}

// ── Boards, destructively ──────────────────────────────────────────────────

/**
 * Deleting a board takes everything hanging off it with it. Every link table
 * uses onDelete: restrict, so the teardown below is the schema read backwards.
 */
export function deleteBoard(
  scope: AgentScope,
  input: { boardName: string; confirmTitle?: string | null },
): PreparedMutation {
  const board = resolveBoard(scope, input.boardName);
  if (board.role !== "owner") {
    throw new AgentError(`Only the owner of "${board.title}" can delete it.`);
  }
  // A misheard board name must not wipe a board, so the title is said twice.
  if (input.confirmTitle?.trim().toLowerCase() !== board.title.trim().toLowerCase()) {
    throw new AgentError(
      `To delete "${board.title}", say its title back exactly as confirmTitle. Nothing was deleted.`,
    );
  }

  return {
    summary: `Permanently delete the board "${board.title}" with every task, comment, tag, contributor and attachment on it. This cannot be undone.`,
    run: async () => {
      const boardTasks = await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(eq(tasks.boardId, board.id));
      const taskIds = boardTasks.map((task) => task.id);

      if (taskIds.length) {
        await db.delete(taskAssignees).where(inArray(taskAssignees.taskId, taskIds));
        await db.delete(taskStakeholders).where(inArray(taskStakeholders.taskId, taskIds));
        await db.delete(taskTags).where(inArray(taskTags.taskId, taskIds));
      }
      await db.delete(comments).where(eq(comments.boardId, board.id));
      await db.delete(tasks).where(eq(tasks.boardId, board.id));
      await db.delete(tags).where(eq(tags.boardId, board.id));
      await db.delete(contributors).where(eq(contributors.boardId, board.id));
      await db.delete(columns).where(eq(columns.boardId, board.id));
      await db.delete(taskCategories).where(eq(taskCategories.boardId, board.id));
      await db.delete(boardMembers).where(eq(boardMembers.boardId, board.id));
      await db.delete(boards).where(eq(boards.id, board.id));

      revalidatePath("/");
      return `Deleted the board "${board.title}" and everything on it.`;
    },
  };
}

// ── Docs ──────────────────────────────────────────────────────────────────

/** Appends one paragraph to a TipTap doc, returning the new JSON. */
function appendParagraph(content: string | null, text: string): string {
  const paragraph = { type: "paragraph", content: [{ type: "text", text }] };
  if (!content?.trim().startsWith("{")) {
    return JSON.stringify({ type: "doc", content: [paragraph] });
  }
  try {
    const parsed = JSON.parse(content) as { type?: string; content?: unknown[] };
    if (parsed?.type !== "doc" || !Array.isArray(parsed.content)) {
      return JSON.stringify({ type: "doc", content: [paragraph] });
    }
    return JSON.stringify({ ...parsed, content: [...parsed.content, paragraph] });
  } catch {
    return JSON.stringify({ type: "doc", content: [paragraph] });
  }
}

export function createDoc(
  scope: AgentScope,
  input: { clientName: string; title: string; body?: string | null },
): PreparedMutation {
  const title = input.title?.trim();
  if (!title) throw new AgentError("What should the doc be called?");

  return {
    summary: `Create a doc "${title}" for ${input.clientName}${input.body ? " with an opening paragraph" : ""}.`,
    run: async () => {
      const client = resolveClient(scope, input.clientName);
      const docId = await createDocument({ clientId: client.id, title });
      if (input.body?.trim()) {
        const doc = await db.query.docs.findFirst({ where: eq(docs.id, docId) });
        await saveDocument(docId, appendParagraph(doc?.content ?? null, input.body.trim()));
      }
      return `Created the doc "${title}" for ${client.name}.`;
    },
  };
}

export function appendToDoc(
  scope: AgentScope,
  input: { docTitle: string; clientName?: string | null; text: string },
): PreparedMutation {
  const text = input.text?.trim();
  if (!text) throw new AgentError("What should be added to the doc?");

  return {
    summary: `Add a paragraph to the doc "${input.docTitle}": "${text.slice(0, 80)}${text.length > 80 ? "…" : ""}".`,
    run: async () => {
      const doc = await resolveDocByTitle(scope, input.docTitle, input.clientName);
      await saveDocument(doc.id, appendParagraph(doc.content, text));
      return `Added a paragraph to "${doc.title}".`;
    },
  };
}

export function renameDoc(
  scope: AgentScope,
  input: { docTitle: string; newTitle: string; clientName?: string | null },
): PreparedMutation {
  const newTitle = input.newTitle?.trim();
  if (!newTitle) throw new AgentError("What should the doc be called instead?");

  return {
    summary: `Rename the doc "${input.docTitle}" to "${newTitle}".`,
    run: async () => {
      const doc = await resolveDocByTitle(scope, input.docTitle, input.clientName);
      await renameDocument(doc.id, newTitle);
      return `Renamed "${doc.title}" to "${newTitle}".`;
    },
  };
}

export function deleteDoc(
  scope: AgentScope,
  input: { docTitle: string; clientName?: string | null },
): PreparedMutation {
  return {
    summary: `Delete the doc "${input.docTitle}". This cannot be undone.`,
    run: async () => {
      const doc = await resolveDocByTitle(scope, input.docTitle, input.clientName);
      await deleteDocument(doc.id);
      return `Deleted the doc "${doc.title}".`;
    },
  };
}
