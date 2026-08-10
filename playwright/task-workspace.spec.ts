import { test, expect } from "@playwright/test";
import { seedTestBoard, signUpTestUser } from "./utils/playwright";

/** The board behind the workspace renders its own chips, so scope to the panel. */
const WORKSPACE = ".sq-task-workspace";

/**
 * The task workspace is one screen for every task. These cover the parts that
 * are structural rather than cosmetic: status is free-form, and a task is
 * filed under a category the board itself defines.
 */
test.describe("Task workspace", () => {
  test("a task opens as a document and takes any status", async ({ page }) => {
    await signUpTestUser(page, "workspace-doc");
    const board = await seedTestBoard(page.request, {
      title: "Workspace Board",
      client: "Northwind",
      tasks: [{ title: "Founder origin story" }],
      contributors: [{ name: "Ada Lovelace" }],
    });

    await page.goto(`/clients/${board.clientId}/tasks/${board.taskIds[0]}`);

    await expect(page.getByRole("heading", { name: "Founder origin story" })).toBeVisible();
    await expect(page.locator(`${WORKSPACE} .sq-type-chip`)).toHaveText("Uncategorized");

    // Status is a flat list, not a pipeline: anything can follow anything.
    const status = page.locator(WORKSPACE).getByLabel("Task status");
    await status.selectOption("rejected");
    await expect(status).toHaveValue("rejected");
    await status.selectOption("in_production");
    await expect(status).toHaveValue("in_production");
  });

  test("a task carries the category its board defines", async ({ page }) => {
    await signUpTestUser(page, "workspace-category");
    const board = await seedTestBoard(page.request, {
      title: "Category Board",
      client: "Southwind",
      tasks: [{ title: "Three myths about retainers", category: "Longform" }],
    });

    await page.goto(`/clients/${board.clientId}/tasks/${board.taskIds[0]}`);

    await expect(page.locator(`${WORKSPACE} .sq-type-chip`)).toHaveText("Longform");

    // Clearing it is one selection — categories are optional, not a pipeline.
    const category = page.locator(WORKSPACE).getByLabel("Task category");
    await category.selectOption("");
    await expect(page.locator(`${WORKSPACE} .sq-type-chip`)).toHaveText("Uncategorized");
  });

  test("people are set per role and shown on the rail", async ({ page }) => {
    await signUpTestUser(page, "workspace-people");
    const board = await seedTestBoard(page.request, {
      title: "People Board",
      client: "Westwind",
      tasks: [{ title: "Quarterly shoot" }],
      contributors: [{ name: "Grace Hopper" }, { name: "Alan Turing" }],
    });

    await page.goto(`/clients/${board.clientId}/tasks/${board.taskIds[0]}`);

    await page
      .getByRole("button", { name: /Nobody yet/ })
      .first()
      .click();
    await page.getByRole("option", { name: "Grace Hopper" }).click();
    await expect(page.getByText("Grace Hopper").first()).toBeVisible();
  });
});
