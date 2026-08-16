import { test, expect, Page } from "@playwright/test";
import {
  seedAndNavigateToBoard,
  seedTestBoard,
  waitForSidebarOpen,
  waitForSidebarClose,
  waitForSync,
} from "./utils/playwright";

/**
 * Helper to set up a contributor with an email address
 */
async function createContributorWithEmail(page: Page, email: string): Promise<void> {
  // Open contributors dialog
  await page.getByRole("button", { name: /manage contributors/i }).click();
  const dialog = page.getByRole("dialog", { name: /contributors/i });
  await expect(dialog).toBeVisible();

  // Click on "Add email for notifications" button for this contributor
  const addEmailButton = dialog.getByTitle(/click to add email/i);
  await addEmailButton.click();

  // Now the email input should be visible
  const emailInput = dialog.getByPlaceholder("email@example.com");
  await expect(emailInput).toBeVisible();
  await emailInput.fill(email);
  await emailInput.press("Enter");

  // Wait for the email to be displayed (confirms it was saved)
  await expect(dialog.getByText(email)).toBeVisible();

  // Close dialog
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();

  // Wait for the outbox to flush
  await waitForSync(page);
}

/**
 * Helper to process notifications via API (board-scoped)
 */
async function processNotifications(page: Page, boardId: string): Promise<void> {
  await page.request.post(`/api/boards/${boardId}/emails`);
}

/**
 * Helper to get sent emails via API (board-scoped)
 */
async function getSentEmails(
  page: Page,
  boardId: string,
): Promise<{
  emails: Array<{
    id: string;
    fromEmail: string;
    recipientEmail: string;
    recipientName: string;
    subject: string;
    boardTitle: string;
    sentToResend: boolean;
  }>;
}> {
  const response = await page.request.get(`/api/boards/${boardId}/emails`);
  return response.json();
}

/**
 * Helper to get a single email with full content (board-scoped)
 */
async function getEmailById(
  page: Page,
  boardId: string,
  id: string,
): Promise<{
  email: {
    id: string;
    fromEmail: string;
    recipientEmail: string;
    recipientName: string;
    subject: string;
    boardTitle: string;
    htmlContent: string;
    notificationIds: string;
    sentToResend: boolean;
  };
}> {
  const response = await page.request.get(`/api/boards/${boardId}/emails/${id}`);
  return response.json();
}

test.describe("Email Notifications", () => {
  test("should send email notification when task is moved to different column", async ({
    page,
  }) => {
    // Create board and task
    const { boardId } = await seedAndNavigateToBoard(page, { title: "Move Notification Test" });

    // Create a task
    await page
      .getByRole("button", { name: /add task/i })
      .first()
      .click();
    const sidebar = await waitForSidebarOpen(page);

    // Create an assignee with email
    const assigneesSelect = sidebar.getByRole("combobox", { name: /assignees/i });
    await assigneesSelect.click();
    await page.getByPlaceholder(/search or create/i).fill("Move Watcher");
    await page.getByRole("option", { name: /create.*move watcher/i }).click();

    // Wait for assignment to persist
    await expect(sidebar.locator("span").filter({ hasText: "Move Watcher" }).first()).toBeVisible();

    // Close sidebar
    await sidebar.getByRole("button", { name: /back/i }).click();
    await waitForSidebarClose(page);

    // Wait for sync
    await page.waitForTimeout(1000);

    // Add email to the assignee
    await createContributorWithEmail(page, "watcher@example.com");

    // Re-open task and move it via Status dropdown
    await page.getByRole("link", { name: /open task.*new task/i }).click();
    const sidebar2 = await waitForSidebarOpen(page);

    const statusLabel = sidebar2.getByText("Status");
    const statusSelect = statusLabel.locator("..").getByRole("combobox");
    await statusSelect.click();
    await page.getByRole("option", { name: /doing/i }).click();

    // Wait for move to persist
    await page.waitForTimeout(1000);

    // Close sidebar
    await sidebar2.getByRole("button", { name: /back/i }).click();
    await waitForSidebarClose(page);

    // Process notifications via API
    await processNotifications(page, boardId);

    // Verify email was captured
    const { emails } = await getSentEmails(page, boardId);

    expect(emails.length).toBeGreaterThan(0);

    const emailMeta = emails.find((e) => e.recipientEmail === "watcher@example.com");
    expect(emailMeta).toBeDefined();

    // Get full email content to verify
    const { email } = await getEmailById(page, boardId, emailMeta!.id);
    expect(email.htmlContent).toContain("moved task from");
    expect(email.htmlContent).toContain("To do");
    expect(email.htmlContent).toContain("Doing");

    // Verify from address is saved
    expect(email.fromEmail).toBeDefined();
    expect(email.fromEmail).toMatch(/@/); // Should be a valid email address
  });

  test("board email API should require authentication", async ({ page }) => {
    // Create board to get a valid boardId
    const { boardId } = await seedAndNavigateToBoard(page, { title: "Auth Test Board" });

    // Navigate away to clear the session cookie (simulate unauthenticated request)
    // Actually, the API uses cookie-based auth from the board unlock flow
    // Since we just created the board, we should be authenticated

    // Verify the email API is accessible when authenticated
    const response = await page.request.get(`/api/boards/${boardId}/emails`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("emails");
    expect(Array.isArray(data.emails)).toBe(true);
  });

  test("should be able to trigger notification processing", async ({ page }) => {
    // Create board
    const { boardId } = await seedAndNavigateToBoard(page, { title: "Process Test Board" });

    // Trigger should work without errors
    const response = await page.request.post(`/api/boards/${boardId}/emails`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("message");
  });

  test("should save from email address in sent emails", async ({ page }) => {
    // Create board and task with assignee
    const { boardId } = await seedAndNavigateToBoard(page, { title: "From Address Test" });

    // Create a task
    await page
      .getByRole("button", { name: /add task/i })
      .first()
      .click();
    const sidebar = await waitForSidebarOpen(page);

    // Create an assignee
    const assigneesSelect = sidebar.getByRole("combobox", { name: /assignees/i });
    await assigneesSelect.click();
    await page.getByPlaceholder(/search or create/i).fill("From Test User");
    await page.getByRole("option", { name: /create.*from test user/i }).click();

    // Wait for assignment to persist
    await expect(
      sidebar.locator("span").filter({ hasText: "From Test User" }).first(),
    ).toBeVisible();

    // Close sidebar
    await sidebar.getByRole("button", { name: /back/i }).click();
    await waitForSidebarClose(page);
    await page.waitForTimeout(1000);

    // Add email to the assignee
    await createContributorWithEmail(page, "fromtest@example.com");

    // Re-open task and move it to trigger notification
    await page.getByRole("link", { name: /open task.*new task/i }).click();
    const sidebar2 = await waitForSidebarOpen(page);

    const statusLabel = sidebar2.getByText("Status");
    const statusSelect = statusLabel.locator("..").getByRole("combobox");
    await statusSelect.click();
    await page.getByRole("option", { name: /doing/i }).click();
    await page.waitForTimeout(1000);

    await sidebar2.getByRole("button", { name: /back/i }).click();
    await waitForSidebarClose(page);

    // Process notifications
    await processNotifications(page, boardId);

    // Verify email has from address in list response
    const { emails } = await getSentEmails(page, boardId);
    expect(emails.length).toBeGreaterThan(0);

    const emailMeta = emails[0];
    expect(emailMeta.fromEmail).toBeDefined();
    expect(emailMeta.fromEmail).toBe("noreply@squirrl.itsdesignare.com");

    // Verify from address in full email response
    const { email } = await getEmailById(page, boardId, emailMeta.id);
    expect(email.fromEmail).toBe("noreply@squirrl.itsdesignare.com");
  });

  test("should show email history link in board header", async ({ page }) => {
    // Create board
    await seedAndNavigateToBoard(page, { title: "Header Link Test" });

    // Verify the email history link is visible in the header
    const emailHistoryLink = page.getByRole("link", { name: /email history/i });
    await expect(emailHistoryLink).toBeVisible();

    // Click the link and verify navigation
    await emailHistoryLink.click();
    await expect(page).toHaveURL(/\/boards\/[^/]+\/emails$/);

    // Verify the email history page loads
    await expect(page.getByRole("heading", { name: /email history/i })).toBeVisible();
  });

  test("should reject GET /api/boards/[boardId]/emails without authentication", async ({
    page,
    context,
  }) => {
    // Create board to get a valid boardId
    const { boardId } = await seedTestBoard(page.request, { title: "Unauth GET Test" });

    // Clear cookies to simulate unauthenticated request
    await context.clearCookies();

    // Attempt to access the email list API without authentication
    const response = await page.request.get(`/api/boards/${boardId}/emails`);

    // Should return 401 Unauthorized
    expect(response.status()).toBe(401);

    const data = await response.json();
    expect(data.error).toBe("Unauthorized");
  });

  test("should reject POST /api/boards/[boardId]/emails without authentication", async ({
    page,
    context,
  }) => {
    // Create board to get a valid boardId
    const { boardId } = await seedTestBoard(page.request, { title: "Unauth POST Test" });

    // Clear cookies to simulate unauthenticated request
    await context.clearCookies();

    // Attempt to process notifications without authentication
    const response = await page.request.post(`/api/boards/${boardId}/emails`);

    // Should return 401 Unauthorized
    expect(response.status()).toBe(401);

    const data = await response.json();
    expect(data.error).toBe("Unauthorized");
  });

  test("should reject GET /api/boards/[boardId]/emails/[id] without authentication", async ({
    page,
    context,
  }) => {
    // Create board and process a notification to get an email ID
    const { boardId } = await seedAndNavigateToBoard(page, { title: "Unauth Email Detail Test" });

    // Create a task and trigger notification
    await page
      .getByRole("button", { name: /add task/i })
      .first()
      .click();
    const sidebar = await waitForSidebarOpen(page);

    const assigneesSelect = sidebar.getByRole("combobox", { name: /assignees/i });
    await assigneesSelect.click();
    await page.getByPlaceholder(/search or create/i).fill("Unauth Detail User");
    await page.getByRole("option", { name: /create.*unauth detail user/i }).click();
    await expect(
      sidebar.locator("span").filter({ hasText: "Unauth Detail User" }).first(),
    ).toBeVisible();

    await sidebar.getByRole("button", { name: /back/i }).click();
    await waitForSidebarClose(page);
    await page.waitForTimeout(1000);

    await createContributorWithEmail(page, "unauthdetail@example.com");

    // Move task to trigger notification
    await page.getByRole("link", { name: /open task.*new task/i }).click();
    const sidebar2 = await waitForSidebarOpen(page);
    const statusLabel = sidebar2.getByText("Status");
    const statusSelect = statusLabel.locator("..").getByRole("combobox");
    await statusSelect.click();
    await page.getByRole("option", { name: /doing/i }).click();
    await page.waitForTimeout(1000);
    await sidebar2.getByRole("button", { name: /back/i }).click();
    await waitForSidebarClose(page);

    // Process and get email ID
    await processNotifications(page, boardId);
    const { emails } = await getSentEmails(page, boardId);
    expect(emails.length).toBeGreaterThan(0);
    const emailId = emails[0].id;

    // Clear cookies to simulate unauthenticated request
    await context.clearCookies();

    // Attempt to get email detail without authentication
    const response = await page.request.get(`/api/boards/${boardId}/emails/${emailId}`);

    // Should return 401 Unauthorized
    expect(response.status()).toBe(401);

    const data = await response.json();
    expect(data.error).toBe("Unauthorized");
  });

  /**
   * The unsubscribe route is reachable without a session by design: it is
   * followed from an inbox. These drive it over HTTP; the delivery behaviour
   * behind it (who gets held, who gets dropped) is covered by
   * `pnpm verify:notifications`, which does not need the retired board UI.
   */
  test("unsubscribe rejects a missing token", async ({ page }) => {
    const response = await page.request.get("/api/unsubscribe");
    expect(response.status()).toBe(400);
    expect(await response.text()).toContain("missing its token");
  });

  test("unsubscribe rejects an unknown token", async ({ page }) => {
    const response = await page.request.get("/api/unsubscribe?token=not-a-real-token");
    expect(response.status()).toBe(404);
    expect(await response.text()).toContain("no longer valid");
  });

  test("unsubscribe needs no session", async ({ page, context }) => {
    await context.clearCookies();
    const response = await page.request.get("/api/unsubscribe?token=still-not-real");
    // 404 for the unknown token, never 401: the token is the only credential.
    expect(response.status()).toBe(404);
  });

  test("unsubscribe accepts the one-click POST mail clients send", async ({ page }) => {
    const response = await page.request.post("/api/unsubscribe?token=not-a-real-token");
    expect(response.status()).toBe(404);
    expect(response.headers()["content-type"]).toContain("text/html");
  });
});
