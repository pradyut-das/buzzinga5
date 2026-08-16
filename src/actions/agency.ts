"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  assets,
  boards,
  broadcasts,
  captionDrafts,
  clients,
  columns,
  comments,
  contributors,
  scheduledPosts,
  taskCategories,
  tasks,
  topics,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { addBoardMember } from "@/lib/auth/membership";
import { currentContributorId, resolveContributorForUser } from "@/lib/auth/contributor";
import {
  queueCommentNotification,
  queueCreatedNotification,
  queueMoveNotification,
} from "@/lib/notifications";
import { sendInstantNotifications } from "@/lib/send-instant-notification";
import {
  indexAsset,
  indexBroadcast,
  indexClient,
  indexComment,
  indexTask,
} from "@/lib/search/indexer";

/**
 * Every write the agency screens perform. Each one names the object it
 * changed and revalidates the surfaces that quote it, so the rail counts and
 * the homepage queue never drift from the board.
 */

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Sign in first");
  return user;
}

const DEFAULT_COLUMNS = ["📥 To do", "🔄 Doing", "✅ Done"];

/**
 * A client created from the admin console has no board of its own, so the
 * kanban renders empty and there is nowhere to put a task. Rather than make
 * that a dead end, the first task a client gets also gets them their board.
 */
async function ensureClientBoard(clientId: string, ownerId: string) {
  const existing = await db.query.boards.findFirst({ where: eq(boards.clientId, clientId) });
  const boardId = existing?.id ?? randomUUID();

  if (!existing) {
    const client = await db.query.clients.findFirst({ where: eq(clients.id, clientId) });
    if (!client) throw new Error("No such client");
    await db.insert(boards).values({
      id: boardId,
      title: client.name,
      clientId,
      ownerId,
      createdAt: new Date(),
    });
    await addBoardMember(boardId, ownerId, "owner");
  }

  const existingColumns = await db.query.columns.findMany({
    where: eq(columns.boardId, boardId),
    orderBy: [asc(columns.position)],
  });
  if (existingColumns.length > 0) return { boardId, columns: existingColumns };

  for (let i = 0; i < DEFAULT_COLUMNS.length; i++) {
    await db.insert(columns).values({
      id: randomUUID(),
      boardId,
      name: DEFAULT_COLUMNS[i],
      position: i,
    });
  }
  await db.insert(columns).values({
    id: randomUUID(),
    boardId,
    name: "📦 Archive",
    position: DEFAULT_COLUMNS.length,
    isCollapsed: true,
  });

  return {
    boardId,
    columns: await db.query.columns.findMany({
      where: eq(columns.boardId, boardId),
      orderBy: [asc(columns.position)],
    }),
  };
}

function revalidateAgency(clientId?: string) {
  revalidatePath("/");
  revalidatePath("/health");
  revalidatePath("/calendar");
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

/**
 * NOTE: this is a second move path alongside `updateTaskColumn` in
 * ./tasks.ts. They differ in what they revalidate — that one repaints a board
 * route, this one the agency rail — but both have to announce the move, so any
 * change to how moves are notified belongs in both.
 */
export async function moveTask(taskId: string, columnId: string) {
  await requireUser();
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!task) throw new Error("Task not found");

  const isColumnChange = task.columnId !== columnId;
  await db.update(tasks).set({ columnId }).where(eq(tasks.id, taskId));

  if (isColumnChange) {
    const [fromColumn, toColumn] = await Promise.all([
      db.query.columns.findFirst({ where: eq(columns.id, task.columnId) }),
      db.query.columns.findFirst({ where: eq(columns.id, columnId) }),
    ]);
    if (fromColumn && toColumn) {
      await queueMoveNotification({
        boardId: task.boardId,
        taskId,
        fromColumnName: fromColumn.name,
        toColumnName: toColumn.name,
        movedById: await currentContributorId(task.boardId),
      });
    }
  }

  const board = await db.query.boards.findFirst({
    where: eq(boards.id, task.boardId),
  });
  revalidateAgency(board?.clientId ?? undefined);
}

export async function createTask(
  clientId: string,
  title: string,
  columnIndex = 0,
  categoryId: string | null = null,
  dueDate: string | null = null,
) {
  const user = await requireUser();
  const { boardId, columns: boardColumns } = await ensureClientBoard(clientId, user.id);
  const column = boardColumns.find((entry) => entry.position === columnIndex) ?? boardColumns[0];
  if (!column) throw new Error("This board has no columns");

  if (categoryId) {
    const category = await db.query.taskCategories.findFirst({
      where: and(eq(taskCategories.id, categoryId), eq(taskCategories.boardId, boardId)),
    });
    if (!category) throw new Error("That category is not on this client's board");
  }

  const dueAt = dueDate ? new Date(`${dueDate}T23:59:59`) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) throw new Error("Invalid date");

  const id = randomUUID();
  await db.insert(tasks).values({
    id,
    boardId,
    columnId: column.id,
    title: title.trim(),
    categoryId,
    status: "todo",
    clientId,
    priority: "none",
    position: Date.now() % 100000,
    dueAt,
  });

  // The client team hears about new work as it lands. Creation is the one event
  // where the task has no people of its own yet, so this always addresses the
  // client team — minus the person who just created it.
  const queued = await queueCreatedNotification({
    boardId,
    taskId: id,
    createdById: await currentContributorId(boardId),
  });
  await sendInstantNotifications(boardId, queued);

  void indexTask(id);
  revalidateAgency(clientId);
  return id;
}

export async function addTaskComment(taskId: string, body: string) {
  const user = await requireUser();
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!task) throw new Error("Task not found");

  // Comments belong to a board contributor, which stands for a real account.
  // Match on the account rather than the name so two people who share a name
  // do not share a byline.
  let author =
    (await db.query.contributors.findFirst({
      where: and(eq(contributors.boardId, task.boardId), eq(contributors.userId, user.id)),
    })) ??
    (await db.query.contributors.findFirst({
      where: and(eq(contributors.boardId, task.boardId), eq(contributors.name, user.name)),
    }));
  if (!author) {
    const inserted = await db
      .insert(contributors)
      .values({
        id: randomUUID(),
        boardId: task.boardId,
        userId: user.id,
        name: user.name,
        email: user.email ?? null,
        color: "amber",
      })
      .returning();
    author = inserted[0];
  }
  if (!author) throw new Error("Could not resolve a comment author");

  const content = body.trim();
  const inserted = await db
    .insert(comments)
    .values({
      id: randomUUID(),
      taskId,
      boardId: task.boardId,
      authorId: author.id,
      content,
    })
    .returning({ id: comments.id });
  if (inserted[0]) void indexComment(inserted[0].id);

  // Same duplication as `moveTask` above: ./comments.ts has the other comment
  // path. This one posts plain text rather than Tiptap JSON, so there are no
  // mentions to extract — only the task's own people need telling.
  await queueCommentNotification({
    boardId: task.boardId,
    taskId,
    authorId: author.id,
    commentContent: content,
  });

  const board = await db.query.boards.findFirst({
    where: eq(boards.id, task.boardId),
  });
  revalidatePath(`/clients/${board?.clientId}/tasks/${taskId}`);
}

/** Turns a research signal into real work on the client's board. */
export async function createBriefFromTopic(topicId: string) {
  await requireUser();
  const topic = await db.query.topics.findFirst({
    where: eq(topics.id, topicId),
  });
  if (!topic?.clientId) throw new Error("That topic has no client");

  const taskId = await createTask(topic.clientId, `Brief: ${topic.title}`, 0);
  await db
    .update(topics)
    .set({ state: "briefed", briefTaskId: taskId })
    .where(eq(topics.id, topicId));
  revalidatePath("/radar");
  return taskId;
}

export async function dismissTopic(topicId: string) {
  await requireUser();
  await db.update(topics).set({ state: "dismissed" }).where(eq(topics.id, topicId));
  revalidatePath("/radar");
}

/** Attaches a finished caption to the task that will publish it. */
export async function attachCaption(draftId: string, finalBody: string, selectedIndex: number) {
  await requireUser();
  const draft = await db.query.captionDrafts.findFirst({
    where: eq(captionDrafts.id, draftId),
  });
  if (!draft) throw new Error("Draft not found");

  await db
    .update(captionDrafts)
    .set({ finalBody, selectedIndex, attachedAt: new Date() })
    .where(eq(captionDrafts.id, draftId));

  if (draft.taskId) {
    await addTaskComment(draft.taskId, `Caption attached:\n\n${finalBody}`);
  }
  revalidatePath("/studio");
  return { ok: true };
}

export async function scheduleBroadcast(broadcastId: string, scheduledAt: Date) {
  await requireUser();
  await db
    .update(broadcasts)
    .set({ scheduledAt, state: "scheduled" })
    .where(eq(broadcasts.id, broadcastId));
  void indexBroadcast(broadcastId);
  revalidatePath("/communities");
}

export async function reschedulePost(postId: string, scheduledAt: Date) {
  await requireUser();
  const post = await db.query.scheduledPosts.findFirst({
    where: eq(scheduledPosts.id, postId),
  });
  if (!post) throw new Error("Post not found");
  await db.update(scheduledPosts).set({ scheduledAt }).where(eq(scheduledPosts.id, postId));
  revalidateAgency(post.clientId);
}

export async function markPostPublished(postId: string) {
  await requireUser();
  await db
    .update(scheduledPosts)
    .set({ state: "published", publishedAt: new Date() })
    .where(eq(scheduledPosts.id, postId));
  revalidatePath("/publishing");
  revalidatePath("/calendar");
}

/** Applied from the trimmer when the founder accepts a suggested name. */
export async function renameAsset(assetId: string, title: string) {
  await requireUser();
  await db.update(assets).set({ title: title.trim() }).where(eq(assets.id, assetId));
  void indexAsset(assetId);
  revalidateAgency();
}

export async function renameTask(taskId: string, title: string) {
  await requireUser();
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!task) throw new Error("Task not found");
  await db.update(tasks).set({ title: title.trim() }).where(eq(tasks.id, taskId));
  void indexTask(taskId);
  const board = await db.query.boards.findFirst({
    where: eq(boards.id, task.boardId),
  });
  revalidateAgency(board?.clientId ?? undefined);
}

/** `date` is YYYY-MM-DD from a date input, or null to clear the deadline. */
export async function setTaskDueDate(taskId: string, date: string | null) {
  await requireUser();
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!task) throw new Error("Task not found");

  // A bare date means the end of that day, so a task is not late all morning.
  const dueAt = date ? new Date(`${date}T23:59:59`) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) throw new Error("Invalid date");

  await db.update(tasks).set({ dueAt }).where(eq(tasks.id, taskId));
  const board = await db.query.boards.findFirst({
    where: eq(boards.id, task.boardId),
  });
  revalidateAgency(board?.clientId ?? undefined);
}

export async function renameClient(clientId: string, name: string) {
  await requireUser();
  await db.update(clients).set({ name: name.trim() }).where(eq(clients.id, clientId));
  void indexClient(clientId);
  revalidateAgency(clientId);
}

// ── Client team ────────────────────────────────────────────────────────────

/**
 * The people emailed about this client's work. Notifications address
 * contributors, which are board-local, so the client's team is its board's
 * roster — see `getTaskRecipients` for how a task inherits it.
 */
export async function getClientTeam(clientId: string) {
  await requireUser();
  const board = await db.query.boards.findFirst({ where: eq(boards.clientId, clientId) });
  if (!board) return [];

  const rows = await db.query.contributors.findMany({
    where: eq(contributors.boardId, board.id),
  });
  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    name: row.name,
    email: row.email,
    unsubscribed: Boolean(row.unsubscribedAt),
  }));
}

/**
 * Replaces the client's team with the given accounts. People who are dropped
 * keep their contributor row when it is still referenced — a past comment or
 * assignment has to keep its author — but stop being on the team.
 */
export async function setClientTeam(clientId: string, userIds: string[]) {
  const user = await requireUser();
  // Naming a team is also how a boardless client gets its board, so the first
  // team can be set before the first task exists.
  const { boardId } = await ensureClientBoard(clientId, user.id);

  const wanted = [...new Set(userIds)];
  for (const userId of wanted) {
    await resolveContributorForUser(boardId, userId);
  }

  const existing = await db.query.contributors.findMany({
    where: eq(contributors.boardId, boardId),
  });
  const keep = new Set(wanted);
  for (const row of existing) {
    if (row.userId && keep.has(row.userId)) continue;
    // Restrict-on-delete guards the references, so a row that is still cited
    // anywhere stays put rather than failing the whole save.
    try {
      await db.delete(contributors).where(eq(contributors.id, row.id));
    } catch {
      // Still referenced by a comment or assignment — leave it.
    }
  }

  revalidateAgency(clientId);
}
