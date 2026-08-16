"use server";

import { db, rawClient } from "@/db";
import { columns, tasks, taskAssignees, taskTags, comments } from "@/db/schema";
import { eq, and, gt, gte, lt, lte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { canAccessBoard, requireBoardAccess } from "@/lib/secure-board";
import { TASK_PRIORITIES, type TaskPriority } from "@/db/schema";
import {
  queueCreatedNotification,
  queueMoveNotification,
  queuePriorityNotification,
} from "@/lib/notifications";
import { sendInstantNotifications } from "@/lib/send-instant-notification";
import { currentContributorId } from "@/lib/auth/contributor";
import { requireColumn, requireTask } from "@/lib/require-resource";
import { indexTask, removeSource } from "@/lib/search/indexer";

function toDateFromDbValue(v: unknown): Date | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  // libSQL (and Drizzle `mode: "timestamp"`) stores timestamps as unix seconds.
  // Guard for mixed data: treat "small" numbers as seconds; otherwise assume ms.
  const ms = n < 10_000_000_000 ? n * 1000 : n;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function createTask(
  boardId: string,
  columnId: string,
  title: string,
  id: string,
  createdAt?: Date,
) {
  await requireBoardAccess(boardId);
  await requireColumn(columnId, boardId);

  // Get the max position for this column
  const maxPositionResult = await db
    .select({ maxPosition: sql<number>`COALESCE(MAX(${tasks.position}), -1)` })
    .from(tasks)
    .where(eq(tasks.columnId, columnId));

  const maxPosition = maxPositionResult[0]?.maxPosition ?? -1;

  await db.insert(tasks).values({
    id,
    boardId,
    columnId,
    title,
    position: maxPosition + 1,
    ...(createdAt ? { createdAt } : null),
  });

  // Same rule as the desk's own createTask: the client team hears about new
  // work whichever screen made it.
  const queued = await queueCreatedNotification({
    boardId,
    taskId: id,
    createdById: await currentContributorId(boardId),
  });
  await sendInstantNotifications(boardId, queued);

  void indexTask(id);
  revalidatePath(`/boards/${boardId}`);
  return id;
}

export async function getTask(id: string) {
  // NOTE: Turso may serve stale reads from replicas for complex relation queries.
  // To improve "read after write" consistency for the sidebar, run the read in a
  // "write" batch so it is forwarded to the primary.
  const results = await rawClient.batch(
    [
      {
        sql: `
          SELECT
            t.id,
            t.title,
            t.priority,
            t.column_id AS columnId,
            t.board_id AS boardId,
            t.created_at AS createdAt,
            t.doc AS doc,
            c.name AS columnName
          FROM tasks t
          JOIN columns c ON c.id = t.column_id
          WHERE t.id = ?
          LIMIT 1
        `,
        args: [id],
      },
      {
        sql: `
          SELECT
            c.id,
            c.name,
            c.color
          FROM task_assignees ta
          JOIN contributors c ON c.id = ta.contributor_id
          WHERE ta.task_id = ?
        `,
        args: [id],
      },
      {
        sql: `
          SELECT
            c.id,
            c.name,
            c.color
          FROM task_stakeholders ts
          JOIN contributors c ON c.id = ts.contributor_id
          WHERE ts.task_id = ?
        `,
        args: [id],
      },
      {
        sql: `
          SELECT
            t.id,
            t.name,
            t.color
          FROM task_tags tt
          JOIN tags t ON t.id = tt.tag_id
          WHERE tt.task_id = ?
        `,
        args: [id],
      },
      {
        sql: `
          SELECT
            cm.id,
            cm.content,
            cm.created_at AS createdAt,
            a.id AS authorId,
            a.name AS authorName,
            a.color AS authorColor,
            s.id AS stakeholderId,
            s.name AS stakeholderName,
            s.color AS stakeholderColor
          FROM comments cm
          JOIN contributors a ON a.id = cm.author_id
          LEFT JOIN contributors s ON s.id = cm.stakeholder_id
          WHERE cm.task_id = ?
          ORDER BY cm.created_at ASC
        `,
        args: [id],
      },
    ],
    "write",
  );

  const [taskRes, assigneesRes, stakeholdersRes, tagsRes, commentsRes] = results as any[];
  const taskRow = taskRes?.rows?.[0] as any;
  if (!taskRow) return null;

  const allowed = await canAccessBoard(taskRow.boardId as string);
  if (!allowed) return null;

  return {
    id: String(taskRow.id),
    title: String(taskRow.title),
    priority: String(taskRow.priority) as any,
    columnId: String(taskRow.columnId),
    boardId: String(taskRow.boardId),
    createdAt: toDateFromDbValue(taskRow.createdAt),
    doc: taskRow.doc ? String(taskRow.doc) : null,
    column: {
      id: String(taskRow.columnId),
      name: String(taskRow.columnName ?? ""),
    },
    assignees: (assigneesRes?.rows ?? []).map((r: any) => ({
      contributor: {
        id: String(r.id),
        name: String(r.name),
        color: String(r.color) as any,
      },
    })),
    stakeholders: (stakeholdersRes?.rows ?? []).map((r: any) => ({
      contributor: {
        id: String(r.id),
        name: String(r.name),
        color: String(r.color) as any,
      },
    })),
    tags: (tagsRes?.rows ?? []).map((r: any) => ({
      tag: {
        id: String(r.id),
        name: String(r.name),
        color: String(r.color) as any,
      },
    })),
    comments: (commentsRes?.rows ?? []).map((r: any) => ({
      id: String(r.id),
      content: String(r.content),
      createdAt: toDateFromDbValue(r.createdAt),
      author: {
        id: String(r.authorId),
        name: String(r.authorName),
        color: String(r.authorColor) as any,
      },
      stakeholder: r.stakeholderId
        ? {
            id: String(r.stakeholderId),
            name: String(r.stakeholderName),
            color: String(r.stakeholderColor) as any,
          }
        : null,
    })),
  };
}

export async function updateTaskTitle(id: string, title: string, boardId: string) {
  await requireBoardAccess(boardId);
  await requireTask(id, boardId);

  await db.update(tasks).set({ title }).where(eq(tasks.id, id));
  void indexTask(id);
  revalidatePath(`/boards/${boardId}`);
}

export async function updateTaskCreatedAt(id: string, createdAt: Date, boardId: string) {
  await requireBoardAccess(boardId);
  await requireTask(id, boardId);

  await db.update(tasks).set({ createdAt }).where(eq(tasks.id, id));
  revalidatePath(`/boards/${boardId}`);
}

export async function updateTaskPriority(id: string, priority: TaskPriority, boardId: string) {
  await requireBoardAccess(boardId);

  if (!TASK_PRIORITIES.includes(priority)) {
    throw new Error("Invalid priority");
  }

  const task = await requireTask(id, boardId);
  const oldPriority = task.priority;

  await db.update(tasks).set({ priority }).where(eq(tasks.id, id));

  // Only notify if priority actually changed
  if (oldPriority !== priority) {
    await queuePriorityNotification({
      boardId,
      taskId: id,
      priority,
      changedById: await currentContributorId(boardId),
    });
  }

  revalidatePath(`/boards/${boardId}`);
}

export async function updateTaskColumn(
  id: string,
  newColumnId: string,
  boardId: string,
  newPosition?: number,
) {
  await requireBoardAccess(boardId);

  const newColumn = await requireColumn(newColumnId, boardId);
  const task = await requireTask(id, boardId);

  const oldColumnId = task.columnId;
  const oldPosition = task.position;

  // If moving to same column at same position, do nothing
  if (oldColumnId === newColumnId && (newPosition === undefined || newPosition === oldPosition)) {
    return;
  }

  // Track if we're moving to a different column (for notifications)
  const isColumnChange = oldColumnId !== newColumnId;
  let oldColumnName: string | undefined;
  if (isColumnChange) {
    const oldColumn = await db.query.columns.findFirst({ where: eq(columns.id, oldColumnId) });
    oldColumnName = oldColumn?.name;
  }

  // Get max position in new column if newPosition not provided
  if (newPosition === undefined) {
    const maxPositionResult = await db
      .select({ maxPosition: sql<number>`COALESCE(MAX(${tasks.position}), -1)` })
      .from(tasks)
      .where(eq(tasks.columnId, newColumnId));
    newPosition = (maxPositionResult[0]?.maxPosition ?? -1) + 1;
  }

  if (oldColumnId === newColumnId) {
    // Same column reorder
    if (oldPosition < newPosition) {
      await db
        .update(tasks)
        .set({ position: sql`${tasks.position} - 1` })
        .where(
          and(
            eq(tasks.columnId, oldColumnId),
            gt(tasks.position, oldPosition),
            lte(tasks.position, newPosition),
          ),
        );
    } else {
      await db
        .update(tasks)
        .set({ position: sql`${tasks.position} + 1` })
        .where(
          and(
            eq(tasks.columnId, oldColumnId),
            gte(tasks.position, newPosition),
            lt(tasks.position, oldPosition),
          ),
        );
    }
  } else {
    // Different column - update old column positions
    await db
      .update(tasks)
      .set({ position: sql`${tasks.position} - 1` })
      .where(and(eq(tasks.columnId, oldColumnId), gt(tasks.position, oldPosition)));

    // Update new column positions
    await db
      .update(tasks)
      .set({ position: sql`${tasks.position} + 1` })
      .where(and(eq(tasks.columnId, newColumnId), gte(tasks.position, newPosition)));
  }

  await db
    .update(tasks)
    .set({ columnId: newColumnId, position: newPosition })
    .where(eq(tasks.id, id));

  // Queue notification for column change (task moved)
  if (isColumnChange && oldColumnName) {
    await queueMoveNotification({
      boardId,
      taskId: id,
      fromColumnName: oldColumnName,
      toColumnName: newColumn.name,
      movedById: await currentContributorId(boardId),
    });
  }

  revalidatePath(`/boards/${boardId}`);
}

export async function deleteTask(id: string, boardId: string) {
  await requireBoardAccess(boardId);
  const task = await requireTask(id, boardId);

  // Delete assignees first
  await db.delete(taskAssignees).where(eq(taskAssignees.taskId, id));

  // Delete stakeholders
  const { taskStakeholders } = await import("@/db/schema");
  await db.delete(taskStakeholders).where(eq(taskStakeholders.taskId, id));

  // Delete tags
  await db.delete(taskTags).where(eq(taskTags.taskId, id));

  // Delete comments before removing the task to honor restrict FKs
  const commentRows = await db
    .select({ commentId: comments.id })
    .from(comments)
    .where(eq(comments.taskId, id));
  await db.delete(comments).where(eq(comments.taskId, id));

  await db.delete(tasks).where(eq(tasks.id, id));

  // Remove the task's search rows (title, blocks) and its comments' rows.
  void removeSource("task_title", id);
  void removeSource("task_block", id);
  for (const comment of commentRows) void removeSource("comment", comment.commentId);

  // Update positions
  await db
    .update(tasks)
    .set({ position: sql`${tasks.position} - 1` })
    .where(and(eq(tasks.columnId, task.columnId), gt(tasks.position, task.position)));

  revalidatePath(`/boards/${boardId}`);
}

export type TaskReorderMode = "createdAsc" | "createdDesc" | "lastCommentDesc" | "lastCommentAsc";

export async function reorderTasks(boardId: string, mode: TaskReorderMode) {
  await requireBoardAccess(boardId);

  // Fetch all tasks for this board with their comment timestamps
  const allTasks = await db
    .select({
      id: tasks.id,
      columnId: tasks.columnId,
      createdAt: tasks.createdAt,
      lastCommentAt: sql<number | null>`MAX(${comments.createdAt})`,
    })
    .from(tasks)
    .leftJoin(comments, eq(comments.taskId, tasks.id))
    .where(eq(tasks.boardId, boardId))
    .groupBy(tasks.id, tasks.columnId, tasks.createdAt);

  // Group tasks by column
  const tasksByColumn = new Map<string, typeof allTasks>();
  for (const task of allTasks) {
    const columnTasks = tasksByColumn.get(task.columnId) ?? [];
    columnTasks.push(task);
    tasksByColumn.set(task.columnId, columnTasks);
  }

  // Sort and update positions for each column
  for (const [_columnId, columnTasks] of tasksByColumn.entries()) {
    // Sort tasks based on mode
    columnTasks.sort((a, b) => {
      let compareValue = 0;

      if (mode === "createdAsc" || mode === "createdDesc") {
        // Sort by createdAt
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        compareValue = dateA - dateB;
        if (mode === "createdDesc") compareValue = -compareValue;
      } else {
        // Sort by lastCommentAt (fallback to createdAt if no comments)
        // lastCommentAt is stored as unix seconds, convert to ms for comparison
        const dateA = a.lastCommentAt
          ? a.lastCommentAt < 10_000_000_000
            ? a.lastCommentAt * 1000
            : a.lastCommentAt
          : a.createdAt
            ? new Date(a.createdAt).getTime()
            : 0;
        const dateB = b.lastCommentAt
          ? b.lastCommentAt < 10_000_000_000
            ? b.lastCommentAt * 1000
            : b.lastCommentAt
          : b.createdAt
            ? new Date(b.createdAt).getTime()
            : 0;
        compareValue = dateA - dateB;
        if (mode === "lastCommentDesc") compareValue = -compareValue;
      }

      // Stable tie-breakers: createdAt, then taskId
      if (compareValue === 0) {
        const createdAtA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const createdAtB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (createdAtA !== createdAtB) {
          compareValue = createdAtA - createdAtB;
        } else {
          compareValue = a.id.localeCompare(b.id);
        }
      }

      return compareValue;
    });

    // Update positions to 0..n-1
    for (let i = 0; i < columnTasks.length; i++) {
      await db.update(tasks).set({ position: i }).where(eq(tasks.id, columnTasks[i]!.id));
    }
  }

  revalidatePath(`/boards/${boardId}`);
}
