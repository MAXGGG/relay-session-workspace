import { mkdirSync } from "node:fs";
import path from "node:path";
import { test as base, expect } from "@playwright/test";
import { projectRoot } from "../../src/server/app.ts";
import { testApp } from "../helpers.ts";

const test = base.extend<{ app: Awaited<ReturnType<typeof testApp>> }>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires a destructured fixture argument.
  app: async ({}, use) => {
    const app = await testApp();
    try {
      await use(app);
    } finally {
      await app.cleanup();
    }
  },
});
test.beforeEach(async ({ page, app }) => {
  await page.goto(app.url);
  await expect(page.locator("#connection")).toContainText("Connected");
});

test("next opens the correct terminal; explicit review advances the queue", async ({
  page,
  app,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(page.getByRole("region", { name: "Attention queue" })).toBeVisible();
  await expect(page.locator("#pending-count")).toHaveText("2");
  await page.getByRole("button", { name: "Next task" }).click();
  await expect(page.locator("#terminal-name")).toHaveText("Payments API");
  await expect(page.locator("#focus-item")).toContainText("question");
  await expect(page.locator("#pending-count")).toHaveText("2");
  const taskId = app.workspace.state.selectedItemId;
  await page.getByLabel("Coordinator command").fill(`open ${taskId}`);
  await page.getByRole("button", { name: "Send command" }).click();
  await expect(page.locator(".message.assistant").last()).toContainText(String(taskId));
  await page.getByRole("button", { name: "Mark handled", exact: true }).click();
  await page.getByRole("button", { name: "Next task" }).click();
  await expect(page.locator("#terminal-name")).toHaveText("Website navigation");
  await page.getByRole("button", { name: "Mark reviewed", exact: true }).click();
  await expect(page.locator("#queue")).toContainText("All clear.");
  expect(errors).toEqual([]);
});

test("priority, deferred work and selection survive refresh", async ({ page }) => {
  await page.getByLabel("Priority for Payments API").selectOption("3");
  await page.getByRole("button", { name: "Next task" }).click();
  await expect(page.locator("#terminal-name")).toHaveText("Website navigation");
  await page.locator(".quick-actions").getByRole("button", { name: "Defer 30m" }).click();
  await expect(page.locator("#pending-count")).toHaveText("1");
  await page.reload();
  await expect(page.locator("#connection")).toContainText("Connected");
  await expect(page.locator("#pending-count")).toHaveText("1");
  await expect(page.getByLabel("Priority for Payments API")).toHaveValue("3");
  await page.getByRole("button", { name: "Deferred", exact: true }).click();
  await expect(page.locator("#queue")).toContainText("Website navigation");
});

test("typing into a sample terminal answers its question and creates a review item", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Next task" }).click();
  await expect(page.locator("#terminal-mode")).toHaveText("SIMULATED");
  await page.locator(".xterm-helper-textarea").focus();
  await page.keyboard.type("Use manual review");
  await page.keyboard.press("Enter");
  await expect(page.locator("#queue")).toContainText("Sample result is ready");
  await expect(page.locator("#queue .kind.question")).toHaveCount(0);
  await expect(page.locator("#queue .kind.review")).toHaveCount(2);
});

test("create a real shell, search it, and show clear validation for missing projects", async ({
  page,
}) => {
  await page.locator("#new-session").click();
  await page.getByLabel("Name", { exact: true }).fill("My shell");
  await page.getByLabel("Project directory", { exact: true }).fill("/missing-relay-project");
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page.locator("#dialog-error")).toContainText("does not exist");
  await page.getByLabel("Project directory", { exact: true }).fill(projectRoot);
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page.locator("#terminal-name")).toHaveText("My shell");
  await expect(page.locator("#terminal-mode")).toHaveText("SHELL");
  await page.getByLabel("Find a session").fill("My shell");
  await expect(page.locator(".session-card")).toHaveCount(1);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.locator("#terminal-status")).toHaveText("Stopped");
});

test("desktop and compact layouts stay usable without horizontal overflow", async ({ page }) => {
  await page.getByRole("button", { name: "Next task" }).click();
  await expect(page.locator(".xterm-accessibility-tree")).toContainText("SIMULATED SESSION");
  mkdirSync(path.join(projectRoot, "test-artifacts"), { recursive: true });
  await page.screenshot({
    path: path.join(projectRoot, "test-artifacts/relay-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 760, height: 1100 });
  await expect(page.locator("#chat-input")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});
