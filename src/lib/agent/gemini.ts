import { env } from "@/lib/validate-env";

/** Shared Gemini configuration. Both agent surfaces use the same key and voice. */
export const GEMINI_LIVE_MODEL =
  env.GEMINI_LIVE_MODEL || "gemini-2.5-flash-native-audio-preview-09-2025";
export const GEMINI_CHAT_MODEL = env.GEMINI_CHAT_MODEL || "gemini-2.5-flash";
export const GEMINI_LIVE_VOICE = env.GEMINI_LIVE_VOICE || "Zephyr";
/** Nano Banana Pro: image generation and image editing for the carousel maker. */

export function requireGeminiKey(): string {
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set, so the agent cannot start.");
  }
  return env.GEMINI_API_KEY;
}

export function geminiConfigured(): boolean {
  return Boolean(env.GEMINI_API_KEY);
}
