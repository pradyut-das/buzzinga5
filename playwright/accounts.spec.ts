import { test, expect } from "@playwright/test";
import {
  createTestBoard,
  seedTestBoard,
  signUpTestUser,
  waitForBoardLoad,
} from "./utils/playwright";

test.describe("User accounts", () => {
  test("signs up, stays signed in, and signs out", async ({ page }) => {
    await signUpTestUser(page, "signup");

    const boardId = await createTestBoard(page, "🧪 Session Board");
    const sidebar = page.getByTestId("board-sidebar");
    await expect(sidebar.getByRole("link", { name: "🧪 Session Board" })).toBeVisible();

    await sidebar.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL("/");

    // Signed out, the board is no longer listed as a membership
    await page.goto(`/boards/${boardId}`);
    await expect(
      page.getByTestId("board-sidebar").getByRole("button", { name: "Sign out" }),
    ).toHaveCount(0);
  });

  test("rejects a wrong password with a generic error", async ({ page }) => {
    const { email } = await signUpTestUser(page, "wrongpass");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("link", { name: /sign in to create a board/i })).toBeVisible();

    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page.getByTestId("auth-error")).toHaveText("Invalid email or password");
  });

  test("signed-in members open a board without re-entering the password", async ({ page }) => {
    await signUpTestUser(page, "member");

    const { boardId } = await seedTestBoard(page.request, { title: "Members Board" });

    // Visiting with the seeded password cookie joins the board...
    await page.goto(`/boards/${boardId}`);
    await waitForBoardLoad(page);

    // ...so membership alone must keep granting access without the cookie
    await page.context().clearCookies({ name: `board-${boardId}-password` });

    await page.goto(`/boards/${boardId}`);
    await expect(page.getByTestId("board-page")).toBeVisible();
  });
});

test.describe("Sidebar", () => {
  test("lists the boards the user belongs to", async ({ page }) => {
    await signUpTestUser(page, "sidebar");

    const boardA = await createTestBoard(page, "🧪 Sidebar Board");
    const boardB = await seedTestBoard(page.request, { title: "🧰 Seeded Board" });
    await page.goto(`/boards/${boardB.boardId}`);
    await waitForBoardLoad(page);

    const sidebar = page.getByTestId("board-sidebar");
    await expect(sidebar.getByRole("link", { name: "🧪 Sidebar Board" })).toHaveAttribute(
      "href",
      `/boards/${boardA}`,
    );

    await sidebar.getByRole("link", { name: "🧪 Sidebar Board" }).click();
    await page.waitForURL(`/boards/${boardA}`);
    await expect(page.getByTestId("board-page")).toBeVisible();
  });

  test("collapses and stays collapsed across navigation", async ({ page }) => {
    await signUpTestUser(page, "collapse");
    await createTestBoard(page, "🧪 Collapse Board");

    const sidebar = page.getByTestId("board-sidebar");
    await sidebar.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(sidebar).toHaveAttribute("data-collapsed", "true");

    await page.reload();
    await expect(page.getByTestId("board-sidebar")).toHaveAttribute("data-collapsed", "true");
  });
});
