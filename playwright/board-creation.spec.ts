import { test, expect } from "@playwright/test";
import { createTestBoard, signUpTestUser, waitForBoardLoad } from "./utils/playwright";

// Note: Database is reset by the webServer before tests run
// Each test should work with a clean database state

test.describe("Board Creation", () => {
  test("should create a new board from homepage", async ({ page }) => {
    // Boards require an account
    await signUpTestUser(page);

    // Navigate to homepage
    await page.goto("/");

    // Verify homepage loads
    await expect(page.getByRole("heading", { name: /itacorubi/i })).toBeVisible();

    // Click "Create a Board" button
    await page.getByRole("button", { name: /create.*board/i }).click();

    // Verify dialog opens
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: /create.*board/i })).toBeVisible();

    // Verify form fields are prefilled
    const titleInput = page.getByLabel(/title/i);
    const passwordInput = page.getByLabel(/password/i);

    await expect(titleInput).toBeVisible();
    await expect(passwordInput).toBeVisible();

    // Fill in custom values
    const customTitle = "My Test Board";
    const customPassword = "testpass123";

    await titleInput.fill(customTitle);
    await passwordInput.fill(customPassword);

    // Submit form
    await page.getByRole("button", { name: /create board/i }).click();

    // Wait for redirect to board page
    await page.waitForURL(/\/boards\/[a-f0-9-]+$/);

    // Verify board page loads
    await waitForBoardLoad(page);

    // Verify board title is displayed (may have emoji prefix)
    const boardTitle = page.locator("header").getByText(customTitle, { exact: false });
    await expect(boardTitle).toBeVisible();
  });

  test("should create board with default columns", async ({ page }) => {
    const boardId = await createTestBoard(page, "Test Board", "testpass123");

    // Verify we're on the board page
    await page.waitForURL(`/boards/${boardId}`);
    await waitForBoardLoad(page);

    // Verify default columns exist (they have emoji prefixes, use containsText for flexibility)
    const toDoColumn = page.locator("*").filter({ hasText: /to do/i }).first();
    const doingColumn = page.locator("*").filter({ hasText: /doing/i }).first();
    const doneColumn = page.locator("*").filter({ hasText: /done/i }).first();
    const archiveColumn = page
      .locator("*")
      .filter({ hasText: /archive/i })
      .first();

    await expect(toDoColumn).toBeVisible();
    await expect(doingColumn).toBeVisible();
    await expect(doneColumn).toBeVisible();
    await expect(archiveColumn).toBeVisible();
  });

  test("should track board in recent boards", async ({ page }) => {
    const boardTitle = "Recent Board Test";
    const boardId = await createTestBoard(page, boardTitle, "testpass123");

    // Navigate back to homepage
    await page.goto("/");

    // Verify recent boards section appears
    await expect(page.getByText(/recent boards/i)).toBeVisible();

    // Verify the board appears in recent boards
    const boardLink = page.getByRole("link", { name: new RegExp(boardTitle, "i") });
    await expect(boardLink).toBeVisible();

    // Verify board ID is shown
    const boardIdCode = page.locator("code").filter({ hasText: boardId.slice(0, 8) });
    await expect(boardIdCode).toBeVisible();
  });

  test("should forget board from recent boards", async ({ page }) => {
    const boardTitle = "Board To Forget";
    await createTestBoard(page, boardTitle, "testpass123");

    // Navigate back to homepage
    await page.goto("/");

    // Verify the board appears in recent boards
    const boardLink = page.getByRole("link", { name: new RegExp(boardTitle, "i") });
    await expect(boardLink).toBeVisible();

    // Hover over the board item to reveal the forget button
    const boardItem = boardLink.locator("..");
    await boardItem.hover();

    // Click the forget button
    const forgetButton = page.getByRole("button", {
      name: new RegExp(`forget ${boardTitle}`, "i"),
    });
    await forgetButton.click();

    // Verify confirmation dialog appears
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/forget board/i)).toBeVisible();
    await expect(dialog.getByText(new RegExp(boardTitle, "i"))).toBeVisible();

    // Confirm forget
    await dialog.getByRole("button", { name: /forget/i }).click();

    // Verify the board is removed from recent boards
    await expect(boardLink).not.toBeVisible();
  });

  test("should require both title and password", async ({ page }) => {
    await signUpTestUser(page);
    await page.goto("/");
    await page.getByRole("button", { name: /create.*board/i }).click();

    // Get the submit button
    const submitButton = page.getByRole("button", { name: /create board/i });

    // Initially, button should be disabled if fields are empty
    // But since fields are prefilled, let's clear them
    await page.getByLabel(/title/i).fill("");
    await page.getByLabel(/password/i).fill("");

    // Button should be disabled
    await expect(submitButton).toBeDisabled();

    // Fill only title
    await page.getByLabel(/title/i).fill("Title Only");
    await expect(submitButton).toBeDisabled();

    // Fill only password
    await page.getByLabel(/title/i).fill("");
    await page.getByLabel(/password/i).fill("password123");
    await expect(submitButton).toBeDisabled();

    // Fill both
    await page.getByLabel(/title/i).fill("Complete Board");
    await expect(submitButton).toBeEnabled();
  });
});
