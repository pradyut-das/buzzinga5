import { test, expect } from "@playwright/test";
import { signUpTestUser } from "./utils/playwright";

/**
 * The admin console's access rules, across every section.
 *
 * `ADMIN_EMAILS` is unset in the test environment and signup emails are
 * random, so no test user can be an admin. That makes closed-by-default the
 * property these tests can prove, and it is the one worth proving: each of
 * these pages reads across every client, board and account in the system, so
 * a section that opened to a signed-in non-admin would hand the whole desk to
 * anyone who registers.
 *
 * Every section is listed rather than a sample. A page added to the console
 * without a guard is exactly the mistake this catches, and only naming them
 * all catches it.
 */

const SECTIONS = [
  "/admin",
  "/admin/people",
  "/admin/workspace",
  "/admin/email",
  "/admin/delivery",
  "/admin/system",
  "/admin/ai",
];

/** Headings that only ever render once past the admin guard. */
const ADMIN_ONLY_HEADINGS = [
  /needs attention/i,
  /people on boards/i,
  /queued notifications/i,
  /publishing queue/i,
  /ai spend caps/i,
  /credentials/i,
];

test.describe("Admin console access", () => {
  test("shows no section to a signed-out visitor", async ({ page }) => {
    for (const path of SECTIONS) {
      await page.goto(path);
      for (const heading of ADMIN_ONLY_HEADINGS) {
        await expect(page.getByRole("heading", { name: heading })).toHaveCount(0);
      }
    }
  });

  test("shows no section to a signed-in non-admin", async ({ page }) => {
    await signUpTestUser(page, "admin-console-viewer");

    for (const path of SECTIONS) {
      await page.goto(path);
      for (const heading of ADMIN_ONLY_HEADINGS) {
        await expect(page.getByRole("heading", { name: heading })).toHaveCount(0);
      }
    }
  });

  test("never leaks credential state to a non-admin", async ({ page }) => {
    await signUpTestUser(page, "admin-console-secrets");
    await page.goto("/admin/system");

    // The system page names the environment variables the deployment runs on.
    // Presence alone tells an attacker what is configured, so assert none of
    // the names reach the page rather than only that the heading is missing.
    for (const variable of ["SUPABASE_SERVICE_KEY", "CRON_SECRET", "RESEND_API_KEY"]) {
      await expect(page.getByText(variable, { exact: false })).toHaveCount(0);
    }
  });
});
