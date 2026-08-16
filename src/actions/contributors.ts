"use server";

import { db } from "@/db";
import {
  contributors,
  taskAssignees,
  taskStakeholders,
  comments,
  columns,
  tasks,
  CONTRIBUTOR_COLORS,
  type ContributorColor,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { canAccessBoard, requireBoardAccess } from "@/lib/secure-board";
import { getRandomContributorColor } from "@/lib/contributor-colors";
import { queueAssignNotification } from "@/lib/notifications";
import { currentContributorId } from "@/lib/auth/contributor";
import { sendInstantNotifications } from "@/lib/send-instant-notification";
import { requireTask, requireContributor } from "@/lib/require-resource";

export async function createContributor(
  boardId: string,
  name: string,
  id: string,
  color: ContributorColor,
) {
  await requireBoardAccess(boardId);

  // Validate color is a known contributor color
  const validatedColor = CONTRIBUTOR_COLORS.includes(color) ? color : getRandomContributorColor();

  await db.insert(contributors).values({
    id,
    boardId,
    name,
    color: validatedColor,
  });

  revalidatePath(`/boards/${boardId}`);
  return id;
}

export async function getContributors(boardId: string) {
  if (!(await canAccessBoard(boardId))) {
    return [];
  }

  const contributorsList = await db.query.contributors.findMany({
    where: eq(contributors.boardId, boardId),
  });

  return contributorsList;
}

export async function addAssignee(taskId: string, contributorId: string, boardId: string) {
  await requireBoardAccess(boardId);
  await requireTask(taskId, boardId);
  await requireContributor(contributorId, boardId);

  // Check if already assigned
  const existing = await db.query.taskAssignees.findFirst({
    where: and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.contributorId, contributorId)),
  });

  if (existing) return;

  await db.insert(taskAssignees).values({
    taskId,
    contributorId,
  });

  // Queue notification for the new assignee
  const queued = await queueAssignNotification({
    boardId,
    taskId,
    assigneeId: contributorId,
    assignedById: await currentContributorId(boardId),
  });
  await sendInstantNotifications(boardId, queued);

  revalidatePath(`/boards/${boardId}`);
}

export async function removeAssignee(taskId: string, contributorId: string, boardId: string) {
  await requireBoardAccess(boardId);
  await requireTask(taskId, boardId);
  await requireContributor(contributorId, boardId);

  await db
    .delete(taskAssignees)
    .where(and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.contributorId, contributorId)));

  revalidatePath(`/boards/${boardId}`);
}

export async function createAndAssignContributor(
  taskId: string,
  boardId: string,
  name: string,
  id: string,
  color: ContributorColor,
) {
  await createContributor(boardId, name, id, color);
  await addAssignee(taskId, id, boardId);
  return id;
}

export async function addStakeholder(taskId: string, contributorId: string, boardId: string) {
  await requireBoardAccess(boardId);
  await requireTask(taskId, boardId);
  await requireContributor(contributorId, boardId);

  // Check if already a stakeholder
  const existing = await db.query.taskStakeholders.findFirst({
    where: and(
      eq(taskStakeholders.taskId, taskId),
      eq(taskStakeholders.contributorId, contributorId),
    ),
  });

  if (existing) return;

  await db.insert(taskStakeholders).values({
    taskId,
    contributorId,
  });

  // Being made a stakeholder is being put on the hook for something, so it is
  // worth the same immediate note as being assigned.
  const queued = await queueAssignNotification({
    boardId,
    taskId,
    assigneeId: contributorId,
    assignedById: await currentContributorId(boardId),
  });
  await sendInstantNotifications(boardId, queued);

  revalidatePath(`/boards/${boardId}`);
}

export async function removeStakeholder(taskId: string, contributorId: string, boardId: string) {
  await requireBoardAccess(boardId);
  await requireTask(taskId, boardId);
  await requireContributor(contributorId, boardId);

  await db
    .delete(taskStakeholders)
    .where(
      and(eq(taskStakeholders.taskId, taskId), eq(taskStakeholders.contributorId, contributorId)),
    );

  revalidatePath(`/boards/${boardId}`);
}

export async function createAndAddStakeholder(
  taskId: string,
  boardId: string,
  name: string,
  id: string,
  color: ContributorColor,
) {
  await createContributor(boardId, name, id, color);
  await addStakeholder(taskId, id, boardId);
  return id;
}

export async function updateContributor(
  id: string,
  boardId: string,
  updates: { name?: string; color?: ContributorColor; email?: string | null },
) {
  await requireBoardAccess(boardId);
  await requireContributor(id, boardId);

  const updateData: { name?: string; color?: ContributorColor; email?: string | null } = {};
  if (updates.color !== undefined) {
    updateData.color = updates.color;
  }
  if (updates.name !== undefined) {
    updateData.name = updates.name;
  }
  if (updates.email !== undefined) {
    // Validate email format if provided
    if (updates.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.email)) {
      throw new Error("Invalid email format");
    }
    updateData.email = updates.email;
  }

  await db.update(contributors).set(updateData).where(eq(contributors.id, id));

  revalidatePath(`/boards/${boardId}`);
}

export async function deleteContributor(id: string, boardId: string) {
  await requireBoardAccess(boardId);
  await requireContributor(id, boardId);

  // Check if contributor has any task assignments
  const assignmentCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(taskAssignees)
    .where(eq(taskAssignees.contributorId, id))
    .then((rows) => rows[0]?.count ?? 0);

  if (assignmentCount > 0) {
    throw new Error("Cannot delete contributor with task assignments");
  }

  // Check if contributor has any task stakeholder relationships
  const stakeholderCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(taskStakeholders)
    .where(eq(taskStakeholders.contributorId, id))
    .then((rows) => rows[0]?.count ?? 0);

  if (stakeholderCount > 0) {
    throw new Error("Cannot delete contributor with task stakeholder relationships");
  }

  // Check if contributor has any comments as author
  const commentCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(comments)
    .where(eq(comments.authorId, id))
    .then((rows) => rows[0]?.count ?? 0);

  if (commentCount > 0) {
    throw new Error("Cannot delete contributor with comments");
  }

  // Check if contributor is referenced as stakeholder in any comments
  const commentStakeholderCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(comments)
    .where(eq(comments.stakeholderId, id))
    .then((rows) => rows[0]?.count ?? 0);

  if (commentStakeholderCount > 0) {
    throw new Error("Cannot delete contributor referenced as stakeholder in comments");
  }

  await db.delete(contributors).where(eq(contributors.id, id));
  revalidatePath(`/boards/${boardId}`);
}

export type ContributorWithStats = {
  id: string;
  name: string;
  email: string | null;
  color: ContributorColor;
  boardId: string;
  taskCount: number;
  commentCount: number;
  tasksByColumn: Array<{
    columnId: string;
    columnName: string;
    count: number;
  }>;
};

export async function getContributorsWithStats(boardId: string): Promise<ContributorWithStats[]> {
  if (!(await canAccessBoard(boardId))) {
    return [];
  }

  // Get all contributors for this board
  const allContributors = await db.query.contributors.findMany({
    where: eq(contributors.boardId, boardId),
  });

  // Get all columns for this board (for the breakdown)
  const boardColumns = await db.query.columns.findMany({
    where: eq(columns.boardId, boardId),
    orderBy: columns.position,
  });

  // Get task assignments with task column info
  const assignmentsWithColumns = await db
    .select({
      contributorId: taskAssignees.contributorId,
      columnId: tasks.columnId,
    })
    .from(taskAssignees)
    .innerJoin(tasks, eq(taskAssignees.taskId, tasks.id))
    .where(eq(tasks.boardId, boardId));

  // Get comment counts per contributor
  const commentCounts = await db
    .select({
      authorId: comments.authorId,
      count: sql<number>`count(*)`,
    })
    .from(comments)
    .where(eq(comments.boardId, boardId))
    .groupBy(comments.authorId);

  // Build the result
  return allContributors.map((contributor) => {
    // Count tasks per column for this contributor
    const contributorAssignments = assignmentsWithColumns.filter(
      (a) => a.contributorId === contributor.id,
    );

    const tasksByColumn = boardColumns.map((col) => ({
      columnId: col.id,
      columnName: col.name,
      count: contributorAssignments.filter((a) => a.columnId === col.id).length,
    }));

    const commentEntry = commentCounts.find((c) => c.authorId === contributor.id);

    return {
      id: contributor.id,
      name: contributor.name,
      email: contributor.email,
      color: contributor.color,
      boardId: contributor.boardId,
      taskCount: contributorAssignments.length,
      commentCount: commentEntry?.count ?? 0,
      tasksByColumn,
    };
  });
}
