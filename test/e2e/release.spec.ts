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
test.beforeEach(async ({ page, app }) => {
  await page.goto(app.url);
  await expect(page.locator("#connection")).toContainText("Connected");
});
async function worker(app: Awaited<ReturnType<typeof testApp>>, name: string) {
  const result = await app.request("/api/sessions", {
    name,
    cwd: projectRoot,
    mode: "custom",
    executable: process.execPath,
    args: [path.join(projectRoot, "test/fixtures/terminal-worker.mjs")],
    attentionMode: "events",
  });
  const id = result.body.state.selectedSessionId;
  await waitUntil(() => app.terminals.output(id).includes("WORKER_READY"));
  return id;
}

test("empty onboarding launches a custom CLI and saves editable task notes", async ({ page }) => {
  await expect(page.locator("#sessions")).toContainText("first CLI session");
  await page.getByRole("button", { name: "New session" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Local worker");
  await page.getByLabel("Project directory", { exact: true }).fill(projectRoot);
  await page.getByLabel("Session type").selectOption("custom");
  await page
    .locator("#session-form")
    .getByLabel("Executable", { exact: false })
    .fill(process.execPath);
  await page.getByLabel("Attention detection").selectOption("events");
  await page.getByText("Launch arguments and recovery", { exact: true }).click();
  await page
    .getByLabel("Arguments (JSON array)", { exact: true })
    .fill(JSON.stringify([path.join(projectRoot, "test/fixtures/terminal-worker.mjs")]));
  await page.getByLabel("Task notes").fill("Next: verify routing");
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page.locator(".xterm-accessibility-tree")).toContainText("WORKER_READY");
  await expect(page.locator("#session-note")).toHaveText("Next: verify routing");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Renamed worker");
  await page.getByRole("button", { name: "Save session" }).click();
  await page.reload();
  await expect(page.locator("#terminal-name")).toHaveText("Renamed worker");
  await page.getByLabel("Find a session").fill("verify routing");
  await expect(page.locator(".session-card")).toHaveCount(1);
});

test("coordinator prepares a reply with a fixed visible target, then sends only after confirmation", async ({
  page,
  app,
}) => {
  const a = await worker(app, "Alpha");
  const b = await worker(app, "Beta");
  await page.getByLabel("Coordinator command").fill("reply to Alpha: use option B");
  await page.getByRole("button", { name: "Send command" }).click();
  await expect(page.locator("#reply-dialog")).toBeVisible();
  await expect(page.locator("#reply-target")).toContainText(a);
  expect(app.terminals.output(a)).not.toContain("use option B");
  // A background selection change must not redirect a draft already being reviewed.
  await app.request("/api/select", { sessionId: b });
  await page.getByRole("button", { name: "Send to terminal" }).click();
  await expect(page.locator("#reply-dialog")).not.toBeVisible();
  await expect.poll(() => app.terminals.output(a)).toContain('RECEIVED:"use option B"');
  expect(app.terminals.output(b)).not.toContain("use option B");
  await page.reload();
  await expect(page.locator("#connection")).toContainText("Connected");
  await expect(page.locator("#reply-dialog")).not.toBeVisible();
});

test("attention details, classification, reopen, archive and restore preserve work", async ({
  page,
  app,
}) => {
  const id = await worker(app, "Lifecycle");
  await page.getByRole("button", { name: "Add to queue" }).click();
  await page
    .getByLabel("Details", { exact: true })
    .fill("First line\nImportant second line with <literal> text");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.getByRole("button", { name: "Next task" }).click();
  await expect(page.locator("#focus-item pre")).toContainText("<literal>");
  await page.getByLabel("Classify as").selectOption("review");
  await page.getByRole("button", { name: "Mark reviewed", exact: true }).click();
  await page.getByRole("button", { name: "Handled", exact: true }).click();
  await page.getByRole("button", { name: "Reopen", exact: true }).click();
  await page.getByRole("button", { name: /Pending/ }).click();
  await expect(page.locator("#pending-count")).toHaveText("1");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.locator("#terminal-status")).toHaveText("Stopped");
  await waitUntil(() => !app.terminals.records.has(id));
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(page.locator(".session-card")).toHaveCount(0);
  await expect(page.locator("#pending-count")).toHaveText("1");
  await page.getByRole("button", { name: "Mark reviewed", exact: true }).click();
  await expect(page.locator(".session-card")).toHaveCount(0);
  await page.getByLabel("Show archived sessions").check();
  await page.getByRole("button", { name: "Open Lifecycle" }).click();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeEnabled();
  await expect(page.locator(".xterm-accessibility-tree")).toContainText("WORKER_READY");
});

test("browser reconnect keeps the same terminal process and restores its output", async ({
  page,
  app,
}) => {
  const id = await worker(app, "Reconnect");
  const pid = app.terminals.records.get(id)?.process.pid;
  app.terminals.write(id, "reconnect-marker\r");
  await expect(page.locator(".xterm-accessibility-tree")).toContainText("reconnect-marker");
  await page.goto("about:blank");
  expect(app.terminals.records.get(id)?.process.pid).toBe(pid);
  await page.goto(app.url);
  await expect(page.locator(".xterm-accessibility-tree")).toContainText("reconnect-marker");
  expect(app.terminals.records.get(id)?.process.pid).toBe(pid);
});

test("retirement settings persist and narrow layouts have no overflow", async ({ page }) => {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Archive inactive stopped sessions after (days)").fill("14");
  await page.getByRole("button", { name: "Save settings" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Archive inactive stopped sessions after (days)")).toHaveValue("14");
  await page.getByLabel("Close settings").click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({
    path: path.join(projectRoot, "test-artifacts/relay-mobile.png"),
    fullPage: true,
  });
});
