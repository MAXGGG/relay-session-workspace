import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { projectRoot } from "../../src/server/app.ts";
import type { CoordinatorAction } from "../../src/server/coordinator-agent.ts";
import { coordinatorFlows } from "../../src/server/coordinator-ui.ts";
import { testApp } from "../helpers.ts";

declare const coordinatorUiHandlers: Record<string, unknown>;

async function setup(page: Page) {
  let actions: CoordinatorAction[] = [];
  const app = await testApp(false, {
    coordinatorRunner: async () => ({ message: "Preparing the requested workflow.", actions }),
  });
  const first = app.workspace.addSession({
    name: "Alpha",
    project: "repo",
    cwd: app.stateDir,
    mode: "custom",
    status: "stopped",
  });
  const second = app.workspace.addSession({
    name: "Beta",
    project: "repo",
    cwd: app.stateDir,
    mode: "custom",
    status: "stopped",
  });
  await page.goto(app.url);
  await expect(page.locator("#connection")).toContainText("Connected");
  const ask = async (next: CoordinatorAction[]) => {
    actions = next;
    await page
      .getByLabel("Coordinator command")
      .fill(`Requested workflow ${next[0].flow ?? next[0].kind}`);
    await page.getByRole("button", { name: "Send command" }).click();
    await expect(page.locator("#chat-send")).toBeEnabled();
  };
  return { app, first, second, ask };
}

test("coordinator prepares settings, folder defaults and templates through the existing forms", async ({
  page,
}) => {
  const { app, first, ask } = await setup(page);
  try {
    const handlers = await page.evaluate(() => Object.keys(coordinatorUiHandlers));
    expect(handlers.sort()).toEqual(Object.keys(coordinatorFlows).sort());
    await ask([
      {
        kind: "ui",
        flow: "settings",
        fields: [
          { name: "retireAfterDays", value: "14" },
          { name: "coordinatorModel", value: "example-model" },
        ],
      },
    ]);
    await expect(page.locator("#settings-dialog")).toBeVisible();
    await expect(page.locator("#settings-form [name=coordinatorModel]")).toBeVisible();
    expect(app.workspace.state.settings?.retireAfterDays).toBe(0);
    await page.getByRole("button", { name: "Save settings" }).click();
    expect(app.workspace.state.settings?.retireAfterDays).toBe(14);
    expect(app.workspace.state.settings?.coordinator?.model).toBe("example-model");
    await ask([
      {
        kind: "ui",
        flow: "saved-folder",
        fields: [
          { name: "group", value: "Work" },
          { name: "cwd", value: app.stateDir },
        ],
      },
    ]);
    await page.getByRole("button", { name: "Save group folder" }).click();
    expect(app.workspace.state.groups).toEqual([{ name: "Work", cwd: app.stateDir }]);
    await page.getByLabel("Close dialog", { exact: true }).click();
    await ask([
      {
        kind: "ui",
        flow: "templates",
        fields: [
          { name: "templateName", value: "Fixture template" },
          { name: "mode", value: "custom" },
          { name: "executable", value: process.execPath },
          {
            name: "args",
            value: JSON.stringify([path.join(projectRoot, "test/fixtures/terminal-worker.mjs")]),
          },
        ],
      },
    ]);
    await page.getByRole("button", { name: "Save template", exact: true }).click();
    const template = app.workspace.state.templates?.[0];
    expect(template?.name).toBe("Fixture template");
    await page.getByLabel("Close dialog", { exact: true }).click();
    await ask([
      {
        kind: "ui",
        flow: "new-session",
        fields: [
          { name: "name", value: "From coordinator" },
          { name: "templateId", value: template?.id ?? "" },
          { name: "group", value: "Work" },
        ],
      },
    ]);
    expect(app.workspace.state.sessions).toHaveLength(2);
    await expect(page.locator("#session-form [name=cwd]")).toHaveValue(app.stateDir);
    await page.getByRole("button", { name: "Start session", exact: false }).click();
    await expect(page.locator(".xterm-accessibility-tree")).toContainText("WORKER_READY");
    const id = app.workspace.state.selectedSessionId;
    expect(id).not.toBe(first.id);
    await ask([
      {
        kind: "ui",
        flow: "edit-session",
        sessionId: first.id,
        fields: [
          { name: "notes", value: "Only Alpha changes" },
          { name: "priority", value: "1" },
        ],
      },
    ]);
    await page.getByRole("button", { name: "Save session", exact: true }).click();
    await expect(page.locator("#session-dialog")).toBeHidden();
    expect(first.notes).toBe("Only Alpha changes");
    expect(first.priority).toBe(1);
    expect(app.workspace.session(id ?? "").notes).not.toBe("Only Alpha changes");
    await page.reload();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
  } finally {
    await app.cleanup();
  }
});

test("coordinator reaches history, search, layout, output and deletion without changing the target", async ({
  page,
}) => {
  const { app, first, second, ask } = await setup(page);
  try {
    for (let n = 0; n < 41; n++) {
      const item = app.workspace.enqueue(first.id, {
        kind: "review",
        title: `History ${n}`,
        detail: "Saved result",
        source: "test",
      });
      app.workspace.resolve(item.id);
    }
    await ask([
      {
        kind: "ui",
        flow: "queue",
        fields: [
          { name: "filter", value: "resolved" },
          { name: "page", value: "2" },
        ],
      },
    ]);
    await expect(page.locator("#history-range")).toHaveText("21–40 of 41");
    await ask([
      {
        kind: "ui",
        flow: "search-sessions",
        fields: [
          { name: "query", value: "Beta" },
          { name: "showArchived", value: "true" },
        ],
      },
    ]);
    await expect(page.locator(".session-card")).toHaveCount(1);
    await expect(page.locator(".session-card")).toContainText("Beta");
    await ask([
      {
        kind: "ui",
        flow: "layout",
        fields: [
          { name: "sessions", value: "300" },
          { name: "attention", value: "360" },
          { name: "chat", value: "0.3" },
        ],
      },
    ]);
    expect(
      await page.locator(".sessions-panel").evaluate((el) => el.getBoundingClientRect().width),
    ).toBe(300);
    await ask([{ kind: "ui", flow: "layout" }]);
    expect(
      await page.locator(".sessions-panel").evaluate((el) => el.getBoundingClientRect().width),
    ).toBe(222);
    const download = page.waitForEvent("download");
    await ask([{ kind: "ui", flow: "save-output", sessionId: first.id }]);
    expect((await download).suggestedFilename()).toBe(`${first.id}.log`);
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain("Alpha");
      await dialog.dismiss();
    });
    await ask([{ kind: "ui", flow: "delete-session", sessionId: first.id }]);
    expect(app.workspace.state.sessions).toHaveLength(2);
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain("Alpha");
      await dialog.accept();
    });
    await ask([{ kind: "ui", flow: "delete-session", sessionId: first.id }]);
    expect(app.workspace.state.sessions.map((s) => s.id)).toEqual([second.id]);
  } finally {
    await app.cleanup();
  }
});

test("a delayed coordinator workflow preserves an unsaved form and can be opened after closing it", async ({
  page,
}) => {
  let finish: (value: unknown) => void = () => {};
  const app = await testApp(false, {
    coordinatorRunner: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  try {
    await page.goto(app.url);
    await page.getByLabel("Coordinator command").fill("Open settings");
    await page.getByRole("button", { name: "Send command" }).click();
    await expect(page.locator("#chat-send")).toBeDisabled();
    await page.getByRole("button", { name: "New session", exact: false }).click();
    await page.getByLabel("Name", { exact: true }).fill("Unsaved draft");
    finish({ message: "Settings prepared", actions: [{ kind: "ui", flow: "settings" }] });
    await expect(page.locator("#chat-send")).toBeEnabled();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Unsaved draft");
    await expect(page.locator("#settings-dialog")).toBeHidden();
    await page.getByLabel("Close dialog", { exact: true }).click();
    await page.getByRole("button", { name: "Open requested app workflow" }).click();
    await expect(page.locator("#settings-dialog")).toBeVisible();
    mkdirSync(path.join(projectRoot, "test-artifacts"), { recursive: true });
    await page.screenshot({
      path: path.join(projectRoot, "test-artifacts/coordinator-workflow.png"),
      fullPage: true,
    });
  } finally {
    await app.cleanup();
  }
});
