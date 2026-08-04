import { test, expect } from "@playwright/test";
import { seedTestBoard, waitForBoardLoad, signUpTestUser } from "./utils/playwright";

test.describe("Board Unlock", () => {
  test("should redirect to unlock page when accessing board without password", async ({
    page,
    context,
  }) => {
    // Create a board first - seedTestBoard sets the password cookie
    const { boardId } = await seedTestBoard(page.request, { title: "Locked Board" });

    // Clear cookies to simulate not having password
    await context.clearCookies();
    await signUpTestUser(page, "unlock");

    // Try to access the board
    await page.goto(`/boards/${boardId}`);

    // Should redirect to unlock page
    await page.waitForURL(`/boards/${boardId}/unlock`);

    // Verify unlock page is displayed
    await expect(page.getByRole("heading", { name: /board locked/i })).toBeVisible();
    await expect(page.getByText(/enter the password/i)).toBeVisible();
  });

  test("should unlock board with correct password", async ({ page, context }) => {
    const { boardId } = await seedTestBoard(page.request, {
      title: "Unlock Test Board",
      password: "correctpass123",
    });

    // Clear cookies
    await context.clearCookies();
    await signUpTestUser(page, "unlock");

    // Navigate to unlock page
    await page.goto(`/boards/${boardId}/unlock`);

    // Enter correct password
    await page.getByPlaceholder(/enter password/i).fill("correctpass123");

    // Click unlock button
    await page.getByRole("button", { name: /unlock board/i }).click();

    // Should redirect to board page
    await page.waitForURL(`/boards/${boardId}`);

    // Verify board loads
    await waitForBoardLoad(page);
  });

  test("should show error with incorrect password", async ({ page, context }) => {
    const { boardId } = await seedTestBoard(page.request, {
      title: "Error Test Board",
      password: "rightpass123",
    });

    // Clear cookies
    await context.clearCookies();
    await signUpTestUser(page, "unlock");

    // Navigate to unlock page
    await page.goto(`/boards/${boardId}/unlock`);

    // Enter wrong password
    await page.getByPlaceholder(/enter password/i).fill("wrongpass123");

    // Click unlock button
    await page.getByRole("button", { name: /unlock board/i }).click();

    // Should show error message
    await expect(page.getByText(/invalid board or password/i)).toBeVisible();

    // Should still be on unlock page
    expect(page.url()).toContain("/unlock");
  });

  test("should prefill password from query parameter and auto-submit", async ({
    page,
    context,
  }) => {
    const { boardId } = await seedTestBoard(page.request, {
      title: "Prefill Test",
      password: "prefillpass123",
    });

    // Clear cookies
    await context.clearCookies();
    await signUpTestUser(page, "unlock");

    // Navigate to unlock page with password in query
    await page.goto(`/boards/${boardId}/unlock?password=prefillpass123`);

    // Password should be prefilled
    const passwordInput = page.getByPlaceholder(/enter password/i);
    await expect(passwordInput).toHaveValue("prefillpass123");

    // Should auto-submit and redirect to board (no need to click unlock button)
    await page.waitForURL(`/boards/${boardId}`);
    await waitForBoardLoad(page);
  });

  test("should show share dialog with board URL and password", async ({ page }) => {
    const { boardId } = await seedTestBoard(page.request, {
      title: "Share Test Board",
      password: "sharepass123",
    });
    await page.goto(`/boards/${boardId}`);
    await waitForBoardLoad(page);

    // Click share button (should be in header - look for Share2 icon button)
    const shareButton = page
      .locator("button")
      .filter({ hasText: /share/i })
      .or(page.getByRole("button", { name: /share/i }))
      .first();
    await shareButton.click();

    // Verify share dialog opens
    await expect(page.getByRole("dialog")).toBeVisible();

    // Verify share dialog title
    await expect(page.getByText(/share board/i)).toBeVisible();

    // Verify board URL is shown in input field (wait for password to load via proper waiting)
    const urlInput = page
      .getByLabel(/board url/i)
      .or(page.locator("input").filter({ hasText: new RegExp(`/boards/${boardId}`, "i") }))
      .first();
    await expect(urlInput).toBeVisible();
    await expect(urlInput).toHaveValue(new RegExp(`/boards/${boardId}`, "i"));

    // Copy button should exist (icon button with Copy icon)
    const copyButtons = page
      .locator('button[title*="Copy"]')
      .or(page.locator("button").filter({ hasText: /copy/i }));
    await expect(copyButtons.first()).toBeVisible();
  });

  test("should change password from share dialog", async ({ page }) => {
    const { boardId } = await seedTestBoard(page.request, {
      title: "Change Password Test",
      password: "oldpass123",
    });
    await page.goto(`/boards/${boardId}`);
    await waitForBoardLoad(page);

    // Open share dialog
    const shareButton = page
      .locator("button")
      .filter({ hasText: /share/i })
      .or(page.getByRole("button", { name: /share/i }))
      .first();
    await shareButton.click();

    // Wait for share dialog to open
    await expect(page.getByRole("dialog", { name: /share board/i })).toBeVisible();

    // Click "Change Password" button
    await page.getByRole("button", { name: /change password/i }).click();

    // Wait for change password dialog to open
    const changePasswordDialog = page.getByRole("dialog", { name: /change board password/i });
    await expect(changePasswordDialog).toBeVisible();

    // Verify warning message is displayed
    await expect(
      changePasswordDialog.getByText(
        /anyone who had access with the old password will lose access/i,
      ),
    ).toBeVisible();

    // Fill in new password and confirm password
    await changePasswordDialog.getByLabel(/new password/i).fill("newpass123");
    await changePasswordDialog.getByLabel(/confirm password/i).fill("newpass123");

    // Submit the form
    await changePasswordDialog.getByRole("button", { name: /change password/i }).click();

    // Verify success toast appears
    await expect(page.getByText(/password updated successfully/i)).toBeVisible();

    // Verify change password dialog closes
    await expect(changePasswordDialog).not.toBeVisible();

    // Verify person changing password remains logged in (board still accessible)
    await waitForBoardLoad(page);
    await expect(page.getByRole("heading", { name: /change password test/i })).toBeVisible();
  });

  test("should invalidate old password after change", async ({ page, context }) => {
    const { boardId } = await seedTestBoard(page.request, {
      title: "Password Invalidation Test",
      password: "oldpass123",
    });
    await page.goto(`/boards/${boardId}`);
    await waitForBoardLoad(page);

    // Change password via share dialog
    const shareButton = page
      .locator("button")
      .filter({ hasText: /share/i })
      .or(page.getByRole("button", { name: /share/i }))
      .first();
    await shareButton.click();

    await expect(page.getByRole("dialog", { name: /share board/i })).toBeVisible();
    await page.getByRole("button", { name: /change password/i }).click();

    const changePasswordDialog = page.getByRole("dialog", { name: /change board password/i });
    await expect(changePasswordDialog).toBeVisible();

    await changePasswordDialog.getByLabel(/new password/i).fill("newpass123");
    await changePasswordDialog.getByLabel(/confirm password/i).fill("newpass123");
    await changePasswordDialog.getByRole("button", { name: /change password/i }).click();

    // Wait for success toast
    await expect(page.getByText(/password updated successfully/i)).toBeVisible();

    // Clear cookies to simulate user with old password
    await context.clearCookies();
    await signUpTestUser(page, "unlock");

    // Try to unlock with old password
    await page.goto(`/boards/${boardId}/unlock`);
    await page.getByPlaceholder(/enter password/i).fill("oldpass123");
    await page.getByRole("button", { name: /unlock board/i }).click();

    // Verify "Invalid password" error
    await expect(page.getByText(/invalid board or password/i)).toBeVisible();
    expect(page.url()).toContain("/unlock");

    // Unlock with new password
    await page.getByPlaceholder(/enter password/i).fill("newpass123");
    await page.getByRole("button", { name: /unlock board/i }).click();

    // Verify success
    await page.waitForURL(`/boards/${boardId}`);
    await waitForBoardLoad(page);
  });
});
