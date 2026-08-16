import { and, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { emailSendCounters } from "@/db/schema";
import { env } from "@/lib/validate-env";

/**
 * Caps on how much notification email one person can be sent.
 *
 * A busy board can generate updates far faster than anyone wants to read about
 * them, and instant delivery removes the half-hourly batching that used to hold
 * the volume down on its own. These caps are the backstop: past the limit, the
 * queued rows are simply left in place, so the events are not lost — they fold
 * into the next digest the recipient is eligible for.
 */

const HOUR_SECONDS = 3600;
const DAY_SECONDS = 86_400;

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  // A typo in the env must not silently disable a cap.
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function getEmailLimits(): { perHour: number; perDay: number } {
  return {
    perHour: num(env.EMAIL_MAX_PER_HOUR, 6),
    perDay: num(env.EMAIL_MAX_PER_DAY, 30),
  };
}

function bucketStart(at: Date, windowSeconds: number): number {
  const seconds = Math.floor(at.getTime() / 1000);
  return seconds - (seconds % windowSeconds);
}

function subjectFor(contributorId: string): string {
  return `contributor:${contributorId}`;
}

/**
 * Splits recipients into those still under their caps and those over.
 *
 * Checked in one read for the whole batch rather than per person, because a
 * board-wide sweep addresses many recipients at once.
 *
 * Fails open: if the counters cannot be read, mail goes out. A missed
 * notification is worse than an extra one, and the caps exist to smooth volume,
 * not to enforce anything security-critical.
 */
export async function partitionByEmailQuota(
  contributorIds: string[],
  now = new Date(),
): Promise<{ allowed: Set<string>; limited: Set<string> }> {
  const allowed = new Set(contributorIds);
  const limited = new Set<string>();

  if (contributorIds.length === 0) return { allowed, limited };

  const limits = getEmailLimits();
  const hourBucket = bucketStart(now, HOUR_SECONDS);
  const dayBucket = bucketStart(now, DAY_SECONDS);
  const subjects = contributorIds.map(subjectFor);

  try {
    const rows = await db
      .select()
      .from(emailSendCounters)
      .where(
        and(
          inArray(emailSendCounters.subject, subjects),
          inArray(emailSendCounters.bucketStart, [hourBucket, dayBucket]),
        ),
      );

    for (const row of rows) {
      const cap = row.window === "hour" ? limits.perHour : limits.perDay;
      const bucket = row.window === "hour" ? hourBucket : dayBucket;
      // Rows from an older bucket of the same length have already expired.
      if (row.bucketStart !== bucket || row.emails < cap) continue;

      const contributorId = row.subject.slice("contributor:".length);
      allowed.delete(contributorId);
      limited.add(contributorId);
    }
  } catch (error) {
    console.error("Email quota check failed; allowing the send:", error);
  }

  return { allowed, limited };
}

/**
 * Records that one email went to each of these people.
 *
 * Upsert-with-increment so two sends racing on the same bucket cannot lose a
 * count the way a read-modify-write would.
 */
export async function recordEmailsSent(contributorIds: string[], now = new Date()): Promise<void> {
  if (contributorIds.length === 0) return;

  const windows: Array<{ window: string; bucketStart: number }> = [
    { window: "hour", bucketStart: bucketStart(now, HOUR_SECONDS) },
    { window: "day", bucketStart: bucketStart(now, DAY_SECONDS) },
  ];

  try {
    for (const contributorId of contributorIds) {
      for (const { window, bucketStart: start } of windows) {
        await db
          .insert(emailSendCounters)
          .values({
            subject: subjectFor(contributorId),
            window,
            bucketStart: start,
            emails: 1,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [
              emailSendCounters.subject,
              emailSendCounters.window,
              emailSendCounters.bucketStart,
            ],
            set: {
              emails: sql`${emailSendCounters.emails} + 1`,
              updatedAt: now,
            },
          });
      }
    }
  } catch (error) {
    // Losing a count is not worth failing a send that already happened.
    console.error("Failed to record email send counters:", error);
  }
}

/** Drops spent buckets. Called from the same cron sweep that sends the digests. */
export async function pruneEmailCounters(before = new Date()): Promise<void> {
  const cutoff = Math.floor(before.getTime() / 1000) - 2 * DAY_SECONDS;
  try {
    await db.delete(emailSendCounters).where(lt(emailSendCounters.bucketStart, cutoff));
  } catch (error) {
    console.error("Failed to prune email counters:", error);
  }
}
