import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  approvals,
  assets,
  boardMembers,
  boards,
  broadcasts,
  captionDrafts,
  clients,
  columns,
  comments,
  communities,
  contributors,
  pendingNotifications,
  reviewNotes,
  scheduledPosts,
  tags,
  taskAssignees,
  taskCategories,
  taskCollaborators,
  taskStakeholders,
  taskTags,
  tasks,
  topics,
  users,
} from "@/db/schema";

/**
 * Top-level deletes for the admin console.
 *
 * Nearly every link table uses `onDelete: "restrict"`, so a delete is the
 * schema read backwards. These run leaf-first and never rely on the database
 * to cascade for us — `set null` columns are nulled explicitly too, because
 * FK actions only fire when `PRAGMA foreign_keys` is on and that is not a
 * guarantee worth betting a delete on.
 */

/** Everything on a board: tasks, comments, tags, contributors, columns, categories. */
export async function deleteBoardCascade(boardId: string): Promise<void> {
  const boardTasks = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.boardId, boardId));
  const taskIds = boardTasks.map((task) => task.id);

  await db.delete(pendingNotifications).where(eq(pendingNotifications.boardId, boardId));

  if (taskIds.length) {
    await db.delete(taskAssignees).where(inArray(taskAssignees.taskId, taskIds));
    await db.delete(taskStakeholders).where(inArray(taskStakeholders.taskId, taskIds));
    await db.delete(taskCollaborators).where(inArray(taskCollaborators.taskId, taskIds));
    await db.delete(taskTags).where(inArray(taskTags.taskId, taskIds));

    // Agency rows outlive the board they came off; they only lose the link.
    await db.update(assets).set({ taskId: null }).where(inArray(assets.taskId, taskIds));
    await db.update(topics).set({ briefTaskId: null }).where(inArray(topics.briefTaskId, taskIds));
    await db
      .update(captionDrafts)
      .set({ taskId: null })
      .where(inArray(captionDrafts.taskId, taskIds));
    await db
      .update(scheduledPosts)
      .set({ taskId: null })
      .where(inArray(scheduledPosts.taskId, taskIds));
  }

  await db.delete(comments).where(eq(comments.boardId, boardId));
  await db.delete(tasks).where(eq(tasks.boardId, boardId));
  await db.delete(tags).where(eq(tags.boardId, boardId));
  await db.delete(contributors).where(eq(contributors.boardId, boardId));
  await db.delete(columns).where(eq(columns.boardId, boardId));
  await db.delete(taskCategories).where(eq(taskCategories.boardId, boardId));
  await db.delete(boardMembers).where(eq(boardMembers.boardId, boardId));
  await db.delete(boards).where(eq(boards.id, boardId));
}

/** A client and every board, asset, historical decision, post and community under it. */
export async function deleteClientCascade(clientId: string): Promise<void> {
  const clientBoards = await db
    .select({ id: boards.id })
    .from(boards)
    .where(eq(boards.clientId, clientId));
  for (const board of clientBoards) {
    await deleteBoardCascade(board.id);
  }

  const clientAssets = await db
    .select({ id: assets.id })
    .from(assets)
    .where(eq(assets.clientId, clientId));
  const assetIds = clientAssets.map((asset) => asset.id);

  if (assetIds.length) {
    await db.delete(reviewNotes).where(inArray(reviewNotes.assetId, assetIds));
  }
  await db.delete(approvals).where(eq(approvals.clientId, clientId));
  await db.delete(captionDrafts).where(eq(captionDrafts.clientId, clientId));
  await db.delete(scheduledPosts).where(eq(scheduledPosts.clientId, clientId));
  if (assetIds.length) {
    await db.delete(assets).where(inArray(assets.id, assetIds));
  }

  const clientCommunities = await db
    .select({ id: communities.id })
    .from(communities)
    .where(eq(communities.clientId, clientId));
  const communityIds = clientCommunities.map((community) => community.id);
  if (communityIds.length) {
    await db.delete(broadcasts).where(inArray(broadcasts.communityId, communityIds));
    await db.delete(communities).where(inArray(communities.id, communityIds));
  }

  await db.delete(topics).where(eq(topics.clientId, clientId));
  await db.delete(clients).where(eq(clients.id, clientId));
}

/**
 * A user and their memberships. Boards they own survive as ownerless boards —
 * deleting a person must never delete the agency's work.
 *
 * The Supabase Auth user goes first: if that fails we abort with the local row
 * intact, because the reverse order would leave an account that can still sign
 * in and silently re-mirror itself on the next request.
 */
export async function deleteUserCascade(userId: string): Promise<void> {
  const { error } = await createAdminClient().auth.admin.deleteUser(userId);
  // "not found" is fine — a local row with no Supabase account still deletes.
  if (error && error.status !== 404) {
    throw new Error(`Could not delete auth user: ${error.message}`);
  }

  await db.delete(boardMembers).where(eq(boardMembers.userId, userId));
  await db.update(boards).set({ ownerId: null }).where(eq(boards.ownerId, userId));
  await db.update(approvals).set({ decidedById: null }).where(eq(approvals.decidedById, userId));
  await db.delete(users).where(eq(users.id, userId));
}
