import path from "node:path";
import { test as base, expect } from "@playwright/test";
import { projectRoot } from "../../src/server/app.ts";
import { testApp, waitUntil } from "../helpers.ts";

const test = base.extend<{ app: Awaited<ReturnType<typeof testApp>> }>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright fixture signature.
  app: async ({}, use) => {
    const app = await testApp(false);
    try {
      await use(app);
    } finally {
      await app.cleanup();
    }
  },
});

test("new sessions reuse saved group folders and templates with advanced settings separate", async ({
  page,
  app,
}) => {
  await page.goto(app.url);
  await page.locator("#new-session").click();
  await expect(page.locator("#session-submit")).toBeInViewport();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#session-submit")).toBeInViewport();
  await page.setViewportSize({ width: 1440, height: 950 });
  await expect(page.getByLabel("Attention detection")).not.toBeVisible();
  await page.getByText("Group and folder defaults", { exact: true }).click();
  await page.getByLabel("Group", { exact: false }).fill("Documents");
  await page.getByLabel("Project directory", { exact: true }).fill(projectRoot);
  await page.getByRole("button", { name: "Save group folder", exact: true }).click();
  await expect.poll(() => app.workspace.state.groups?.length).toBe(1);
  await page.getByLabel("Session type").selectOption("custom");
  await page.getByLabel("Executable", { exact: false }).first().fill(process.execPath);
  await page.getByLabel("Attention detection").selectOption("events");
  await page.getByText("Launch arguments and recovery", { exact: true }).click();
  await page
    .getByLabel("Arguments (JSON array)", { exact: true })
    .fill(JSON.stringify([path.join(projectRoot, "test/fixtures/terminal-worker.mjs")]));
  await page.getByText("Save these settings as a template", { exact: true }).click();
  await page.getByLabel("Template name", { exact: true }).fill("Review worker");
  await page.getByRole("button", { name: "Save template", exact: true }).click();
  await expect.poll(() => app.workspace.state.templates?.length).toBe(1);
  await page.getByLabel("Close dialog", { exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "New session in Documents", exact: true }).click();
  await expect(page.getByLabel("Project directory", { exact: true })).toHaveValue(projectRoot);
  await page.getByLabel("Create from template").selectOption({ label: "Review worker" });
  await page.getByLabel("Name", { exact: true }).fill("First review");
  await page.getByRole("button", { name: "Start session", exact: false }).click();
  await expect(page.locator(".xterm-accessibility-tree")).toContainText("WORKER_READY");
  expect(app.workspace.state.sessions[0].group).toBe("Documents");
  expect(app.workspace.state.sessions[0].conversationId).toBeUndefined();
  await page.getByRole("button", { name: "New session in Documents", exact: true }).click();
  await expect(page.getByLabel("Project directory", { exact: true })).toHaveValue(projectRoot);
  await page.getByLabel("Create from template").selectOption({ label: "Review worker" });
  await page.getByLabel("Name", { exact: true }).fill("Second review");
  await page.getByRole("button", { name: "Start session", exact: false }).click();
  await expect(page.locator(".session-card")).toHaveCount(2);
  expect(app.workspace.state.sessions[0].id).not.toBe(app.workspace.state.sessions[1].id);
});

test("Claude hooks show work in progress, completion in the queue, and a visible high priority", async ({
  page,
  app,
}) => {
  const created = await app.request("/api/sessions", {
    name: "Claude task",
    mode: "custom",
    cwd: projectRoot,
    priority: 1,
    executable: process.execPath,
    args: [path.join(projectRoot, "test/fixtures/terminal-worker.mjs")],
    attentionMode: "events",
  });
  const id = created.body.state.selectedSessionId;
  // Exercise the actual hook receiver with deterministic events, without paid inference.
  const emit = (event: unknown) =>
    app.request("/api/hook", {
      relaySessionId: id,
      runId: app.terminals.records.get(id)?.runId,
      event,
    });
  await page.goto(app.url);
  await emit({ hook_event_name: "UserPromptSubmit" });
  await expect(page.locator(`[data-session-id="${id}"] [data-status]`)).toHaveAttribute(
    "data-status",
    "working",
  );
  await expect(page.locator(".priority-badge")).toHaveText("↑ High");
  await emit({ hook_event_name: "Stop" });
  await expect(page.locator("#pending-count")).toHaveText("1");
  await expect(page.locator(".queue-card")).toContainText("Claude finished its turn");
  await expect(page.locator(`[data-session-id="${id}"] [data-status]`)).toHaveAttribute(
    "data-status",
    "waiting",
  );
  await page.locator('[data-command="next task"]').click();
  await expect(page.locator("#focus-item")).toContainText("finished its turn");
  await page.getByRole("button", { name: "Mark reviewed", exact: true }).click();
  await expect(page.locator("#terminal-status")).toHaveText("Ready for input");
});

test("switching and resizing restore a terminal border after its drawing commands leave the output ring", async ({
  page,
  app,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const created = await app.request("/api/sessions", {
    name: "Border",
    mode: "custom",
    cwd: projectRoot,
    executable: process.execPath,
    args: [path.join(projectRoot, "test/fixtures/terminal-border.mjs")],
  });
  const id = created.body.state.selectedSessionId;
  await waitUntil(() => app.terminals.output(id).includes("BORDER_READY"));
  await app.request("/api/sessions", {
    name: "Other",
    mode: "custom",
    cwd: projectRoot,
    executable: process.execPath,
    args: [path.join(projectRoot, "test/fixtures/terminal-worker.mjs")],
  });
  await page.goto(app.url);
  await expect(page.locator(".xterm-accessibility-tree")).toContainText("WORKER_READY");
  for (const width of [1400, 1700, 1300]) {
    await page.getByRole("button", { name: "Open Border", exact: true }).click();
    await expect(page.locator(".xterm-accessibility-tree")).toContainText("┌── Input ──┐");
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.locator(".xterm-accessibility-tree")).toContainText("└───────────┘");
    await page.getByRole("button", { name: "Open Other", exact: true }).click();
    await expect(page.locator(".xterm-accessibility-tree")).toContainText("WORKER_READY");
  }
});
