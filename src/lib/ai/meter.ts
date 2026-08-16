import type { GenerateContentResponse } from "@google/genai";
import type { AiSurface } from "@/db/schema";
import { costMicroUsd, type TokenCounts } from "@/lib/ai/pricing";
import { checkAiLimits, recordAiUsage, type UsageSubject } from "@/lib/ai/usage";

/**
 * The one way to call a model.
 *
 * Every Gemini request in the app runs through `meterAiCall`, so there is no
 * path that spends tokens without a ledger row and without first passing the
 * spend caps. New call sites get metering by construction rather than by
 * remembering to add it — the same reason the agent has one tool registry.
 */

/** Raised when a spend cap refuses a call. Carries the user-facing wording. */
export class AiLimitError extends Error {
  readonly limit: string;
  constructor(message: string, limit: string) {
    super(message);
    this.name = "AiLimitError";
    this.limit = limit;
  }
}

export interface MeterOptions {
  subject: UsageSubject;
  surface: AiSurface;
  operation: string;
  model: string;
  /** Extra context for the ledger row: step index, tool names, doc id. Never message content. */
  detail?: Record<string, unknown>;
  /**
   * Set when the token counts are derived rather than reported by the provider
   * (embeddings, which return no usage on the Gemini API path). The report
   * shows these apart, so a derived number is never read as a measured one.
   */
  estimated?: boolean;
}

const ZERO: TokenCounts = {
  promptTokens: 0,
  outputTokens: 0,
  thoughtTokens: 0,
  cachedTokens: 0,
};

/**
 * Reads the token counts off a Gemini response.
 *
 * `usageMetadata` is optional in the SDK's types and absent on some error and
 * streaming shapes, so a missing block yields zeros rather than throwing —
 * an unparsed response must still produce a ledger row.
 */
export function countsFromResponse(response: GenerateContentResponse): TokenCounts {
  const usage = response.usageMetadata;
  if (!usage) return ZERO;
  return {
    promptTokens: usage.promptTokenCount ?? 0,
    outputTokens: usage.candidatesTokenCount ?? 0,
    thoughtTokens: usage.thoughtsTokenCount ?? 0,
    cachedTokens: usage.cachedContentTokenCount ?? 0,
  };
}

/**
 * Runs one model call under the caps and records it.
 *
 * `extractCounts` turns whatever the call returned into token counts; it is a
 * parameter rather than a fixed shape because embeddings, `generateContent`
 * and Live sessions all report usage differently. Returning zeros is
 * acceptable — the row still records that the call happened, which is what a
 * later audit needs.
 *
 * Failures are recorded and rethrown: a call that errored after the provider
 * had already done the work still cost money, and a run of errors is exactly
 * the shape of an incident worth seeing in the report.
 */
export async function meterAiCall<T>(
  options: MeterOptions,
  run: () => Promise<T>,
  extractCounts: (result: T) => TokenCounts,
): Promise<T> {
  const decision = await checkAiLimits(options.subject);
  if (!decision.allowed) {
    await recordAiUsage({
      subject: options.subject,
      surface: options.surface,
      operation: options.operation,
      model: options.model,
      status: "blocked",
      blockedBy: decision.limit,
      errorMessage: decision.message,
      detail: options.detail,
    });
    throw new AiLimitError(
      decision.message ?? "Assistant limit reached.",
      decision.limit ?? "unknown",
    );
  }

  const startedAt = Date.now();
  try {
    const result = await run();
    const counts = extractCounts(result);
    await recordAiUsage({
      subject: options.subject,
      surface: options.surface,
      operation: options.operation,
      model: options.model,
      status: "ok",
      ...counts,
      costMicroUsd: costMicroUsd(options.model, counts),
      estimated: options.estimated ?? false,
      durationMs: Date.now() - startedAt,
      detail: options.detail,
    });
    return result;
  } catch (error) {
    if (error instanceof AiLimitError) throw error;
    const message = error instanceof Error ? error.message : "The model call failed.";
    await recordAiUsage({
      subject: options.subject,
      surface: options.surface,
      operation: options.operation,
      model: options.model,
      status: "error",
      durationMs: Date.now() - startedAt,
      errorMessage: message,
      detail: options.detail,
    });
    throw error;
  }
}

/**
 * Records spend that the server never sees the tokens for.
 *
 * Gemini Live streams audio straight to the browser, so no usage metadata
 * reaches this process. Voice is metered from wall-clock session duration at a
 * configured per-minute rate and flagged `estimated`, so the report can show
 * voice spend without ever presenting a guess as a measurement.
 */
export async function recordEstimatedAiCost(options: {
  subject: UsageSubject;
  surface: AiSurface;
  operation: string;
  model: string;
  costMicroUsd: number;
  durationMs?: number;
  detail?: Record<string, unknown>;
}): Promise<void> {
  await recordAiUsage({
    subject: options.subject,
    surface: options.surface,
    operation: options.operation,
    model: options.model,
    status: "ok",
    costMicroUsd: options.costMicroUsd,
    estimated: true,
    durationMs: options.durationMs ?? 0,
    detail: options.detail,
  });
}
