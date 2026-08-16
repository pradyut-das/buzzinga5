import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { aiVoiceSessions } from "@/db/schema";
import { GEMINI_LIVE_MODEL } from "@/lib/agent/gemini";
import { getAgentScope } from "@/lib/agent/scope";
import { subjectFromScope } from "@/lib/ai/subject";
import { checkAiLimits, recordAiUsage } from "@/lib/ai/usage";
import { env } from "@/lib/validate-env";

export const dynamic = "force-dynamic";

/** Mirrors the up-front charge in /api/agent/session. */
const SESSION_BUDGET_MINUTES = 30;

function voiceUsdPerMinute(): number {
  const parsed = Number(env.AI_VOICE_USD_PER_MINUTE);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0.05;
}

/**
 * Settles a finished voice session.
 *
 * `/api/agent/session` charges the token's whole 30-minute lifetime up front,
 * because a browser that walks away never reports anything and an uncharged
 * session would be an uncapped one. Most sessions are far shorter, so the
 * client posts its real duration here and the difference is refunded as a
 * negative ledger row.
 *
 * A refund is credit, so it is only ever issued against a stored reservation:
 * the session must exist, must belong to the caller, and must not already be
 * settled. Clamping the refund to the duration is not enough on its own —
 * without the row behind it, a client could settle sessions it never started
 * and drive the spend counters negative, which buys headroom under the very
 * caps those counters enforce.
 *
 * Within those bounds the refund is still clamped to what this session was
 * charged and floored at zero minutes, so a client that lies about its
 * duration can only ever give money back. The row is marked `estimated`,
 * because the per-minute rate remains an estimate however honest the duration.
 */
export async function POST(request: Request) {
  let body: { sessionId?: string; durationMs?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const durationMs = typeof body.durationMs === "number" ? body.durationMs : 0;
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
  if (!sessionId) return NextResponse.json({ error: "Missing session id." }, { status: 400 });

  try {
    const scope = await getAgentScope();
    const subject = subjectFromScope(scope);

    // This endpoint writes a ledger row and moves the counters, so it spends
    // budget and is capped like every other metered call. Without this a
    // client can call it without limit, which is what makes an accounting bug
    // here unbounded rather than a single row.
    const decision = await checkAiLimits(subject);
    if (!decision.allowed) {
      return NextResponse.json({ error: decision.message }, { status: 429 });
    }

    // Claim the settlement before refunding anything. The conditional update
    // is the lock: two concurrent posts for the same session both reach here,
    // but only the one that flips `settledAt` from null gets a row back, so a
    // replay can never be paid twice.
    const settledAt = new Date();
    const [reservation] = await db
      .update(aiVoiceSessions)
      .set({ settledAt })
      .where(
        and(
          eq(aiVoiceSessions.id, sessionId),
          eq(aiVoiceSessions.userId, scope.userId),
          isNull(aiVoiceSessions.settledAt),
        ),
      )
      .returning({ chargedMicroUsd: aiVoiceSessions.chargedMicroUsd });

    // Unknown id, someone else's session, or one already settled. All three
    // are the same answer on purpose: a caller probing for real session ids
    // learns nothing from the response.
    if (!reservation) {
      return NextResponse.json({ error: "No session to settle." }, { status: 400 });
    }

    const usedMinutes = Math.min(SESSION_BUDGET_MINUTES, Math.max(0, durationMs) / 60_000);
    const unusedMinutes = SESSION_BUDGET_MINUTES - usedMinutes;
    // Never give back more than this session actually paid, whatever the rate
    // is configured to now.
    const refundMicroUsd = Math.min(
      reservation.chargedMicroUsd,
      Math.max(0, Math.round(voiceUsdPerMinute() * 1_000_000 * unusedMinutes)),
    );
    if (refundMicroUsd <= 0) return NextResponse.json({ ok: true, refundMicroUsd: 0 });

    await recordAiUsage({
      subject,
      surface: "voice",
      operation: "liveSessionSettled",
      model: GEMINI_LIVE_MODEL,
      status: "ok",
      // Negative: this row corrects the up-front charge rather than replacing
      // it, so the ledger keeps both the reservation and the settlement.
      costMicroUsd: -refundMicroUsd,
      estimated: true,
      durationMs: Math.max(0, durationMs),
      detail: { phase: "settled", sessionId, usedMinutes: Number(usedMinutes.toFixed(2)) },
    });

    return NextResponse.json({ ok: true, refundMicroUsd });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not settle the session.";
    const unauthorized = /not signed in/i.test(message);
    return NextResponse.json({ error: message }, { status: unauthorized ? 401 : 500 });
  }
}
