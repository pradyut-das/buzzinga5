import { Page, expect, Locator, APIRequestContext } from "@playwright/test";

// ============================================================
// FAST TEST SETUP (API-based)
// ============================================================

interface SeedBoardOptions {
  title?: string;
  password?: string;
  /** Attaches the board to a client so the desk screens can open it. */
  client?: string;
  tasks?: Array<{
    title: string;
    columnIndex?: number;
    /** A category name; the seed creates it on the board the first time it is used. */
    category?: string;
    assignees?: string[];
    /** Offset from base time in seconds (for deterministic ordering in tests) */
    createdAtOffset?: number;
  }>;
  contributors?: Array<{
    name: string;
    email?: string;
  }>;
}

interface SeedBoardResult {
  boardId: string;
  clientId: string | null;
  columnIds: string[];
  taskIds: string[];
  contributorIds: Record<string, string>;
}

/**
 * Creates a board via API (fast) - use for most tests
 * This is ~10x faster than createTestBoard which uses the UI
 */
export async function seedTestBoard(
  request: APIRequestContext,
  options: SeedBoardOptions = {},
): Promise<SeedBoardResult> {
  const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:5800";
  const response = await request.post(`${baseURL}/api/test/seed`, {
    data: {
      title: options.title ?? "Test Board",
      password: options.password ?? "testpass123",
      client: options.client,
      tasks: options.tasks,
      contributors: options.contributors,
    },
  });

  if (!response.ok()) {
    throw new Error(`Failed to seed board: ${response.status()} ${await response.text()}`);
  }

  return response.json();
}

/**
 * Seeds a board and navigates to it (fast setup + navigation)
 * Use this as a replacement for createTestBoard in most tests
 */
export async function seedAndNavigateToBoard(
  page: Page,
  options: SeedBoardOptions = {},
): Promise<SeedBoardResult> {
  const result = await seedTestBoard(page.request, options);
  await page.goto(`/boards/${result.boardId}`);
  await waitForBoardLoad(page);
  return result;
}

// ============================================================
// AUTH TEST HELPERS
// ============================================================

/**
 * Signs up a fresh account through the UI and lands on the homepage.
 * Boards require an account, so most flows need this first.
 */
export async function signUpTestUser(
  page: Page,
  label: string = "user",
): Promise<{ email: string; password: string }> {
  const email = `${label}-${crypto.randomUUID()}@example.com`;
  const password = "supersecret123";

  await page.goto("/signup");
  await page.getByLabel("Name").fill(`User ${label}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL("/");

  return { email, password };
}

// ============================================================
// UI-BASED TEST HELPERS
// ============================================================

/**
 * Waits for the task sidebar to be visible
 * Use this after clicking to create/open a task
 */
export async function waitForSidebarOpen(page: Page): Promise<Locator> {
  // The sidebar uses a Sheet which is a Radix Dialog
  // We identify it by the presence of the Back button
  const sidebar = page.getByRole("dialog");
  const backButton = sidebar.getByRole("button", { name: /back/i });
  await expect(backButton).toBeVisible();
  return sidebar;
}

/**
 * Waits for the task sidebar to be closed
 * Use this after clicking the back button to close the sidebar
 */
export async function waitForSidebarClose(page: Page): Promise<void> {
  // Wait for the back button in any dialog to not be visible
  // This is specific to the task sidebar which always has a back button
  const backButton = page.getByRole("button", { name: /back/i });
  await expect(backButton).not.toBeVisible();
}

/**
 * Creates a board via the UI and returns the board ID from the URL
 */
export async function createTestBoard(
  page: Page,
  title: string = "Test Board",
  password: string = "testpass123",
): Promise<string> {
  // Navigate to homepage
  await page.goto("/");

  // Creating a board requires an account
  if (await page.getByRole("link", { name: /sign in to create a board/i }).isVisible()) {
    await signUpTestUser(page);
    await page.goto("/");
  }

  // Click "Create a Board" button
  await page.getByRole("button", { name: /create.*board/i }).click();

  // Fill in the board creation form
  await page.getByLabel(/title/i).fill(title);
  await page.getByLabel(/password/i).fill(password);

  // Submit the form and wait for navigation
  await page.getByRole("button", { name: /create/i }).click();

  // Wait for either board page or unlock page (cookie timing can vary in tests)
  await page.waitForURL(/\/boards\/[a-f0-9-]+(\/unlock)?$/);

  // Extract board ID from URL (works for both /boards/{id} and /boards/{id}/unlock)
  const url = page.url();
  const match = url.match(/\/boards\/([a-f0-9-]+)(?:\/unlock)?$/);
  if (!match) throw new Error(`Failed to extract board ID from URL: ${url}`);
  const boardId = match[1];

  // If we landed on unlock page, unlock using the provided password
  if (url.endsWith("/unlock")) {
    await unlockTestBoard(page, boardId, password);
  } else {
    // Wait for header to ensure page is rendered
    await page.waitForSelector("header");
  }

  return boardId;
}

/**
 * Unlocks a board by navigating to the unlock page and entering the password
 */
export async function unlockTestBoard(
  page: Page,
  boardId: string,
  password: string,
): Promise<void> {
  // Navigate to unlock page
  await page.goto(`/boards/${boardId}/unlock`);

  // Fill in password
  await page.getByLabel(/password/i).fill(password);

  // Click unlock button and wait for navigation
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes(`/boards/${boardId}`) &&
        !response.url().includes("/unlock") &&
        response.status() === 200,
    ),
    page.getByRole("button", { name: /unlock.*board/i }).click(),
  ]);

  // Wait for header to ensure page is rendered
  await page.waitForSelector("header");
}

/**
 * Waits for the board to be fully loaded
 * Uses global timeout configuration (10s)
 */
export async function waitForBoardLoad(page: Page): Promise<void> {
  // Wait for the board page container (fast testid selector)
  await page.waitForSelector('[data-testid="board-page"]');
}

/**
 * Gets the test database context
 * Returns the database URL for test database
 */
export function getTestContext(): { databaseUrl: string } {
  return {
    databaseUrl: "file:test.db",
  };
}

const SYNC_TIMEOUT = 5000; // 5s - if sync takes longer, it's a UX bug

/**
 * Helper to gather pending operations from the sync indicator popover
 * Returns a comma-separated string of operation labels, or null if popover can't be read
 */
async function gatherPendingOperations(page: Page): Promise<string | null> {
  try {
    const syncIndicator = page.getByTestId("sync-indicator");
    const isVisible = await syncIndicator.isVisible().catch(() => false);
    if (!isVisible) {
      return null;
    }

    // Click to open popover
    await syncIndicator.click();

    // Wait for popover to appear
    const popover = page.getByTestId("sync-indicator-popover");
    const isPopoverVisible = await popover.isVisible({ timeout: 1000 }).catch(() => false);
    if (!isPopoverVisible) {
      return null;
    }

    // Try to read pending operations list
    const pendingList = popover.locator("ul");
    const listExists = await pendingList.isVisible().catch(() => false);
    if (!listExists) {
      return null;
    }

    const items = pendingList.locator("li");
    const count = await items.count();
    const operations: string[] = [];

    for (let i = 0; i < count; i++) {
      const text = await items.nth(i).textContent();
      if (text) {
        // Remove the bullet point prefix
        operations.push(text.replace(/^•\s*/, "").trim());
      }
    }

    // Close popover by clicking outside
    await page.keyboard.press("Escape");

    return operations.length > 0 ? operations.join(", ") : null;
  } catch {
    return null;
  }
}

/**
 * Waits for all pending sync operations to complete.
 *
 * Timeout is intentionally NOT configurable per-call. Per ADR 015:
 * - Flaky tests are bugs - if sync is slow in tests, it's slow for users
 * - If 5s isn't enough, FIX THE APP, don't increase the timeout
 *
 * Fails with a descriptive error showing pending operations.
 */
export async function waitForSync(page: Page): Promise<void> {
  const syncIndicator = page.getByTestId("sync-indicator");

  // Check if indicator exists at all (it's hidden when idle)
  const isVisible = await syncIndicator.isVisible().catch(() => false);
  if (!isVisible) {
    // No indicator means nothing is syncing - we're done
    return;
  }

  try {
    // Wait for "Saving..." to disappear (indicator goes to "Saved" then hides)
    await expect(syncIndicator.getByText(/saving/i)).not.toBeVisible({
      timeout: SYNC_TIMEOUT,
    });
  } catch {
    // On failure, gather pending operations from popover for better error message
    const pendingOps = await gatherPendingOperations(page);
    throw new Error(
      `Sync did not complete within ${SYNC_TIMEOUT}ms.\n` +
        `Pending operations: ${pendingOps || "unknown (could not read from UI)"}\n` +
        `This is likely an app bug - real users would experience the same delay.`,
    );
  }
}
