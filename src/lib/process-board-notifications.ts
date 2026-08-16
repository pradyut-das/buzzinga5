import { db } from "@/db";
import { contributors, pendingNotifications, sentEmails } from "@/db/schema";
import { eq, inArray, and, type SQL } from "drizzle-orm";
import { render } from "@react-email/render";
import { TaskDigestEmail, type NotificationItem } from "@/emails/task-digest";
import { Resend } from "resend";
import { env } from "@/lib/validate-env";
import { partitionByEmailQuota, recordEmailsSent } from "@/lib/email-rate-limit";

// Initialize Resend client if API key is present
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

// Production domain for email links
const PRODUCTION_DOMAIN = "https://squirrl.itsdesignare.com";

/**
 * Determine base URL for email links.
 * Uses the production domain for Vercel production, VERCEL_URL for preview deployments,
 * and localhost for local development.
 */
export function getBaseUrl(): string {
  if (env.VERCEL_ENV === "production") return PRODUCTION_DOMAIN;
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return "http://localhost:5800";
}

// Hardcoded "from" email address for notifications. The domain must be
// verified in Resend or every send is rejected.
const FROM_EMAIL = "noreply@squirrl.itsdesignare.com";

export interface ProcessBoardNotificationsResult {
  processed: number;
  sentToResend: number;
  failed: number;
  skippedNoEmail: number;
  /** Recipients held back by their hourly or daily cap; their rows stay queued. */
  rateLimited: number;
  errors: Array<{ recipientId: string; error: string }>;
}

/** The relations an email needs off a queued row. */
const NOTIFICATION_RELATIONS = {
  recipient: true,
  triggeredBy: true,
  task: true,
  board: true,
} as const;

function loadNotifications(where: SQL | undefined) {
  return db.query.pendingNotifications.findMany({ where, with: NOTIFICATION_RELATIONS });
}

/** A pending row with the relations the email needs. */
type LoadedNotification = Awaited<ReturnType<typeof loadNotifications>>[number];

/**
 * Mints an unsubscribe token for anyone about to be emailed who lacks one.
 *
 * Done at send time rather than in the migration so the column fills in as
 * people are actually written to, and rows created since keep working without
 * a second backfill.
 */
async function ensureUnsubscribeTokens(
  recipients: Array<{ id: string; unsubscribeToken: string | null }>,
): Promise<Map<string, string>> {
  const tokens = new Map<string, string>();

  for (const recipient of recipients) {
    if (recipient.unsubscribeToken) {
      tokens.set(recipient.id, recipient.unsubscribeToken);
      continue;
    }
    const token = crypto.randomUUID();
    await db
      .update(contributors)
      .set({ unsubscribeToken: token })
      .where(eq(contributors.id, recipient.id));
    tokens.set(recipient.id, token);
  }

  return tokens;
}

/**
 * Renders, records and sends one email per recipient, then clears the rows it
 * delivered.
 *
 * The single delivery path for both the batched cron sweep and the instant
 * sends, so `sent_emails` logging, the unsubscribe skip and error isolation
 * cannot drift apart between them.
 *
 * Rows are deleted only once their email is away. A failure therefore leaves
 * them queued, and the next cron sweep retries them — that is the retry
 * mechanism, not an oversight.
 */
export async function deliverNotifications(
  notifications: LoadedNotification[],
  options: { subject?: (items: LoadedNotification[]) => string } = {},
): Promise<ProcessBoardNotificationsResult> {
  if (notifications.length === 0) {
    return {
      processed: 0,
      sentToResend: 0,
      failed: 0,
      skippedNoEmail: 0,
      rateLimited: 0,
      errors: [],
    };
  }

  const baseUrl = getBaseUrl();

  // Group notifications by recipient
  const notificationsByRecipient = new Map<
    string,
    {
      recipient: LoadedNotification["recipient"];
      board: LoadedNotification["board"];
      items: LoadedNotification[];
    }
  >();

  // Someone with no email on file, or who has opted out, is not written to.
  const undeliverable = notifications.filter(
    (n) => !n.recipient.email || n.recipient.unsubscribedAt,
  );
  const undeliverableIds = new Set(undeliverable.map((n) => n.id));

  for (const notification of notifications) {
    if (undeliverableIds.has(notification.id)) continue;

    const recipientId = notification.recipientId;
    if (!notificationsByRecipient.has(recipientId)) {
      notificationsByRecipient.set(recipientId, {
        recipient: notification.recipient,
        board: notification.board,
        items: [],
      });
    }

    notificationsByRecipient.get(recipientId)!.items.push(notification);
  }

  // Hold back anyone already at their hourly or daily cap. Their rows are left
  // queued rather than dropped, so the events fold into the next digest they
  // are eligible for instead of vanishing.
  const { limited } = await partitionByEmailQuota(Array.from(notificationsByRecipient.keys()));
  for (const recipientId of limited) {
    notificationsByRecipient.delete(recipientId);
  }

  const unsubscribeTokens = await ensureUnsubscribeTokens(
    Array.from(notificationsByRecipient.values()).map((d) => d.recipient),
  );

  // Track results
  const processedNotificationIds: string[] = [];
  const delivered: string[] = [];
  const errors: Array<{ recipientId: string; error: string }> = [];
  let processed = 0;
  let sentToResend = 0;
  let failed = 0;

  // Process emails for each recipient
  for (const [recipientId, data] of notificationsByRecipient) {
    const { recipient, board, items } = data;

    // Build notification items for email template
    const emailNotifications: NotificationItem[] = items.map((n) => {
      let metadata: NotificationItem["metadata"];
      if (n.metadata) {
        try {
          metadata = JSON.parse(n.metadata);
        } catch {
          metadata = undefined;
        }
      }

      return {
        id: n.id,
        type: n.type,
        taskId: n.taskId,
        taskTitle: n.task.title,
        triggeredByName: n.triggeredBy?.name,
        metadata,
        createdAt: n.createdAt ?? new Date(),
      };
    });

    const boardUrl = `${baseUrl}/boards/${board.id}`;
    const subject = options.subject?.(items) ?? `Task updates on ${board.title}`;
    const unsubscribeUrl = `${baseUrl}/api/unsubscribe?token=${unsubscribeTokens.get(recipientId)}`;

    try {
      // Render email to HTML
      const htmlContent = await render(
        TaskDigestEmail({
          recipientName: recipient.name,
          boardTitle: board.title,
          boardUrl,
          unsubscribeUrl,
          notifications: emailNotifications,
        }),
      );

      // Determine if we'll send via Resend
      const willSendToResend = Boolean(resend);

      // Save to sent_emails table
      await db.insert(sentEmails).values({
        id: crypto.randomUUID(),
        fromEmail: FROM_EMAIL,
        recipientEmail: recipient.email!,
        recipientName: recipient.name,
        subject,
        boardId: board.id,
        boardTitle: board.title,
        htmlContent,
        notificationIds: JSON.stringify(items.map((n) => n.id)),
        sentToResend: willSendToResend,
      });

      // Send via Resend if client is available
      if (resend) {
        await resend.emails.send({
          from: `Squirrl <${FROM_EMAIL}>`,
          to: recipient.email!,
          subject,
          html: htmlContent,
          // Lets Gmail and Outlook offer their own unsubscribe control, which
          // mailbox providers weigh when deciding whether we look like spam.
          headers: {
            "List-Unsubscribe": `<${unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        });
        sentToResend++;
      }

      processed++;
      delivered.push(recipientId);
      processedNotificationIds.push(...items.map((n) => n.id));
    } catch (error) {
      console.error(`Failed to process email for ${recipient.email}:`, error);
      failed++;
      errors.push({
        recipientId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  // Delete successfully processed notifications
  if (processedNotificationIds.length > 0) {
    await db
      .delete(pendingNotifications)
      .where(inArray(pendingNotifications.id, processedNotificationIds));
  }

  // Drop rows addressed to someone we cannot or must not write to. Keeping them
  // would requeue the same dead delivery on every sweep.
  if (undeliverableIds.size > 0) {
    await db
      .delete(pendingNotifications)
      .where(inArray(pendingNotifications.id, Array.from(undeliverableIds)));
  }

  // Counted after the fact, against what actually went out — a cap on attempts
  // would let failures eat into someone's quota.
  await recordEmailsSent(delivered);

  return {
    processed,
    sentToResend,
    failed,
    skippedNoEmail: undeliverableIds.size,
    rateLimited: limited.size,
    errors,
  };
}

/**
 * Process pending notifications for a single board.
 *
 * Drains the board's queue into one digest per recipient. Called by the cron
 * sweep and by the board's own "send now" endpoint.
 *
 * @param boardId - The board ID to process notifications for
 * @returns Detailed results of the processing
 */
export async function processBoardNotifications(
  boardId: string,
): Promise<ProcessBoardNotificationsResult> {
  const notifications = await loadNotifications(eq(pendingNotifications.boardId, boardId));

  return deliverNotifications(notifications);
}

/**
 * Loads a specific set of queued rows for immediate delivery.
 *
 * Scoped by board as well as id so a caller cannot reach outside the board it
 * is acting on.
 */
export async function loadNotificationsForInstantSend(
  boardId: string,
  notificationIds: string[],
): Promise<LoadedNotification[]> {
  if (notificationIds.length === 0) return [];

  return loadNotifications(
    and(
      eq(pendingNotifications.boardId, boardId),
      inArray(pendingNotifications.id, notificationIds),
    ),
  );
}
