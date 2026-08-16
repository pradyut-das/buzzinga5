import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiUsage, aiUsageCounters, type AiCallStatus, type AiSurface } from "@/db/schema";
import { getAiLimits, LIMIT_MESSAGES, type LimitKey } from "@/lib/ai/limits";

/**
 * The AI usage ledger and the counters that enforce spend caps.
 *
 * Two stores, on purpose. `ai_usage` is the append-only record of what
 * happened — it answers "what did we actually spend, and on whose behalf?"
 * after something has gone wrong. `ai_usage_counters` is the running total a
 * limit check reads before every call; aggregating the ledger for that would
 * get slower exactly as usage grows.
 *
 * Recording must never take down a working feature: a failed write here is
 * logged and swallowed, because losing one row of accounting is a smaller
 * harm than refusing a request the user is entitled to make.
 */

const MINUTE_SECONDS = 60;
const DAY_SECONDS = 86_400;

function bucketStart(at: Date, window: "minute" | "day"): number {
  const seconds = Math.floor(at.getTime() / 1000);
  const size = window === "minute" ? MINUTE_SECONDS : DAY_SECONDS;
  return Math.floor(seconds / size) * size;
}

export interface UsageSubject {
  userId: string | null;
  userEmail: string | null;
  /** Admins are exempt from the per-user caps; the global caps still bind them. */
  isAdmin: boolean;
}

interface CounterRow {
  calls: number;
  totalTokens: number;
  costMicroUsd: number;
}

const EMPTY: CounterRow = { calls: 0, totalTokens: 0, costMicroUsd: 0 };

async function readCounter(
  subject: string,
  window: "minute" | "day",
  at: Date,
): Promise<CounterRow> {
  const row = await db.query.aiUsageCounters.findFirst({
    where: and(
      eq(aiUsageCounters.subject, subject),
      eq(aiUsageCounters.window, window),
      eq(aiUsageCounters.bucketStart, bucketStart(at, window)),
    ),
    columns: { calls: true, totalTokens: true, costMicroUsd: true },
  });
  return row ?? EMPTY;
}

export interface LimitDecision {
  allowed: boolean;
  limit?: LimitKey;
  message?: string;
}

/**
 * Checks every cap that applies to this caller before a model call runs.
 *
 * The check is deliberately pre-flight and approximate: the cost of the call
 * about to be made is unknown until it returns, so a caller sitting just under
 * a cap is allowed through and the overshoot lands in the next check. Caps
 * bound total spend within one call's worth, which is what a budget needs.
 *
 * Fails closed. If the counter read itself fails the call is refused, because
 * a database that cannot answer "how much have we spent?" is precisely when an
 * unbounded spend is most dangerous.
 */
export async function checkAiLimits(
  subject: UsageSubject,
  at = new Date(),
): Promise<LimitDecision> {
  const limits = getAiLimits();

  try {
    const global = await readCounter("global", "day", at);
    if (global.costMicroUsd >= limits.globalCostMicroUsdPerDay) {
      return { allowed: false, limit: "global_day_usd", message: LIMIT_MESSAGES.global_day_usd };
    }
    if (global.calls >= limits.globalCallsPerDay) {
      return {
        allowed: false,
        limit: "global_day_calls",
        message: LIMIT_MESSAGES.global_day_calls,
      };
    }

    // Admins operate the console and get asked to reproduce problems, so the
    // per-user caps would get in the way of the person diagnosing them. The
    // global caps above already applied.
    if (subject.isAdmin || !subject.userId) return { allowed: true };

    const key = `user:${subject.userId}`;
    const [minute, day] = await Promise.all([
      readCounter(key, "minute", at),
      readCounter(key, "day", at),
    ]);

    if (minute.calls >= limits.userCallsPerMinute) {
      return {
        allowed: false,
        limit: "user_minute_calls",
        message: LIMIT_MESSAGES.user_minute_calls,
      };
    }
    if (day.costMicroUsd >= limits.userCostMicroUsdPerDay) {
      return { allowed: false, limit: "user_day_usd", message: LIMIT_MESSAGES.user_day_usd };
    }
    if (day.totalTokens >= limits.userTokensPerDay) {
      return { allowed: false, limit: "user_day_tokens", message: LIMIT_MESSAGES.user_day_tokens };
    }
    if (day.calls >= limits.userCallsPerDay) {
      return { allowed: false, limit: "user_day_calls", message: LIMIT_MESSAGES.user_day_calls };
    }

    return { allowed: true };
  } catch (error) {
    console.error("[ai] limit check failed, refusing the call:", error);
    return {
      allowed: false,
      limit: "global_day_usd",
      message: "The assistant is unavailable right now. Try again shortly.",
    };
  }
}

export interface UsageRecord {
  subject: UsageSubject;
  surface: AiSurface;
  operation: string;
  model: string;
  status: AiCallStatus;
  promptTokens?: number;
  outputTokens?: number;
  thoughtTokens?: number;
  cachedTokens?: number;
  totalTokens?: number;
  costMicroUsd?: number;
  estimated?: boolean;
  durationMs?: number;
  errorMessage?: string;
  blockedBy?: LimitKey;
  detail?: Record<string, unknown>;
}

async function bumpCounter(
  subject: string,
  window: "minute" | "day",
  at: Date,
  tokens: number,
  cost: number,
): Promise<void> {
  const start = bucketStart(at, window);
  // Upsert rather than read-modify-write: two concurrent calls from the same
  // user must both count, and a lost update here is a cap that silently
  // permits more spend than it claims to.
  await db
    .insert(aiUsageCounters)
    .values({
      subject,
      window,
      bucketStart: start,
      calls: 1,
      totalTokens: tokens,
      costMicroUsd: cost,
      updatedAt: at,
    })
    .onConflictDoUpdate({
      target: [aiUsageCounters.subject, aiUsageCounters.window, aiUsageCounters.bucketStart],
      set: {
        calls: sql`${aiUsageCounters.calls} + 1`,
        totalTokens: sql`${aiUsageCounters.totalTokens} + ${tokens}`,
        costMicroUsd: sql`${aiUsageCounters.costMicroUsd} + ${cost}`,
        updatedAt: at,
      },
    });
}

/**
 * Writes one ledger row and advances the counters it affects.
 *
 * Blocked calls are recorded but do not advance the counters: they spent
 * nothing, and counting them would let a client that keeps retrying a refused
 * request push a limit further out.
 */
export async function recordAiUsage(record: UsageRecord): Promise<void> {
  const at = new Date();
  const tokens =
    record.totalTokens ??
    (record.promptTokens ?? 0) + (record.outputTokens ?? 0) + (record.thoughtTokens ?? 0);
  const cost = record.costMicroUsd ?? 0;

  try {
    await db.insert(aiUsage).values({
      id: crypto.randomUUID(),
      createdAt: at,
      userId: record.subject.userId,
      userEmail: record.subject.userEmail,
      surface: record.surface,
      operation: record.operation,
      model: record.model,
      status: record.status,
      promptTokens: record.promptTokens ?? 0,
      outputTokens: record.outputTokens ?? 0,
      thoughtTokens: record.thoughtTokens ?? 0,
      cachedTokens: record.cachedTokens ?? 0,
      totalTokens: tokens,
      costMicroUsd: cost,
      estimated: record.estimated ?? false,
      durationMs: record.durationMs ?? 0,
      errorMessage: record.errorMessage?.slice(0, 500) ?? null,
      blockedBy: record.blockedBy ?? null,
      detail: record.detail ? JSON.stringify(record.detail) : null,
    });

    if (record.status === "blocked") return;

    await bumpCounter("global", "day", at, tokens, cost);
    if (record.subject.userId) {
      const key = `user:${record.subject.userId}`;
      await Promise.all([
        bumpCounter(key, "minute", at, tokens, cost),
        bumpCounter(key, "day", at, tokens, cost),
      ]);
    }
  } catch (error) {
    // Never let accounting break a working feature.
    console.error("[ai] failed to record usage:", error);
  }
}

/** Deletes counter buckets older than a day. The ledger itself is never pruned. */
export async function pruneAiCounters(before = new Date()): Promise<void> {
  const cutoff = Math.floor(before.getTime() / 1000) - 2 * DAY_SECONDS;
  try {
    await db.delete(aiUsageCounters).where(lt(aiUsageCounters.bucketStart, cutoff));
  } catch (error) {
    console.error("[ai] failed to prune counters:", error);
  }
}
