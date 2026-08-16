/**
 * Model prices, in micro-USD per token.
 *
 * Prices are published per million tokens, so the per-token figure is that
 * number exactly: $0.30 per million input tokens is 0.30 micro-USD per token.
 * Keeping the unit as micro-USD lets every cost stay an integer end to end —
 * a month of floating-point accumulation would not tie out against a bill.
 *
 * These are list prices at the time of writing and drift with the provider's
 * pricing page. They exist to make spend visible and to enforce budgets, not
 * to reproduce an invoice; `ai_usage.total_tokens` is the measured quantity
 * and survives any repricing here.
 */

export interface ModelPrice {
  /** Micro-USD per input token. */
  input: number;
  /** Micro-USD per output token (thinking tokens bill at the output rate). */
  output: number;
  /** Micro-USD per cached input token, when the model supports context caching. */
  cachedInput?: number;
}

/** Matched by longest prefix, so dated model ids inherit their family's price. */
const PRICES: Record<string, ModelPrice> = {
  "gemini-2.5-flash-native-audio": { input: 3.0, output: 12.0 },
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4, cachedInput: 0.025 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5, cachedInput: 0.075 },
  "gemini-2.5-pro": { input: 1.25, output: 10.0, cachedInput: 0.31 },
  "gemini-embedding": { input: 0.15, output: 0 },
};

/** Charged when a model id matches nothing above, so an unknown model is never free. */
const FALLBACK_PRICE: ModelPrice = { input: 1.25, output: 10.0 };

export function priceFor(model: string): ModelPrice {
  const id = model.toLowerCase();
  let best: { key: string; price: ModelPrice } | null = null;
  for (const [key, price] of Object.entries(PRICES)) {
    if (id.startsWith(key) && (!best || key.length > best.key.length)) best = { key, price };
  }
  return best?.price ?? FALLBACK_PRICE;
}

export interface TokenCounts {
  promptTokens: number;
  outputTokens: number;
  thoughtTokens: number;
  cachedTokens: number;
}

/**
 * Cost of one call in whole micro-USD.
 *
 * Cached tokens are reported by Gemini as a subset of the prompt count, so they
 * are billed at the cheaper cached rate and removed from the uncached
 * remainder rather than added on top. Thinking tokens bill at the output rate.
 */
export function costMicroUsd(model: string, counts: TokenCounts): number {
  const price = priceFor(model);
  const cached = Math.min(counts.cachedTokens, counts.promptTokens);
  const uncachedPrompt = counts.promptTokens - cached;
  const total =
    uncachedPrompt * price.input +
    cached * (price.cachedInput ?? price.input) +
    (counts.outputTokens + counts.thoughtTokens) * price.output;
  return Math.round(total);
}

/**
 * Refunds make costs negative, so the sign is formatted separately from the
 * magnitude: a settlement row reads "-$1.50", not "$-1.5000".
 */
export function formatUsd(microUsd: number): string {
  const usd = Math.abs(microUsd) / 1_000_000;
  const sign = microUsd < 0 ? "-" : "";
  if (usd === 0) return "$0.00";
  // Sub-cent amounts get four places, because rounding a real cost to $0.00
  // would read as free.
  if (usd < 0.01) return `${sign}$${usd.toFixed(4)}`;
  return `${sign}$${usd.toFixed(2)}`;
}
