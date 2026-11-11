import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { projectRoot } from "../../src/server/app.ts";
import { testApp } from "../helpers.ts";

test("session badges distinguish work, input, approval, review and open terminals at a glance", async ({
  page,
}) => {
  const app = await testApp(false);
  try {
    const sessions: string[] = [];
    for (const name of [
      "Implement payments",
      "QC test ride",
      "PR review",
      "Deploy permission",
      "Finished review",
      "Terminal",
    ]) {
      const result = await app.request("/api/sessions", {
        name,
        cwd: app.stateDir,
        mode: "custom",
        executable: process.execPath,
        args: [path.join(projectRoot, "test/fixtures/terminal-worker.mjs")],
        attentionMode: "events",
        priority: 2,
        group: "Work",
      });
      sessions.push(result.body.state.selectedSessionId);
    }
    let number = 0;
    const emit = (index: number, type: string) =>
      app.request("/api/events", {
        sessionId: sessions[index],
        runId: app.terminals.records.get(sessions[index])?.runId,
        event: { eventId: `status-${number++}`, type, text: `Fixture ${type}` },
      });
    await emit(0, "working");
    await emit(1, "question");
    await emit(2, "review");
    await emit(3, "approval");
    await emit(4, "review");
    const idleItem = app.workspace.state.items.find((item) => item.sessionId === sessions[4]);
    await app.request("/api/item", { id: idleItem?.id, action: "resolve" });
    await page.setViewportSize({ width: 1440, height: 1200 });
    await page.goto(app.url);
    const labels = [
      "Working",
      "Waiting for input",
      "Ready to review",
      "Approval needed",
      "Idle · ready",
      "Session open",
    ];
    const colors = [];
    for (const [index, id] of sessions.entries()) {
      const card = page.locator(`[data-session-id="${id}"]`);
      await expect(card.locator(".state-label")).toHaveText(labels[index]);
      await expect(card.locator(".session-open")).toHaveAttribute(
        "aria-describedby",
        `state-${id}`,
      );
      const badge = card.locator(".session-state");
      expect(
        await badge.evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
      ).toBeGreaterThanOrEqual(12);
      if (index < 4)
        colors.push(await badge.evaluate((element) => getComputedStyle(element).backgroundColor));
    }
    expect(new Set(colors).size).toBe(4);
    const working = page.locator(`[data-session-id="${sessions[0]}"]`);
    const border = await working.evaluate((element) => getComputedStyle(element).borderLeftColor);
    await app.request("/api/priority", { sessionId: sessions[0], priority: 1 });
    await expect(working.locator(".priority-badge")).toHaveText("↑ High");
    expect(await working.evaluate((element) => getComputedStyle(element).borderLeftColor)).toBe(
      border,
    );
    await page.getByRole("button", { name: "Open QC test ride", exact: true }).click();
    await expect(page.locator("#terminal-status")).toHaveText("Waiting for input");
    await expect(page.locator(`[data-session-id="${sessions[1]}"] .state-count`)).toHaveAttribute(
      "aria-label",
      "1 pending attention item",
    );
    mkdirSync(path.join(projectRoot, "test-artifacts"), { recursive: true });
    await page.screenshot({
      path: path.join(projectRoot, "test-artifacts/session-states.png"),
      fullPage: true,
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await working
        .locator(".state-icon")
        .evaluate((element) => getComputedStyle(element).animationName),
    ).toBe("none");
    await page.getByRole("button", { name: "Mark handled", exact: true }).first().click();
    await expect(page.locator("#terminal-status")).toHaveText("Idle · ready");
    await emit(1, "working");
    await expect(page.locator("#terminal-status")).toHaveText("Working");
    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent("relay-set-layout", { detail: { sessions: 170 } })),
    );
    expect(
      await working
        .locator(".session-state")
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  } finally {
    await app.cleanup();
  }
});
