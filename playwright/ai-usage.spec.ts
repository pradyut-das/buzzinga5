import { test, expect } from "@playwright/test";
import { signUpTestUser } from "./utils/playwright";

/**
 * The AI usage report and its access rules.
 *
 * `ADMIN_EMAILS` is unset in the test environment and signup emails are random,
 * so no test user can be an admin. That makes the closed-by-default behaviour
 * the thing these tests can prove — which is the property worth proving: the
 * report exposes what every account spends, and a bug that opened it to a
 * signed-in non-admin would leak that to everyone.
 */
test.describe("AI usage report", () => {
  test("stays closed to signed-out visitors and signed-in non-admins", async ({ page }) => {
    // Signed out: the page must not exist rather than redirect to a login,
    // so its presence is never advertised.
    await page.goto("/admin/ai");
    await expect(page.getByRole("heading", { name: /today against the caps/i })).toHaveCount(0);

    await signUpTestUser(page, "ai-usage-viewer");

    await page.goto("/admin/ai");
    await expect(page.getByRole("heading", { name: /today against the caps/i })).toHaveCount(0);
    // Nothing about anyone's spend reaches a non-admin.
    await expect(page.getByRole("heading", { name: /window totals/i })).toHaveCount(0);
  });

  test("serves the JSON report only to admins", async ({ page }) => {
    await signUpTestUser(page, "ai-usage-json");

    // A 404 rather than a 403: the endpoint does not confirm it exists.
    const response = await page.request.get("/api/admin/ai-usage?days=7");
    expect(response.status()).toBe(404);

    const body = await response.json();
    // A leak here would hand over every account's usage, so assert the payload
    // carries no report data at all, not merely that the status was right.
    expect(body).not.toHaveProperty("byUser");
    expect(body).not.toHaveProperty("recent");
    expect(body).not.toHaveProperty("totals");
  });
});
