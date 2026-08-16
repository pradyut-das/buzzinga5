import { and, desc, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiUsage } from "@/db/schema";
import { getAiLimits, type AiLimits } from "@/lib/ai/limits";

/**
 * Read models for the AI usage report.
 *
 * Everything is derived from `ai_usage` rather than the counters: the counters
 * exist to make a limit check fast and are pruned, while the ledger is the
 * permanent record a report has to agree with.
 */

export interface AiUsageTotals {
  calls: number;
  errors: number;
  blocked: number;
  totalTokens: number;
  costMicroUsd: number;
  estimatedCostMicroUsd: number;
}

export interface AiUsageByDay {
  day: string;
  calls: number;
  totalTokens: number;
  costMicroUsd: number;
}

export interface AiUsageByGroup {
  key: string;
  calls: number;
  errors: number;
  totalTokens: number;
  costMicroUsd: number;
}

export interface AiUsageEntry {
  id: string;
  createdAt: Date;
  userEmail: string | null;
  surface: string;
  operation: string;
  model: string;
  status: string;
  totalTokens: number;
  costMicroUsd: number;
  estimated: boolean;
  durationMs: number;
  errorMessage: string | null;
  blockedBy: string | null;
}

export interface AiUsageReport {
  since: Date;
  days: number;
  limits: AiLimits;
  totals: AiUsageTotals;
  byDay: AiUsageByDay[];
  bySurface: AiUsageByGroup[];
  byUser: AiUsageByGroup[];
  byModel: AiUsageByGroup[];
  /** Most recent calls, newest first. The audit trail when something looks wrong. */
  recent: AiUsageEntry[];
  /** Errors and refusals only, so an incident is visible without filtering. */
  problems: AiUsageEntry[];
  today: { costMicroUsd: number; calls: number };
}

const CALLS = sql<number>`count(*)`;
const TOKENS = sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)`;
const COST = sql<number>`coalesce(sum(${aiUsage.costMicroUsd}), 0)`;
const ERRORS = sql<number>`coalesce(sum(case when ${aiUsage.status} = 'error' then 1 else 0 end), 0)`;

function startOfUtcDay(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

/** Trims a ledger row to what the report shows; `detail` stays server-side. */
function toEntry(row: typeof aiUsage.$inferSelect): AiUsageEntry {
  return {
    id: row.id,
    createdAt: row.createdAt,
    userEmail: row.userEmail,
    surface: row.surface,
    operation: row.operation,
    model: row.model,
    status: row.status,
    totalTokens: row.totalTokens,
    costMicroUsd: row.costMicroUsd,
    estimated: row.estimated,
    durationMs: row.durationMs,
    errorMessage: row.errorMessage,
    blockedBy: row.blockedBy,
  };
}

export async function getAiUsageReport(days = 30): Promise<AiUsageReport> {
  const now = new Date();
  const since = new Date(now.getTime() - days * 86_400_000);
  const window = gte(aiUsage.createdAt, since);

  // `created_at` is a unix-seconds integer, so the day bucket is computed in
  // SQL rather than pulling every row into memory to group it.
  const dayKey = sql<string>`strftime('%Y-%m-%d', ${aiUsage.createdAt}, 'unixepoch')`;

  const [totalsRow, byDay, bySurface, byUser, byModel, recent, problems, todayRow] =
    await Promise.all([
      db
        .select({
          calls: CALLS,
          errors: ERRORS,
          blocked: sql<number>`coalesce(sum(case when ${aiUsage.status} = 'blocked' then 1 else 0 end), 0)`,
          totalTokens: TOKENS,
          costMicroUsd: COST,
          estimatedCostMicroUsd: sql<number>`coalesce(sum(case when ${aiUsage.estimated} then ${aiUsage.costMicroUsd} else 0 end), 0)`,
        })
        .from(aiUsage)
        .where(window),

      db
        .select({ day: dayKey, calls: CALLS, totalTokens: TOKENS, costMicroUsd: COST })
        .from(aiUsage)
        .where(window)
        .groupBy(dayKey)
        .orderBy(dayKey),

      db
        .select({
          key: aiUsage.surface,
          calls: CALLS,
          errors: ERRORS,
          totalTokens: TOKENS,
          costMicroUsd: COST,
        })
        .from(aiUsage)
        .where(window)
        .groupBy(aiUsage.surface)
        .orderBy(desc(COST)),

      db
        .select({
          key: sql<string>`coalesce(${aiUsage.userEmail}, 'system')`,
          calls: CALLS,
          errors: ERRORS,
          totalTokens: TOKENS,
          costMicroUsd: COST,
        })
        .from(aiUsage)
        .where(window)
        .groupBy(sql`coalesce(${aiUsage.userEmail}, 'system')`)
        .orderBy(desc(COST))
        .limit(50),

      db
        .select({
          key: aiUsage.model,
          calls: CALLS,
          errors: ERRORS,
          totalTokens: TOKENS,
          costMicroUsd: COST,
        })
        .from(aiUsage)
        .where(window)
        .groupBy(aiUsage.model)
        .orderBy(desc(COST)),

      db.select().from(aiUsage).where(window).orderBy(desc(aiUsage.createdAt)).limit(100),

      db
        .select()
        .from(aiUsage)
        .where(and(window, sql`${aiUsage.status} in ('error', 'blocked')`))
        .orderBy(desc(aiUsage.createdAt))
        .limit(50),

      db
        .select({ calls: CALLS, costMicroUsd: COST })
        .from(aiUsage)
        .where(gte(aiUsage.createdAt, startOfUtcDay(now))),
    ]);

  return {
    since,
    days,
    limits: getAiLimits(),
    totals: totalsRow[0] ?? {
      calls: 0,
      errors: 0,
      blocked: 0,
      totalTokens: 0,
      costMicroUsd: 0,
      estimatedCostMicroUsd: 0,
    },
    byDay,
    bySurface,
    byUser,
    byModel,
    recent: recent.map(toEntry),
    problems: problems.map(toEntry),
    today: todayRow[0] ?? { calls: 0, costMicroUsd: 0 },
  };
}
