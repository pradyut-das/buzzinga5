"use server";

import { db } from "@/db";
import {
  tags,
  taskTags,
  tasks,
  columns,
  CONTRIBUTOR_COLORS,
  type ContributorColor,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { canAccessBoard, requireBoardAccess } from "@/lib/secure-board";
import { getRandomTagColor } from "@/lib/tag-colors";
import { ensureTagHasHash } from "@/lib/tag-utils";
import { requireTask, requireTag } from "@/lib/require-resource";

export async function createTag(
  boardId: string,
  name: string,
  id: string,
  color: ContributorColor,
) {
  await requireBoardAccess(boardId);

  // Validate color is a known color
  const validatedColor = CONTRIBUTOR_COLORS.includes(color) ? color : getRandomTagColor();

  // Ensure tag name starts with "#"
  const normalizedName = ensureTagHasHash(name);

  await db.insert(tags).values({
    id,
    boardId,
    name: normalizedName,
    color: validatedColor,
  });

  revalidatePath(`/boards/${boardId}`);
  return id;
}

export async function getTags(boardId: string) {
  if (!(await canAccessBoard(boardId))) {
    return [];
  }

  const tagsList = await db.query.tags.findMany({
    where: eq(tags.boardId, boardId),
  });

  return tagsList;
}

export async function addTagToTask(taskId: string, tagId: string, boardId: string) {
  await requireBoardAccess(boardId);
  await requireTask(taskId, boardId);
  await requireTag(tagId, boardId);

  // Check if already assigned
  const existing = await db.query.taskTags.findFirst({
    where: and(eq(taskTags.taskId, taskId), eq(taskTags.tagId, tagId)),
  });

  if (existing) return;

  await db.insert(taskTags).values({
    taskId,
    tagId,
  });

  revalidatePath(`/boards/${boardId}`);
}

export async function removeTagFromTask(taskId: string, tagId: string, boardId: string) {
  await requireBoardAccess(boardId);
  await requireTask(taskId, boardId);
  await requireTag(tagId, boardId);

  await db.delete(taskTags).where(and(eq(taskTags.taskId, taskId), eq(taskTags.tagId, tagId)));

  revalidatePath(`/boards/${boardId}`);
}

export async function createAndAddTag(
  taskId: string,
  boardId: string,
  name: string,
  id: string,
  color: ContributorColor,
) {
  await createTag(boardId, name, id, color);
  await addTagToTask(taskId, id, boardId);
  return id;
}

export async function updateTag(
  id: string,
  boardId: string,
  updates: { name?: string; color?: ContributorColor },
) {
  await requireBoardAccess(boardId);
  await requireTag(id, boardId);

  const updateData: { name?: string; color?: ContributorColor } = {};
  if (updates.color !== undefined) {
    updateData.color = updates.color;
  }
  if (updates.name !== undefined) {
    // Ensure tag name starts with "#"
    updateData.name = ensureTagHasHash(updates.name);
  }

  await db.update(tags).set(updateData).where(eq(tags.id, id));

  revalidatePath(`/boards/${boardId}`);
}

export async function deleteTag(id: string, boardId: string) {
  await requireBoardAccess(boardId);
  await requireTag(id, boardId);

  // Check if tag has any task assignments
  const assignmentCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(taskTags)
    .where(eq(taskTags.tagId, id))
    .then((rows) => rows[0]?.count ?? 0);

  if (assignmentCount > 0) {
    throw new Error("Cannot delete tag with task assignments");
  }

  await db.delete(tags).where(eq(tags.id, id));
  revalidatePath(`/boards/${boardId}`);
}

export type TagWithStats = {
  id: string;
  name: string;
  color: ContributorColor;
  boardId: string;
  taskCount: number;
  tasksByColumn: Array<{
    columnId: string;
    columnName: string;
    count: number;
  }>;
};

export async function getTagsWithStats(boardId: string): Promise<TagWithStats[]> {
  if (!(await canAccessBoard(boardId))) {
    return [];
  }

  // Get all tags for this board
  const allTags = await db.query.tags.findMany({
    where: eq(tags.boardId, boardId),
  });

  // Get all columns for this board (for the breakdown)
  const boardColumns = await db.query.columns.findMany({
    where: eq(columns.boardId, boardId),
    orderBy: columns.position,
  });

  // Get task assignments with task column info
  const assignmentsWithColumns = await db
    .select({
      tagId: taskTags.tagId,
      columnId: tasks.columnId,
    })
    .from(taskTags)
    .innerJoin(tasks, eq(taskTags.taskId, tasks.id))
    .where(eq(tasks.boardId, boardId));

  // Build the result
  return allTags.map((tag) => {
    // Count tasks per column for this tag
    const tagAssignments = assignmentsWithColumns.filter((a) => a.tagId === tag.id);

    const tasksByColumn = boardColumns.map((col) => ({
      columnId: col.id,
      columnName: col.name,
      count: tagAssignments.filter((a) => a.columnId === col.id).length,
    }));

    return {
      id: tag.id,
      name: tag.name,
      color: tag.color,
      boardId: tag.boardId,
      taskCount: tagAssignments.length,
      tasksByColumn,
    };
  });
}
