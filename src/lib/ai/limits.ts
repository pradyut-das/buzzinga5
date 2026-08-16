import { env } from "@/lib/validate-env";

/**
 * Spend caps (see ADR global__ai-usage-metering).
 *
 * Every cap is a plain env number so it can be tightened without a code
 * change. Defaults are deliberately generous enough for normal desk use and
 * tight enough that a runaway loop or a leaked key costs dollars, not
 * thousands: the point of the ceiling is that it is always there, not that it
 * is precisely tuned.
 *
 * Per-user caps do not apply to admins — they operate the console and get
 * asked to reproduce problems. The global caps apply to everyone, admins
 * included, because they are the last line between a bug and the bill.
 */

export interface AiLimits {
  userCallsPerMinute: number;
  userCallsPerDay: number;
  userTokensPerDay: number;
  userCostMicroUsdPerDay: number;
  globalCostMicroUsdPerDay: number;
  globalCallsPerDay: number;
}

function num(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  // A typo in an env var must not silently disable a cap.
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function usdToMicro(value: string | undefined, fallbackUsd: number): number {
  return Math.round(num(value, fallbackUsd) * 1_000_000);
}

export function getAiLimits(): AiLimits {
  return {
    userCallsPerMinute: num(env.AI_USER_CALLS_PER_MINUTE, 30),
    userCallsPerDay: num(env.AI_USER_CALLS_PER_DAY, 1_000),
    userTokensPerDay: num(env.AI_USER_TOKENS_PER_DAY, 2_000_000),
    userCostMicroUsdPerDay: usdToMicro(env.AI_USER_USD_PER_DAY, 5),
    globalCostMicroUsdPerDay: usdToMicro(env.AI_GLOBAL_USD_PER_DAY, 50),
    globalCallsPerDay: num(env.AI_GLOBAL_CALLS_PER_DAY, 20_000),
  };
}

/** Identifies which cap refused a call; stored in `ai_usage.blocked_by`. */
export type LimitKey =
  | "user_minute_calls"
  | "user_day_calls"
  | "user_day_tokens"
  | "user_day_usd"
  | "global_day_calls"
  | "global_day_usd";

/** Wording shown to the person who hit the cap. Never leaks the global budget. */
export const LIMIT_MESSAGES: Record<LimitKey, string> = {
  user_minute_calls: "You are asking faster than the assistant can keep up. Try again in a minute.",
  user_day_calls:
    "You have reached today's limit for assistant requests. It resets at midnight UTC.",
  user_day_tokens: "You have reached today's limit for assistant usage. It resets at midnight UTC.",
  user_day_usd: "You have reached today's limit for assistant usage. It resets at midnight UTC.",
  global_day_calls:
    "The assistant has reached its daily limit for everyone. It resets at midnight UTC.",
  global_day_usd:
    "The assistant has reached its daily limit for everyone. It resets at midnight UTC.",
};
