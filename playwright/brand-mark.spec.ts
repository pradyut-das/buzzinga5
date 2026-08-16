import { test, expect } from "@playwright/test";
import { signUpTestUser } from "./utils/playwright";

test("the desk rail carries the animated cat mark", async ({ page }) => {
  await signUpTestUser(page, "brand");
  await page.goto("/clients");

  const brand = page.getByRole("link", { name: "Squirrl home" });
  await expect(brand).toBeVisible();
  await expect(brand.locator("svg")).toBeVisible();

  await brand.screenshot({
    path: "/private/tmp/claude-501/-Users-pradyut-buzzinga5/f58191d9-ccb8-4f95-a611-988d24db4c41/scratchpad/brand.png",
  });
});
