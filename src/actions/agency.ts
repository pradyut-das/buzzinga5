"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
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

function revalidateAgency(clientId?: string) {
  revalidatePath("/");
  revalidatePath("/health");
  revalidatePath("/calendar");
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

export async function moveTask(taskId: string, columnId: string) {
  await requireUser();
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!task) throw new Error("Task not found");

  await db.update(tasks).set({ columnId }).where(eq(tasks.id, taskId));
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
  await requireUser();
  const board = await db.query.boards.findFirst({
    where: eq(boards.clientId, clientId),
  });
  if (!board) throw new Error("This client has no board");

  const boardColumns = await db.query.columns.findMany({
    where: eq(columns.boardId, board.id),
  });
  const column = boardColumns.find((entry) => entry.position === columnIndex) ?? boardColumns[0];
  if (!column) throw new Error("This board has no columns");

  if (categoryId) {
    const category = await db.query.taskCategories.findFirst({
      where: and(eq(taskCategories.id, categoryId), eq(taskCategories.boardId, board.id)),
    });
    if (!category) throw new Error("That category is not on this client's board");
  }

  const dueAt = dueDate ? new Date(`${dueDate}T23:59:59`) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) throw new Error("Invalid date");

  const id = randomUUID();
  await db.insert(tasks).values({
    id,
    boardId: board.id,
    columnId: column.id,
    title: title.trim(),
    categoryId,
    status: "todo",
    clientId,
    priority: "none",
    position: Date.now() % 100000,
    dueAt,
  });

  revalidateAgency(clientId);
  return id;
}

export async function addTaskComment(taskId: string, body: string) {
  const user = await requireUser();
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!task) throw new Error("Task not found");

  // Comments belong to a board contributor; the founder gets one on first use.
  let author = await db.query.contributors.findFirst({
    where: and(eq(contributors.boardId, task.boardId), eq(contributors.name, user.name)),
  });
  if (!author) {
    const id = randomUUID();
    await db.insert(contributors).values({
      id,
      boardId: task.boardId,
      name: user.name,
      color: "amber",
    });
    author = {
      id,
      boardId: task.boardId,
      name: user.name,
      email: null,
      color: "amber",
    };
  }

  await db.insert(comments).values({
    id: randomUUID(),
    taskId,
    boardId: task.boardId,
    authorId: author.id,
    content: body.trim(),
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
  revalidateAgency();
}

export async function renameTask(taskId: string, title: string) {
  await requireUser();
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!task) throw new Error("Task not found");
  await db.update(tasks).set({ title: title.trim() }).where(eq(tasks.id, taskId));
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
  revalidateAgency(clientId);
}
