import { db } from "@/db";
import {
  contributors,
  pendingNotifications,
  taskAssignees,
  taskCollaborators,
  taskStakeholders,
  tasks,
  type NotificationType,
} from "@/db/schema";
import { eq } from "drizzle-orm";

export type NotificationMetadata = {
  fromColumn?: string;
  toColumn?: string;
  priority?: string;
  commentPreview?: string;
  status?: string;
  docTitle?: string;
  docId?: string;
};

/**
 * Who a task's changes concern.
 *
 * The team is the client's, not the task's: everyone on the client's board
 * hears about its work by default, so nobody has to be added task by task.
 * A task that names its own people opts out of that — the moment someone is
 * picked as assignee, collaborator, or stakeholder, that set becomes the whole
 * recipient list and the client default no longer applies. Clearing the task's
 * people puts it back on the client team.
 */
export async function getTaskRecipients(taskId: string): Promise<string[]> {
  const [assignees, collaborators, stakeholders] = await Promise.all([
    db.query.taskAssignees.findMany({
      where: eq(taskAssignees.taskId, taskId),
    }),
    db.query.taskCollaborators.findMany({
      where: eq(taskCollaborators.taskId, taskId),
    }),
    db.query.taskStakeholders.findMany({
      where: eq(taskStakeholders.taskId, taskId),
    }),
  ]);

  // One person can hold more than one role on a task; a Set collapses them.
  const overrideIds = new Set<string>();
  for (const row of [...assignees, ...collaborators, ...stakeholders]) {
    overrideIds.add(row.contributorId);
  }
  if (overrideIds.size > 0) return Array.from(overrideIds);

  return getClientTeam(taskId);
}

/**
 * The client team behind a task: every contributor on its board. Opt-outs are
 * not filtered here — `unsubscribedAt` is honoured at delivery, so leaving it
 * alone keeps one rule in one place.
 */
async function getClientTeam(taskId: string): Promise<string[]> {
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!task) return [];

  const team = await db.query.contributors.findMany({
    where: eq(contributors.boardId, task.boardId),
  });
  return team.map((row) => row.id);
}

/**
 * Queue notifications for multiple recipients.
 * Automatically filters out the triggeredBy person (don't notify yourself).
 *
 * Returns the ids of the rows written, so a caller that wants immediate
 * delivery can hand them straight to `sendInstantNotifications`.
 */
export async function queueNotifications(params: {
  boardId: string;
  taskId: string;
  recipientIds: string[];
  type: NotificationType;
  triggeredById?: string;
  metadata?: NotificationMetadata;
}): Promise<string[]> {
  const { boardId, taskId, recipientIds, type, triggeredById, metadata } = params;

  // Filter out the person who triggered the notification, and collapse repeats
  // so one write cannot address the same person twice.
  const filteredRecipients = [...new Set(recipientIds)].filter((id) => id !== triggeredById);

  if (filteredRecipients.length === 0) {
    return [];
  }

  const notifications = filteredRecipients.map((recipientId) => ({
    id: crypto.randomUUID(),
    boardId,
    taskId,
    recipientId,
    type,
    triggeredById: triggeredById ?? null,
    metadata: metadata ? JSON.stringify(metadata) : null,
  }));

  await db.insert(pendingNotifications).values(notifications);
  return notifications.map((n) => n.id);
}

/**
 * Queue a notification when a new comment is added.
 * Optionally exclude certain user IDs (e.g., mentioned users who get their own notification).
 */
export async function queueCommentNotification(params: {
  boardId: string;
  taskId: string;
  authorId: string;
  commentContent: string;
  excludeIds?: string[];
}): Promise<void> {
  const { boardId, taskId, authorId, commentContent, excludeIds = [] } = params;

  let recipientIds = await getTaskRecipients(taskId);

  // Exclude mentioned users (they get a more specific "mention" notification)
  if (excludeIds.length > 0) {
    const excludeSet = new Set(excludeIds);
    recipientIds = recipientIds.filter((id) => !excludeSet.has(id));
  }

  const commentPreview = extractCommentPreview(commentContent);

  await queueNotifications({
    boardId,
    taskId,
    recipientIds,
    type: "comment",
    triggeredById: authorId,
    metadata: { commentPreview },
  });
}

/**
 * Queue a notification when a task is moved to a different column.
 */
export async function queueMoveNotification(params: {
  boardId: string;
  taskId: string;
  fromColumnName: string;
  toColumnName: string;
  movedById?: string;
}): Promise<string[]> {
  const { boardId, taskId, fromColumnName, toColumnName, movedById } = params;

  const recipientIds = await getTaskRecipients(taskId);

  return queueNotifications({
    boardId,
    taskId,
    recipientIds,
    type: "move",
    triggeredById: movedById,
    metadata: { fromColumn: fromColumnName, toColumn: toColumnName },
  });
}

/**
 * Queue a notification when a task is created.
 *
 * Addresses the client team, since a brand-new task has no people of its own
 * yet — this is the notification that tells them there is new work at all.
 */
export async function queueCreatedNotification(params: {
  boardId: string;
  taskId: string;
  createdById?: string;
}): Promise<string[]> {
  const { boardId, taskId, createdById } = params;

  const recipientIds = await getTaskRecipients(taskId);

  return queueNotifications({
    boardId,
    taskId,
    recipientIds,
    type: "created",
    triggeredById: createdById,
  });
}

/**
 * Queue a notification when someone is given a role on a task.
 *
 * Addresses only the people just added — the rest of the task's roster has not
 * had anything change for them.
 */
export async function queueAssignNotification(params: {
  boardId: string;
  taskId: string;
  assigneeId: string | string[];
  assignedById?: string;
}): Promise<string[]> {
  const { boardId, taskId, assigneeId, assignedById } = params;

  return queueNotifications({
    boardId,
    taskId,
    recipientIds: Array.isArray(assigneeId) ? assigneeId : [assigneeId],
    type: "assign",
    triggeredById: assignedById,
  });
}

/**
 * Queue a notification when task priority changes.
 */
export async function queuePriorityNotification(params: {
  boardId: string;
  taskId: string;
  priority: string;
  changedById?: string;
}): Promise<string[]> {
  const { boardId, taskId, priority, changedById } = params;

  const recipientIds = await getTaskRecipients(taskId);

  return queueNotifications({
    boardId,
    taskId,
    recipientIds,
    type: "priority",
    triggeredById: changedById,
    metadata: { priority },
  });
}

/**
 * Queue a notification when a task's status changes.
 */
export async function queueStatusNotification(params: {
  boardId: string;
  taskId: string;
  status: string;
  changedById?: string;
}): Promise<string[]> {
  const { boardId, taskId, status, changedById } = params;

  const recipientIds = await getTaskRecipients(taskId);

  return queueNotifications({
    boardId,
    taskId,
    recipientIds,
    type: "status",
    triggeredById: changedById,
    metadata: { status },
  });
}

/**
 * Queue a notification when a document is attached to a task.
 *
 * Documents that hang off no task are skipped by the callers: a notification
 * row must name a task, and a loose document has no roster to address.
 */
export async function queueDocNotification(params: {
  boardId: string;
  taskId: string;
  docId: string;
  docTitle: string;
  createdById?: string;
}): Promise<string[]> {
  const { boardId, taskId, docId, docTitle, createdById } = params;

  const recipientIds = await getTaskRecipients(taskId);

  return queueNotifications({
    boardId,
    taskId,
    recipientIds,
    type: "doc",
    triggeredById: createdById,
    metadata: { docId, docTitle },
  });
}

/**
 * Extract all mention IDs from Tiptap JSON content.
 * Walks the content tree and collects IDs from mention nodes.
 */
export function extractMentionIds(content: string): string[] {
  try {
    const parsed = JSON.parse(content);
    const mentionIds: string[] = [];

    function walkNodes(nodes: unknown[] | undefined) {
      if (!nodes || !Array.isArray(nodes)) return;

      for (const node of nodes) {
        if (typeof node !== "object" || node === null) continue;

        const n = node as { type?: string; attrs?: { id?: string }; content?: unknown[] };

        // Mention nodes have type "mention" and attrs.id
        if (n.type === "mention" && n.attrs?.id) {
          mentionIds.push(n.attrs.id);
        }

        // Recursively walk child nodes
        if (n.content) {
          walkNodes(n.content);
        }
      }
    }

    walkNodes(parsed.content);
    return mentionIds;
  } catch {
    // If content is not valid JSON, return empty array
    return [];
  }
}

/**
 * Extract text from Tiptap JSON nodes, handling mentions specially.
 */
function extractTextFromNodes(nodes: unknown[]): string {
  let text = "";
  for (const node of nodes) {
    if (typeof node !== "object" || node === null) continue;
    const n = node as {
      type?: string;
      text?: string;
      attrs?: { label?: string };
      content?: unknown[];
    };

    // For mention nodes, include "@name" format
    if (n.type === "mention" && n.attrs?.label) {
      text += `@${n.attrs.label}`;
      continue;
    }

    if (n.text) {
      text += n.text;
    }
    if (n.content && Array.isArray(n.content)) {
      text += extractTextFromNodes(n.content);
    }
  }
  return text;
}

/**
 * Extract comment preview text from Tiptap JSON content.
 * Skips mention node labels to avoid duplication.
 */
function extractCommentPreview(content: string, maxLength = 100): string {
  try {
    const parsed = JSON.parse(content);

    if (parsed.content) {
      return extractTextFromNodes(parsed.content).slice(0, maxLength);
    }
    return "";
  } catch {
    return content.slice(0, maxLength);
  }
}

/**
 * Queue notifications for @mentioned contributors.
 * Mentioned contributors receive notifications regardless of assignee/stakeholder status.
 */
export async function queueMentionNotifications(params: {
  boardId: string;
  taskId: string;
  mentionedIds: string[];
  authorId: string;
  commentContent: string;
}): Promise<string[]> {
  const { boardId, taskId, mentionedIds, authorId, commentContent } = params;

  // Deduplicate mention IDs (in case same person is mentioned multiple times)
  const uniqueMentionIds = [...new Set(mentionedIds)];

  if (uniqueMentionIds.length === 0) {
    return [];
  }

  const commentPreview = extractCommentPreview(commentContent);

  return queueNotifications({
    boardId,
    taskId,
    recipientIds: uniqueMentionIds,
    type: "mention",
    triggeredById: authorId,
    metadata: { commentPreview },
  });
}
