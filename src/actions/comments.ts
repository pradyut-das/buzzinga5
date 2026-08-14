"use server";

import { db } from "@/db";
import { comments, tasks } from "@/db/schema";
import { eq, and, lt, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireBoardAccess } from "@/lib/secure-board";
import {
  queueCommentNotification,
  queueMentionNotifications,
  extractMentionIds,
} from "@/lib/notifications";
import { requireTask, requireComment, requireContributor } from "@/lib/require-resource";
import { indexComment, removeSource } from "@/lib/search/indexer";

export async function createComment(
  taskId: string,
  boardId: string,
  authorId: string,
  content: string,
  id: string,
  createdAt?: Date,
  stakeholderId?: string | null,
) {
  await requireBoardAccess(boardId);

  const task = await requireTask(taskId, boardId);

  // Validate author belongs to this board
  await requireContributor(authorId, boardId);

  // Validate stakeholder if provided
  if (stakeholderId) {
    await requireContributor(stakeholderId, boardId);
  }

  await db.insert(comments).values({
    id,
    taskId,
    boardId,
    authorId,
    content,
    stakeholderId: stakeholderId ?? null,
    ...(createdAt ? { createdAt } : null),
  });

  // Move task to position 0 (top of column)
  if (task.position > 0) {
    // Shift all tasks that are above this task (lower position) down by 1
    await db
      .update(tasks)
      .set({ position: sql`${tasks.position} + 1` })
      .where(and(eq(tasks.columnId, task.columnId), lt(tasks.position, task.position)));

    // Move this task to position 0
    await db.update(tasks).set({ position: 0 }).where(eq(tasks.id, taskId));
  }

  // Extract mentioned IDs first (needed for both notifications)
  const mentionedIds = extractMentionIds(content);

  // Queue notification for assignees and stakeholders (except the comment author)
  // Exclude mentioned users - they get the more specific "mention" notification instead
  await queueCommentNotification({
    boardId,
    taskId,
    authorId,
    commentContent: content,
    excludeIds: mentionedIds,
  });

  // Queue mention notifications for @mentioned contributors
  if (mentionedIds.length > 0) {
    await queueMentionNotifications({
      boardId,
      taskId,
      mentionedIds,
      authorId,
      commentContent: content,
    });
  }

  void indexComment(id);
  revalidatePath(`/boards/${boardId}`);
  return id;
}

export async function updateComment(
  commentId: string,
  authorId: string,
  content: string,
  boardId: string,
  stakeholderId?: string | null,
) {
  await requireBoardAccess(boardId);
  const existingComment = await requireComment(commentId, boardId);

  // Validate author belongs to this board
  await requireContributor(authorId, boardId);

  // Validate stakeholder if provided
  if (stakeholderId) {
    await requireContributor(stakeholderId, boardId);
  }

  // Track new mentions before updating
  const oldMentionIds = new Set(extractMentionIds(existingComment.content));
  const newMentionIds = extractMentionIds(content);
  const addedMentionIds = newMentionIds.filter((id) => !oldMentionIds.has(id));

  await db
    .update(comments)
    .set({
      authorId,
      content,
      stakeholderId: stakeholderId ?? null,
    })
    .where(eq(comments.id, commentId));

  // Queue mention notifications only for newly added mentions
  if (addedMentionIds.length > 0) {
    await queueMentionNotifications({
      boardId,
      taskId: existingComment.taskId,
      mentionedIds: addedMentionIds,
      authorId,
      commentContent: content,
    });
  }

  void indexComment(commentId);
  revalidatePath(`/boards/${boardId}`);
}

export async function deleteComment(commentId: string, boardId: string) {
  await requireBoardAccess(boardId);
  await requireComment(commentId, boardId);

  // Delete the comment
  await db.delete(comments).where(eq(comments.id, commentId));
  void removeSource("comment", commentId);
  revalidatePath(`/boards/${boardId}`);
}
