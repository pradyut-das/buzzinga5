import { GoogleGenAI, Modality } from "@google/genai";
import { NextResponse } from "next/server";
import { GEMINI_LIVE_MODEL, GEMINI_LIVE_VOICE, requireGeminiKey } from "@/lib/agent/gemini";
import { buildSystemInstruction } from "@/lib/agent/prompt";
import { getAgentDirectory, getAgentScope } from "@/lib/agent/scope";
import { getDashboardStats } from "@/lib/agent/stats";
import { ALL_TOOLS } from "@/lib/agent/tools";

export const dynamic = "force-dynamic";

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

    return NextResponse.json({
      token: token.name,
      model: GEMINI_LIVE_MODEL,
      boards: directory.boards.map((board) => board.title),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start a voice session.";
    console.error("[agent] session start failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
