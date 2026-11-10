import path from "node:path";
import { expect, test } from "@playwright/test";
import { projectRoot } from "../../src/server/app.ts";
import { testApp, waitUntil } from "../helpers.ts";

test("a delayed HTTP snapshot cannot replace the newer process-exit state", async ({ page }) => {
  const app = await testApp(false);
  try {
    const created = await app.request("/api/sessions", {
      name: "Ordering worker",
      cwd: projectRoot,
      mode: "custom",
      executable: process.execPath,
      args: [path.join(projectRoot, "test/fixtures/terminal-worker.mjs")],
      attentionMode: "manual",
    });
    const id = created.body.state.selectedSessionId;
    await waitUntil(() => app.terminals.output(id).includes("WORKER_READY"));
    await page.goto(app.url);
    await expect(page.locator("#terminal-status")).toHaveText("Running");
    const older = (await app.request("/api/state")).body;
    await page.route("**/api/stop", async (route) => {
      const response = await route.fetch();
      await waitUntil(() => !app.terminals.records.has(id));
      await expect(page.locator("#terminal-status")).toHaveText("Stopped");
      await route.fulfill({ response, body: JSON.stringify(older) });
    });
    // Await the UI's request handler, including its attempted render of the late
    // response, so an assertion cannot pass before that response is consumed.
    const afterResponse = await page.evaluate(async (sessionId) => {
      await (globalThis as any).api("/api/stop", { sessionId });
      return document.querySelector("#terminal-status")?.textContent;
    }, id);
    expect(afterResponse).toBe("Stopped");
    await expect(page.locator("#terminal-status")).toHaveText("Stopped");
    await expect(page.getByRole("button", { name: "Start", exact: true })).toBeEnabled();
  } finally {
    await app.cleanup();
  }
});
