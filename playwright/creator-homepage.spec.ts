import { test, expect } from "@playwright/test";
import { seedTestBoard, signUpTestUser } from "./utils/playwright";

test.describe("Creator homepage", () => {
  test("signed out, the homepage stays the marketing page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /sign in to create a board/i })).toBeVisible();
    await expect(page.getByRole("region", { name: "Executive pulse" })).toHaveCount(0);
  });

  test("signed in, the homepage is the agent dashboard with live planner stats", async ({
    page,
  }) => {
    await signUpTestUser(page, "dashboard");
    await seedTestBoard(page.request, {
      title: "Pulse Board",
      tasks: [{ title: "Ownerless work" }, { title: "Second item", columnIndex: 1 }],
    });

    await page.goto("/");

    // Everything but the orb lives behind the hamburger now
    await page.getByRole("button", { name: "Open console" }).click();
    const console_ = page.getByRole("navigation", { name: "Console sections" });
    await console_.getByRole("button", { name: /Stats/ }).click();

    // The executive pulse reports the seeded work rather than an empty state
    const pulse = page.getByRole("region", { name: "Executive pulse" });
    await expect(pulse).toBeVisible();
    await expect(pulse.getByText("Delivery health")).toBeVisible();
    await expect(pulse.getByText("Unassigned")).toBeVisible();

    // The data center lists the seeded board with its counts
    await console_.getByRole("button", { name: /Boards/ }).click();
    const dataCenter = page.getByRole("region", { name: "Data center" });
    await dataCenter.getByRole("button", { name: "Boards" }).click();
    await expect(dataCenter.getByRole("button", { name: /Pulse Board/ })).toBeVisible();

    // Boards open full screen on the desk, not on their own page, and the orb
    // stays on the plate as a corner button so the voice session survives
    await dataCenter.getByRole("button", { name: /Pulse Board/ }).click();
    const boardPane = page.getByRole("region", { name: "Pulse Board board" });
    await expect(boardPane.getByText("Ownerless work")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /click to speak an instruction/i }),
    ).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/");

    // The board's controls ride in a floating button instead of a top bar
    await page.getByRole("button", { name: "Board menu" }).click();
    await page.getByRole("button", { name: "Close board" }).click();
    await expect(boardPane).toBeHidden();

    // Reopen the console for the rest of the checks
    await page.getByRole("button", { name: "Open console" }).click();

    // Risks pick up the two ownerless tasks
    await dataCenter.getByRole("button", { name: "Risks" }).click();
    await expect(dataCenter.getByText("Ownerless work")).toBeVisible();
    await expect(dataCenter.getByText(/No owner assigned/).first()).toBeVisible();
  });

  test("the plate is only the orb, the console holds the rest", async ({ page }) => {
    await signUpTestUser(page, "agent-ui");
    await page.goto("/");

    // The whole plate is the microphone, as in the reference interface
    await expect(
      page.getByRole("button", { name: /click to speak an instruction/i }),
    ).toBeVisible();

    // Chat is not on the homepage until the console is opened
    const chat = page.getByRole("region", { name: "Agent chat" });
    await expect(chat).toBeHidden();

    await page.getByRole("button", { name: "Open console" }).click();
    const console_ = page.getByRole("navigation", { name: "Console sections" });
    await console_.getByRole("button", { name: /Agent chat/ }).click();
    await expect(chat.getByRole("textbox", { name: /message the agent/i })).toBeVisible();

    await console_.getByRole("button", { name: /Stats/ }).click();
    await expect(page.getByRole("region", { name: "Planner status" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Throughput" })).toBeVisible();

    // Escape puts the plate back to just the orb
    await page.keyboard.press("Escape");
    await expect(page.getByRole("region", { name: "Planner status" })).toBeHidden();
  });

  test("the stats endpoint refuses anonymous requests", async ({ request }) => {
    const response = await request.get("/api/agent/stats");
    expect(response.status()).toBe(401);
  });

  test("tool calls refuse anonymous requests", async ({ request }) => {
    const response = await request.post("/api/agent/tool", {
      data: { name: "get_pulse", input: {} },
    });
    expect(response.status()).toBe(401);
  });

  test("read tools answer for a signed-in member, writes need confirmation", async ({ page }) => {
    await signUpTestUser(page, "tools");
    await seedTestBoard(page.request, {
      title: "Tooling Board",
      tasks: [{ title: "Draft the launch post" }],
    });

    const pulse = await page.request.post("/api/agent/tool", {
      data: { name: "get_pulse", input: {} },
    });
    expect(pulse.ok()).toBeTruthy();
    const pulseBody = await pulse.json();
    expect(pulseBody.status).toBe("ok");
    expect(pulseBody.data.totals.tasks).toBeGreaterThan(0);

    // A first write call only ever prepares
    const prepare = await page.request.post("/api/agent/tool", {
      data: {
        name: "create_task",
        input: { title: "Agent-made task", boardName: "Tooling Board", confirmed: false },
      },
    });
    const prepared = await prepare.json();
    expect(prepared.status).toBe("confirmation_required");
    expect(prepared.summary).toContain("Agent-made task");

    const searchBefore = await page.request.post("/api/agent/tool", {
      data: { name: "search_tasks", input: { titleContains: "Agent-made" } },
    });
    expect((await searchBefore.json()).data.total).toBe(0);

    // Only a confirmed call writes
    const execute = await page.request.post("/api/agent/tool", {
      data: {
        name: "create_task",
        input: { title: "Agent-made task", boardName: "Tooling Board", confirmed: true },
      },
    });
    const executed = await execute.json();
    expect(executed.status).toBe("executed");

    const searchAfter = await page.request.post("/api/agent/tool", {
      data: { name: "search_tasks", input: { titleContains: "Agent-made" } },
    });
    expect((await searchAfter.json()).data.total).toBe(1);
  });

  test("collaborators can be added by email and are listed back", async ({ page, browser }) => {
    // A second account has to exist before it can be given access
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    const { email } = await signUpTestUser(otherPage, "collab");
    await other.close();

    await signUpTestUser(page, "owner");
    await seedTestBoard(page.request, { title: "Shared Board" });

    const prepare = await page.request.post("/api/agent/tool", {
      data: {
        name: "add_collaborator",
        input: { email, boardName: "Shared Board", confirmed: false },
      },
    });
    expect((await prepare.json()).status).toBe("confirmation_required");

    const execute = await page.request.post("/api/agent/tool", {
      data: {
        name: "add_collaborator",
        input: { email, boardName: "Shared Board", confirmed: true },
      },
    });
    expect((await execute.json()).status).toBe("executed");

    const list = await page.request.post("/api/agent/tool", {
      data: { name: "list_collaborators", input: { boardName: "Shared Board" } },
    });
    const body = await list.json();
    expect(body.data.collaborators.map((entry: { email: string }) => entry.email)).toContain(email);
  });

  test("tools stay inside the caller's boards", async ({ page, browser }) => {
    const stranger = await browser.newContext();
    const strangerPage = await stranger.newPage();
    await signUpTestUser(strangerPage, "stranger");
    await seedTestBoard(strangerPage.request, { title: "Private Board" });
    await stranger.close();

    await signUpTestUser(page, "outsider");
    const response = await page.request.post("/api/agent/tool", {
      data: { name: "list_columns", input: { boardName: "Private Board" } },
    });
    const body = await response.json();
    expect(body.status).toBe("error");
    expect(body.message).toMatch(/not a member|No board called/i);
  });
});
