import { expect, test } from "@playwright/test";
import { testApp } from "../helpers.ts";

test("snapshot metadata and model text render literally without injecting markup", async ({
  page,
}) => {
  const app = await testApp(false);
  try {
    const session = app.workspace.addSession({
      name: "Rendering",
      project: "repo",
      cwd: ".",
      mode: "custom",
      status: "stopped",
    });
    const item = app.workspace.enqueue(session.id, {
      kind: "review",
      title: "Result",
      detail: "Response",
      source: "turn-result",
    });
    app.workspace.selectItem(item.id);
    await page.goto(app.url);
    await expect(page.locator("#connection")).toContainText("Connected");
    const data = (await app.request("/api/state")).body;
    const attack =
      '"><img data-injected="true" src="x" onerror="window.injected=true"><span title="';
    data.revision += 1000;
    data.state.sessions[0].name = attack;
    data.state.sessions[0].priority = attack;
    data.sessionStatuses[session.id].code = attack;
    data.state.messages = [{ role: attack, text: attack, at: Date.now() }];
    for (const entry of [data.state.items[0], data.queue[0]]) {
      entry.id = attack;
      entry.title = attack;
      entry.detail = attack;
      entry.kind = attack;
      entry.priority = attack;
    }
    data.state.selectedItemId = attack;
    await page.evaluate((snapshot) => (globalThis as any).render(snapshot), data);
    await expect(page.locator("[data-injected]")).toHaveCount(0);
    await expect(page.locator("#messages")).toContainText(attack);
    await expect(page.locator("#focus-item pre")).toHaveText(attack);
    await expect(page.locator("#classify-item")).toHaveAttribute("data-id", attack);
    expect(await page.evaluate(() => (globalThis as any).injected)).toBeUndefined();
  } finally {
    await app.cleanup();
  }
});
