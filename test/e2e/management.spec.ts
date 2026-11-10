import path from "node:path";
import { test as base, expect } from "@playwright/test";
import { projectRoot } from "../../src/server/app.ts";
import { fixtureCli, testApp, waitUntil } from "../helpers.ts";

const test = base.extend<{ app: Awaited<ReturnType<typeof testApp>> }>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright fixture signature.
  app: async ({}, use) => {
    let turns = 0;
    const app = await testApp(false, {
      coordinatorRunner: async () => {
        turns++;
        if (turns === 1) return { message: "Which project directory should I use?", actions: [] };
        if (turns === 2)
          return {
            message: "Starting your requested investigation.",
            actions: [
              {
                kind: "create",
                name: "Retry investigation",
                cwd: projectRoot,
                mode: "codex",
                task: "Investigate payment retries",
                priority: 2,
              },
            ],
          };
        return {
          message: "Opening the retry investigation.",
          actions: [
            {
              kind: "open",
              sessionId: app.workspace.state.sessions.find((s) => s.name === "Retry investigation")
                ?.id,
            },
          ],
        };
      },
    });
    const executable = fixtureCli(
      app.stateDir,
      path.join(projectRoot, "test/fixtures/terminal-worker.mjs"),
    );
    await app.request("/api/settings", { coordinator: { provider: "codex", executable } });
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
async function worker(app: Awaited<ReturnType<typeof testApp>>, name: string) {
  const response = await app.request("/api/sessions", {
    name,
    cwd: projectRoot,
    mode: "custom",
    executable: process.execPath,
    args: [path.join(projectRoot, "test/fixtures/terminal-worker.mjs")],
    attentionMode: "manual",
  });
  const id = response.body.state.selectedSessionId;
  await waitUntil(() => app.terminals.output(id).includes("WORKER_READY"));
  return id;
}

test("sidebar offers pin, group, ordering, archive with pending work, restore and explicit deletion", async ({
  page,
  app,
}) => {
  const alpha = await worker(app, "Alpha");
  const beta = await worker(app, "Beta");
  await page.getByLabel("Actions for Beta").click();
  await page.getByRole("button", { name: "Pin to top", exact: true }).click();
  await expect(page.locator(".session-card").first()).toHaveAttribute("data-session-id", beta);
  await page.getByLabel("Actions for Beta").click();
  await page.getByRole("button", { name: "Unpin", exact: true }).click();
  await page
    .locator(`[data-session-id="${beta}"]`)
    .dragTo(page.locator(`[data-session-id="${alpha}"]`));
  await expect(page.locator(".session-card").first()).toHaveAttribute("data-session-id", beta);
  await page.getByLabel("Actions for Alpha").click();
  await page.getByRole("button", { name: "Rename / edit group" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Alpha renamed");
  await page.locator("#session-form").getByLabel("Group", { exact: false }).fill("Client work");
  await page.getByRole("button", { name: "Save session" }).click();
  await page.reload();
  await expect(page.locator(".session-group h3")).toContainText(["Ungrouped", "Client work"]);
  await app.request("/api/attention", {
    sessionId: alpha,
    kind: "question",
    text: "Keep this request",
  });
  await page.getByLabel("Actions for Alpha renamed").click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Stop & archive", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open Alpha renamed", exact: true })).toHaveCount(
    0,
  );
  await expect(page.locator("#pending-count")).toHaveText("1");
  await page.getByLabel("Show archived sessions").check();
  await page.getByLabel("Actions for Alpha renamed").click();
  await page.getByRole("button", { name: "restore", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeEnabled();
  await page.getByLabel("Actions for Alpha renamed").click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete saved session…", exact: true }).click();
  await expect(page.locator(".session-card")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Open Beta", exact: true })).toBeVisible();
  await expect(page.locator("#pending-count")).toHaveText("0");
});

test("a live generic CLI shows running, attention, and stopped with distinct status indicators", async ({
  page,
  app,
}) => {
  const id = await worker(app, "Status check");
  const dot = page.locator(`[data-session-id="${id}"] .status-dot`);
  await expect(dot).toHaveAttribute("aria-label", "Running");
  const runningColor = await dot.evaluate((element) => getComputedStyle(element).backgroundColor);
  await app.request("/api/attention", { sessionId: id, kind: "question", text: "Need input" });
  await expect(dot).toHaveAttribute("aria-label", "Needs attention");
  await page.getByLabel("Actions for Status check").click();
  await page.getByRole("button", { name: "Stop terminal", exact: true }).click();
  await expect(dot).toHaveAttribute("aria-label", "Stopped");
  const stoppedColor = await dot.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(stoppedColor).not.toEqual(runningColor);
});

test("coordinator chat clarifies, starts a requested task, and opens an existing session by intent", async ({
  page,
}) => {
  await page.getByLabel("Coordinator command").fill("Start a task to investigate payment retries");
  await page.getByRole("button", { name: "Send command" }).click();
  await expect(page.locator("#messages")).toContainText("Which project directory");
  await page.getByLabel("Coordinator command").fill(`Use ${projectRoot}`);
  await page.getByRole("button", { name: "Send command" }).click();
  await expect(page.getByRole("button", { name: "Open Retry investigation" })).toBeVisible();
  await expect(page.locator(".xterm-accessibility-tree")).toContainText(
    "Investigate payment retries",
  );
  await expect(page.locator("#messages")).toContainText("Created and started");
  await page.getByLabel("Coordinator command").fill("Take me back to the retries issue");
  await page.getByRole("button", { name: "Send command" }).click();
  await expect(page.locator("#messages")).toContainText("Opening the retry investigation");
  await expect(page.locator(".session-card")).toHaveCount(1);
  await page.reload();
  await expect(page.locator("#messages")).toContainText("Which project directory");
});

test("panel dividers resize by dragging and keyboard, persist, and reset without breaking mobile", async ({
  page,
}) => {
  const sidebar = page.locator(".sessions-panel"),
    coordinator = page.locator(".coordinator-panel");
  const initial = await sidebar.boundingBox();
  const handle = await page.getByRole("separator", { name: "Resize sessions panel" }).boundingBox();
  if (!initial || !handle) throw new Error("Missing layout bounds");
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 100);
  await page.mouse.down();
  await page.mouse.move(handle.x + 85, handle.y + 100, { steps: 8 });
  await page.mouse.up();
  expect((await sidebar.boundingBox())?.width).toBeGreaterThan(initial.width + 60);
  const attention = page.getByRole("separator", { name: "Resize attention panel" });
  await attention.focus();
  const oldWidth = Number(await attention.getAttribute("aria-valuenow"));
  await page.keyboard.press("ArrowRight");
  expect(Number(await attention.getAttribute("aria-valuenow"))).toBeGreaterThan(oldWidth);
  const beforeChat = await coordinator.boundingBox();
  const horizontal = await page
    .getByRole("separator", { name: "Resize coordinator and terminal" })
    .boundingBox();
  if (!beforeChat || !horizontal) throw new Error("Missing horizontal bounds");
  await page.mouse.move(horizontal.x + 40, horizontal.y + 3);
  await page.mouse.down();
  await page.mouse.move(horizontal.x + 40, horizontal.y + 75, { steps: 8 });
  await page.mouse.up();
  expect((await coordinator.boundingBox())?.height).toBeGreaterThan(beforeChat.height + 40);
  const savedWidth = (await sidebar.boundingBox())?.width;
  await page.reload();
  expect((await sidebar.boundingBox())?.width).toEqual(savedWidth);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Reset panel sizes" }).click();
  await page.getByRole("button", { name: "Close settings" }).click();
  expect((await sidebar.boundingBox())?.width).toEqual(initial.width);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole("separator", { name: "Resize sessions panel" })).toBeHidden();
});
