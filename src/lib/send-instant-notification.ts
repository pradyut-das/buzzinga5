import {
  deliverNotifications,
  loadNotificationsForInstantSend,
} from "@/lib/process-board-notifications";

/**
 * Immediate delivery for the events people wait on.
 *
 * Being given work and being named in a comment are the two things worth
 * interrupting an inbox for; everything else rides the half-hourly digest, so a
 * task edited five times still costs one email rather than five.
 */

/** Reads better in an inbox than the digest's board-wide subject. */
function instantSubject(items: Array<{ type: string; task: { title: string } }>): string {
  const [first] = items;
  if (!first) return "Task update";

  const title = first.task.title;
  if (items.length > 1) return `${items.length} updates on "${title}"`;

  switch (first.type) {
    case "assign":
      return `You were assigned "${title}"`;
    case "mention":
      return `You were mentioned on "${title}"`;
    default:
      return `Update on "${title}"`;
  }
}

/**
 * Sends the given queued rows now instead of waiting for the sweep.
 *
 * Never throws. A mutation's job is to record the change; failing to announce
 * it must not fail the write the user asked for. Rows are only cleared once
 * their email is away, so anything that fails here is picked up by the next
 * cron sweep — the failure costs latency, not the notification.
 */
export async function sendInstantNotifications(
  boardId: string,
  notificationIds: string[],
): Promise<void> {
  if (notificationIds.length === 0) return;

  try {
    const notifications = await loadNotificationsForInstantSend(boardId, notificationIds);
    await deliverNotifications(notifications, { subject: instantSubject });
  } catch (error) {
    console.error("Instant notification delivery failed; leaving rows for the cron sweep:", error);
  }
}
