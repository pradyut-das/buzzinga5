"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  assets,
  boards,
  contributors,
  CONTRIBUTOR_COLORS,
  users,
  reviewNotes,
  tasks,
  taskAssignees,
  taskCollaborators,
  taskStakeholders,
  type AssetSlide,
  type MediaState,
  taskCategories,
  type TaskStatus,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { isTaskStatus } from "@/lib/task-types";
import { indexAsset, indexTask } from "@/lib/search/indexer";

/**
 * Everything a task workspace writes: category, status, people, doc and the
 * review notes hanging off its assets. There is one workspace for every task,
 * because there are no built-in task kinds left to branch on.
 */

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Sign in first");
  return user;
}

async function loadTask(taskId: string) {
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!task) throw new Error("Task not found");
  return task;
}

async function revalidateTask(taskId: string) {
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!task) return;
  const board = await db.query.boards.findFirst({ where: eq(boards.id, task.boardId) });
  const clientId = task.clientId ?? board?.clientId;
  if (clientId) {
    revalidatePath(`/clients/${clientId}`);
    revalidatePath(`/clients/${clientId}/tasks/${taskId}`);
  }
  revalidatePath("/");
}

// ── Task facts ────────────────────────────────────────────────────────────

export async function setTaskStatus(taskId: string, status: string) {
  await requireUser();
  if (!isTaskStatus(status)) throw new Error(`Unknown status: ${status}`);
  await db
    .update(tasks)
    .set({ status: status as TaskStatus })
    .where(eq(tasks.id, taskId));
  await revalidateTask(taskId);
}

/**
 * Files a task under one of its board's categories, or clears it. The category
 * must belong to the same board — categories are a board's own vocabulary.
 */
export async function setTaskCategory(taskId: string, categoryId: string | null) {
  await requireUser();
  const task = await loadTask(taskId);

  if (categoryId) {
    const category = await db.query.taskCategories.findFirst({
      where: and(eq(taskCategories.id, categoryId), eq(taskCategories.boardId, task.boardId)),
      columns: { id: true },
    });
    if (!category) throw new Error("That category is not on this board");
  }

  await db.update(tasks).set({ categoryId }).where(eq(tasks.id, taskId));
  await revalidateTask(taskId);
}

/** Saves the WYSIWYG document. Called on a debounce from the editor. */
export async function saveTaskDoc(taskId: string, doc: string) {
  await requireUser();
  await db.update(tasks).set({ doc }).where(eq(tasks.id, taskId));
  // No revalidate: the editor already holds the current text, and refreshing
  // the route under an open editor would fight the caret.
  void indexTask(taskId);
}

export async function setTaskClient(taskId: string, clientId: string | null) {
  await requireUser();
  await db.update(tasks).set({ clientId }).where(eq(tasks.id, taskId));
  await revalidateTask(taskId);
  void indexTask(taskId);
}

export async function renameTaskTitle(taskId: string, title: string) {
  await requireUser();
  const trimmed = title.trim();
  if (!trimmed) throw new Error("A task needs a title");
  await db.update(tasks).set({ title: trimmed }).where(eq(tasks.id, taskId));
  await revalidateTask(taskId);
  void indexTask(taskId);
}

// ── People ────────────────────────────────────────────────────────────────

export type PeopleRole = "assignee" | "collaborator" | "stakeholder";

/**
 * Replaces one role's people in full. The UI always sends the whole set, so a
 * removal and an addition are the same write.
 */
export async function setTaskPeople(taskId: string, role: PeopleRole, contributorIds: string[]) {
  await requireUser();
  const task = await loadTask(taskId);
  if (contributorIds.length) {
    const known = await db.query.contributors.findMany({
      where: eq(contributors.boardId, task.boardId),
    });
    const knownIds = new Set(known.map((row) => row.id));
    for (const id of contributorIds) {
      if (!knownIds.has(id)) throw new Error("That person is not on this board");
    }
  }

  const rows = contributorIds.map((contributorId) => ({ taskId, contributorId }));
  if (role === "assignee") {
    await db.delete(taskAssignees).where(eq(taskAssignees.taskId, taskId));
    if (rows.length) await db.insert(taskAssignees).values(rows);
  } else if (role === "collaborator") {
    await db.delete(taskCollaborators).where(eq(taskCollaborators.taskId, taskId));
    if (rows.length) await db.insert(taskCollaborators).values(rows);
  } else {
    await db.delete(taskStakeholders).where(eq(taskStakeholders.taskId, taskId));
    if (rows.length) await db.insert(taskStakeholders).values(rows);
  }
  await revalidateTask(taskId);
}

// ── Media verdicts ────────────────────────────────────────────────────────

export async function setAssetState(assetId: string, state: MediaState) {
  await requireUser();
  const asset = await db.query.assets.findFirst({ where: eq(assets.id, assetId) });
  if (!asset) throw new Error("Asset not found");
  await db.update(assets).set({ state }).where(eq(assets.id, assetId));
  if (asset.taskId) await revalidateTask(asset.taskId);
}

/** Accept or reject a single slide inside a carousel. */
export async function setSlideState(assetId: string, slideIndex: number, state: MediaState) {
  await requireUser();
  const asset = await db.query.assets.findFirst({ where: eq(assets.id, assetId) });
  if (!asset) throw new Error("Asset not found");

  const slides = JSON.parse(asset.slides ?? "[]") as AssetSlide[];
  const slide = slides[slideIndex];
  if (!slide) throw new Error("That slide no longer exists");
  slides[slideIndex] = { ...slide, state };

  await db
    .update(assets)
    .set({ slides: JSON.stringify(slides) })
    .where(eq(assets.id, assetId));
  if (asset.taskId) await revalidateTask(asset.taskId);
}

export async function renameAssetTitle(assetId: string, title: string) {
  await requireUser();
  const asset = await db.query.assets.findFirst({ where: eq(assets.id, assetId) });
  if (!asset) throw new Error("Asset not found");
  await db
    .update(assets)
    .set({ title: title.trim(), suggestedTitle: null })
    .where(eq(assets.id, assetId));
  void indexAsset(assetId);
  if (asset.taskId) await revalidateTask(asset.taskId);
}

// ── Review notes ──────────────────────────────────────────────────────────

/**
 * A note pinned to a slide, a timecode, or the asset as a whole. `annotation`
 * carries the freehand drawing over the frame, in normalised coordinates so it
 * survives any player size.
 */
export async function addAssetNote(input: {
  assetId: string;
  body: string;
  slideIndex?: number | null;
  timestampSeconds?: number | null;
  annotation?: string | null;
}) {
  const user = await requireUser();
  const body = input.body.trim();
  if (!body) throw new Error("A note needs something in it");

  const asset = await db.query.assets.findFirst({ where: eq(assets.id, input.assetId) });
  if (!asset) throw new Error("Asset not found");

  await db.insert(reviewNotes).values({
    id: randomUUID(),
    assetId: input.assetId,
    approvalId: null,
    slideIndex: input.slideIndex ?? null,
    timestampSeconds:
      typeof input.timestampSeconds === "number" ? Math.round(input.timestampSeconds) : null,
    annotation: input.annotation ?? null,
    author: user.name,
    source: "agency",
    body,
  });

  if (asset.taskId) await revalidateTask(asset.taskId);
}

export async function resolveAssetNote(noteId: string, resolved: boolean) {
  await requireUser();
  const note = await db.query.reviewNotes.findFirst({ where: eq(reviewNotes.id, noteId) });
  if (!note) throw new Error("Note not found");

  await db
    .update(reviewNotes)
    .set({ resolvedAt: resolved ? new Date() : null })
    .where(eq(reviewNotes.id, noteId));

  if (note.assetId) {
    const asset = await db.query.assets.findFirst({ where: eq(assets.id, note.assetId) });
    if (asset?.taskId) await revalidateTask(asset.taskId);
  }
}

// ── People come from real accounts ────────────────────────────────────────

/**
 * The accounts a board can staff work with. Pickers list these rather than
 * board-local names, so every person on a task is someone who can sign in.
 * `contributorId` is set once the account has been used on this board.
 */
export async function listBoardPeople(boardId: string) {
  await requireUser();
  const [userRows, contributorRows] = await Promise.all([
    db.select().from(users).orderBy(users.name),
    db.query.contributors.findMany({ where: eq(contributors.boardId, boardId) }),
  ]);
  const byUserId = new Map(
    contributorRows.filter((row) => row.userId).map((row) => [row.userId as string, row]),
  );

  return userRows.map((user) => ({
    userId: user.id,
    name: user.name,
    email: user.email,
    contributorId: byUserId.get(user.id)?.id ?? null,
  }));
}

/**
 * Turns an account into this board's contributor, reusing the row if the
 * account has worked here before. Colour is assigned round-robin so a new face
 * is visually distinct without asking anyone to choose.
 */
async function contributorForUser(boardId: string, userId: string) {
  const existing = await db.query.contributors.findFirst({
    where: and(eq(contributors.boardId, boardId), eq(contributors.userId, userId)),
  });
  if (existing) return existing.id;

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw new Error("That account no longer exists");

  const onBoard = await db.query.contributors.findMany({
    where: eq(contributors.boardId, boardId),
  });
  const id = randomUUID();
  await db.insert(contributors).values({
    id,
    boardId,
    userId,
    name: user.name,
    email: user.email,
    color: CONTRIBUTOR_COLORS[onBoard.length % CONTRIBUTOR_COLORS.length],
  });
  return id;
}

/** Assigns people to a task by account, creating board rows as needed. */
export async function setTaskPeopleByUser(taskId: string, role: PeopleRole, userIds: string[]) {
  await requireUser();
  const task = await loadTask(taskId);
  const contributorIds: string[] = [];
  for (const userId of userIds) {
    contributorIds.push(await contributorForUser(task.boardId, userId));
  }
  await setTaskPeople(taskId, role, contributorIds);
}
