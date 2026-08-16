import { GoogleGenAI, Modality } from "@google/genai";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { aiVoiceSessions } from "@/db/schema";
import { GEMINI_LIVE_MODEL, GEMINI_LIVE_VOICE, requireGeminiKey } from "@/lib/agent/gemini";
import { buildSystemInstruction } from "@/lib/agent/prompt";
import { getAgentDirectory, getAgentScope } from "@/lib/agent/scope";
import { getDashboardStats } from "@/lib/agent/stats";
import { ALL_TOOLS } from "@/lib/agent/tools";
import { AiLimitError, recordEstimatedAiCost } from "@/lib/ai/meter";
import { subjectFromScope } from "@/lib/ai/subject";
import { checkAiLimits, recordAiUsage } from "@/lib/ai/usage";
import { env } from "@/lib/validate-env";

export const dynamic = "force-dynamic";

/** The token below is minted for 30 minutes, so that is what a session is charged for up front. */
const SESSION_BUDGET_MINUTES = 30;

/** Estimated Live cost per minute of audio, in USD. */
function voiceUsdPerMinute(): number {
  const parsed = Number(env.AI_VOICE_USD_PER_MINUTE);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0.05;
}

/**
 * Mints a short-lived Gemini Live token for the browser.
 *
 * The API key never reaches the client. The token locks the model, the system
 * instruction and the tool list, so a tampered client cannot widen what the
 * session is allowed to do — and every tool it calls still round-trips through
 * `/api/agent/tool`, which re-checks board membership server-side.
 */
export async function POST() {
  try {
    const scope = await getAgentScope();
    const [directory, stats] = await Promise.all([
      getAgentDirectory(scope),
      getDashboardStats(scope),
    ]);

    const subject = subjectFromScope(scope);

    // The cap is checked before the token is minted, because that is the last
    // moment this process controls: once the browser holds a Live token it
    // talks to Gemini directly and no server-side check can intervene.
    const decision = await checkAiLimits(subject);
    if (!decision.allowed) {
      await recordAiUsage({
        subject,
        surface: "voice",
        operation: "liveSession",
        model: GEMINI_LIVE_MODEL,
        status: "blocked",
        blockedBy: decision.limit,
        errorMessage: decision.message,
      });
      return NextResponse.json({ error: decision.message }, { status: 429 });
    }

    const ai = new GoogleGenAI({ apiKey: requireGeminiKey() });
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        // Long enough for a working session; Gemini closes it afterwards.
        expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
        liveConnectConstraints: {
          model: GEMINI_LIVE_MODEL,
          config: {
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_LIVE_VOICE } },
            },
            systemInstruction: buildSystemInstruction(directory, stats, "voice"),
            tools: [{ functionDeclarations: ALL_TOOLS }],
          },
        },
        // No `lockAdditionalFields`: the SDK then sends no `fieldMask`, which
        // locks every field in the constraints above. Passing `[]` makes it
        // derive a mask from those fields, and the server rejects that mask
        // ("field_mask is invalid for BidiGenerateContentSetup").
      },
    });

    if (!token.name) throw new Error("Gemini did not return a session token.");

    // Live audio is billed in the browser, so no token count ever reaches this
    // process. The session is charged up front at a configured per-minute rate
    // for the token's full lifetime and flagged as an estimate; the client
    // reports its real duration to /api/agent/voice-usage, which refunds the
    // unused remainder. Charging first means an abandoned session still counts.
    const sessionId = crypto.randomUUID();
    const chargedMicroUsd = Math.round(voiceUsdPerMinute() * 1_000_000 * SESSION_BUDGET_MINUTES);

    // The charge is recorded as a row, not just as a ledger entry, because the
    // refund arrives in a later request. /api/agent/voice-usage settles against
    // this row: without it there is nothing to prove the session was ever
    // granted, or charged, or that the caller is the one who paid for it.
    await db.insert(aiVoiceSessions).values({
      id: sessionId,
      createdAt: new Date(),
      userId: scope.userId,
      chargedMicroUsd,
    });

    await recordEstimatedAiCost({
      subject,
      surface: "voice",
      operation: "liveSession",
      model: GEMINI_LIVE_MODEL,
      costMicroUsd: chargedMicroUsd,
      detail: { phase: "granted", sessionId, budgetMinutes: SESSION_BUDGET_MINUTES },
    });

    return NextResponse.json({
      sessionId,
      token: token.name,
      model: GEMINI_LIVE_MODEL,
      boards: directory.boards.map((board) => board.title),
    });
  } catch (error) {
    if (error instanceof AiLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    const message = error instanceof Error ? error.message : "Could not start a voice session.";
    console.error("[agent] session start failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
