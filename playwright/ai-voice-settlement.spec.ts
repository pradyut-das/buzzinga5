import { test, expect, type APIResponse } from "@playwright/test";
import { signUpTestUser } from "./utils/playwright";

/** Micro-USD a settlement gave back, or 0 when the call was refused. */
async function refundedMicroUsd(response: APIResponse): Promise<number> {
  if (response.status() !== 200) return 0;
  return (await response.json()).refundMicroUsd ?? 0;
}

/**
 * Settlement of voice sessions at /api/agent/voice-usage.
 *
 * The route writes a negative ledger row to refund the up-front charge made by
 * /api/agent/session. ADR global__ai-usage-metering states the safety property
 * it relies on: "the refund is clamped to what was charged, so a client that
 * lies about its duration can only ever give money back". That holds only if
 * the session being settled was really charged for. These tests settle sessions
 * that were never granted, which is the case the clamp does not cover.
 *
 * Assertions stay on this account's own responses rather than on the global
 * counters, because those are shared state and the suite runs fullyParallel.
 */
test.describe("Voice session settlement", () => {
  test("refuses to settle a session that was never granted", async ({ page }) => {
    await signUpTestUser(page, "voice-settle-unknown");

    // No /api/agent/session call has been made by this account, so nothing has
    // been charged and there is nothing to refund.
    const response = await page.request.post("/api/agent/voice-usage", {
      data: { sessionId: crypto.randomUUID(), durationMs: 0 },
    });

    // A refund against no charge is credit minted from nothing: it moves the
    // spend counters below zero and buys headroom under every USD cap.
    expect(response.status()).toBe(400);
    expect(await response.json()).not.toHaveProperty("refundMicroUsd", 1_500_000);
  });

  test("settles a given session only once", async ({ page }) => {
    await signUpTestUser(page, "voice-settle-replay");

    const sessionId = crypto.randomUUID();
    const first = await page.request.post("/api/agent/voice-usage", {
      data: { sessionId, durationMs: 0 },
    });
    const second = await page.request.post("/api/agent/voice-usage", {
      data: { sessionId, durationMs: 0 },
    });

    // Whatever the first call does, replaying the same id must not refund
    // twice: one charge can only be settled once.
    const [firstRefund, secondRefund] = [
      await refundedMicroUsd(first),
      await refundedMicroUsd(second),
    ];

    expect(secondRefund).toBe(0);
    expect(firstRefund + secondRefund).toBeLessThanOrEqual(1_500_000);
  });

  test("never pays a refund for a session it did not grant", async ({ page }) => {
    test.setTimeout(60_000);
    await signUpTestUser(page, "voice-settle-drain");

    // The counters are what every USD cap is read from, so a refund with no
    // charge behind it does not merely add a wrong row: it buys spend
    // headroom. Repeated, it drives the agency-wide budget negative and
    // disables the cap for everyone until midnight UTC.
    let refunded = 0;
    for (let index = 0; index < 40; index += 1) {
      const response = await page.request.post("/api/agent/voice-usage", {
        data: { sessionId: `drain-${index}`, durationMs: 0 },
      });
      refunded += await refundedMicroUsd(response);
    }

    expect(refunded).toBe(0);
  });
});
