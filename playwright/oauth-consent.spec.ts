import { test, expect } from "@playwright/test";
import { signUpTestUser } from "./utils/playwright";

/**
 * The consent screen Supabase hands an OAuth authorization off to.
 *
 * This is the step where someone grants an outside app the right to act as
 * them, so the failure that matters is it appearing to work while nobody is
 * really behind it — hence the checks that an anonymous visitor is sent to
 * sign in first and returned to the same request afterwards.
 */
test.describe("OAuth consent", () => {
  test("sends a signed-out visitor to sign in and keeps the request", async ({ page }) => {
    await page.goto("/oauth/consent?authorization_id=test-authorization");

    await expect(page).toHaveURL(/\/login\?next=/);
    // The authorization id has to survive the detour, or the person signs in
    // and lands back with nothing to approve.
    expect(decodeURIComponent(page.url())).toContain("authorization_id=test-authorization");

    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  });

  test("asks for nothing when no request was passed", async ({ page }) => {
    await signUpTestUser(page, "consent-bare");

    await page.goto("/oauth/consent");

    await expect(page.getByRole("heading", { name: /nothing to authorize/i })).toBeVisible();
    // No approval control may exist without a request behind it.
    await expect(page.getByRole("button", { name: /^authorize$/i })).toHaveCount(0);
  });

  test("refuses an authorization id that means nothing", async ({ page }) => {
    await signUpTestUser(page, "consent-bogus");

    await page.goto("/oauth/consent?authorization_id=not-a-real-authorization");

    // Supabase rejects the lookup, and the screen must say so rather than
    // offer an Authorize button that would approve an unknown request.
    await expect(page.getByRole("heading", { name: /request expired/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^authorize$/i })).toHaveCount(0);
  });
});
