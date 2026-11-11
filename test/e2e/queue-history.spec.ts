import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { projectRoot } from "../../src/server/app.ts";
import { testApp } from "../helpers.ts";

async function expectBoundedQueue(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const queue = document.querySelector("#queue");
        const panel = document.querySelector(".attention-panel");
        if (!queue || !panel) throw new Error("Queue panel is missing.");
        return {
          pageFits: document.documentElement.scrollHeight <= window.innerHeight,
          panelFits: panel.getBoundingClientRect().bottom <= window.innerHeight,
          queueScrolls: queue.scrollHeight > queue.clientHeight && queue.clientHeight > 80,
        };
      }),
    )
    .toEqual({ pageFits: true, panelFits: true, queueScrolls: true });
}

test("handled history stays bounded, paginates newest first and reopens without losing records", async ({
  page,
}) => {
  const app = await testApp(false);
  try {
    const session = app.workspace.addSession({
      name: "History project",
      project: "repo",
      cwd: app.stateDir,
      mode: "custom",
      status: "stopped",
    });
    const time = Date.now() - 120000;
    for (let n = 1; n <= 61; n++) {
      app.workspace.enqueue(session.id, {
        kind: "review",
        title: `Result ${n}`,
        detail: `Completed task ${n}`,
        source: "test",
        status: "resolved",
        // Reverse creation order to verify sorting by when it was handled.
        createdAt: time - n * 1000,
        resolvedAt: time + n * 1000,
      });
    }
    // Old records without resolvedAt still have a deterministic fallback.
    delete app.workspace.state.items[0].resolvedAt;
    await page.goto(app.url);
    await page.getByRole("button", { name: "Handled", exact: true }).click();
    await expectBoundedQueue(page);
    await expect(page.locator("#queue .queue-card")).toHaveCount(20);
    await expect(page.locator("#queue .queue-open strong").first()).toHaveText("Result 61");
    await expect(page.locator("#history-range")).toHaveText("1–20 of 61");
    const previous = page.getByRole("button", { name: "Previous handled page" });
    const next = page.getByRole("button", { name: "Next handled page" });
    await expect(previous).toBeDisabled();

    await page.locator("#queue").hover();
    await page.mouse.wheel(0, 600);
    await expect
      .poll(() => page.locator("#queue").evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    await next.click();
    await expect(page.locator("#history-range")).toHaveText("21–40 of 61");
    await expect(page.locator("#queue .queue-open strong").first()).toHaveText("Result 41");
    await expect.poll(() => page.locator("#queue").evaluate((el) => el.scrollTop)).toBe(0);
    // Live snapshots must not send the reader back to page one.
    await app.request("/api/priority", { sessionId: session.id, priority: 1 });
    await expect(page.locator("#history-range")).toHaveText("21–40 of 61");
    await next.click();
    await expect(page.locator("#history-range")).toHaveText("41–60 of 61");
    await next.click();
    await expect(page.locator("#history-range")).toHaveText("61–61 of 61");
    await expect(next).toBeDisabled();
    await expect(page.locator("#queue .queue-card")).toHaveCount(1);
    await expect(page.locator("#queue .queue-open strong")).toHaveText("Result 1");
    await page.getByRole("button", { name: "Reopen", exact: true }).click();
    await expect(page.locator("#history-range")).toHaveText("41–60 of 60");
    await expect(page.locator("#queue .queue-card")).toHaveCount(20);
    await expect(page.locator("#pending-count")).toHaveText("1");
    await previous.click();
    await expect(page.locator("#history-range")).toHaveText("21–40 of 60");
    await page.getByRole("button", { name: /^Pending \d+$/ }).click();
    await expect(page.locator("#history-pagination")).toBeHidden();
    await expect(page.locator("#queue .queue-open strong")).toHaveText("Result 1");
    expect(app.workspace.state.items).toHaveLength(61);
    await page.reload();
    await page.getByRole("button", { name: "Handled", exact: true }).click();
    await expect(page.locator("#history-range")).toHaveText("1–20 of 60");

    mkdirSync(path.join(projectRoot, "test-artifacts"), { recursive: true });
    await page.screenshot({
      path: path.join(projectRoot, "test-artifacts/queue-history-desktop.png"),
      fullPage: true,
    });
    for (const height of [720, 600]) {
      await page.setViewportSize({ width: 1280, height });
      await expectBoundedQueue(page);
      await expect(next).toBeInViewport();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator(".attention-panel").scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(
      await page.locator(".attention-panel").evaluate((el) => el.getBoundingClientRect().height),
    ).toBeLessThanOrEqual(600);
    await next.click();
    await expect(page.locator("#history-range")).toHaveText("21–40 of 60");
    await page.screenshot({
      path: path.join(projectRoot, "test-artifacts/queue-history-mobile.png"),
      fullPage: true,
    });
  } finally {
    await app.cleanup();
  }
});

test("large pending and deferred queues scroll independently without hiding items", async ({
  page,
}) => {
  const app = await testApp(false);
  try {
    const session = app.workspace.addSession({
      name: "Busy project",
      project: "repo",
      cwd: app.stateDir,
      mode: "custom",
      status: "stopped",
    });
    for (let n = 0; n < 62; n++) {
      const item = app.workspace.enqueue(session.id, {
        kind: "question",
        title: `Question ${n}`,
        detail: "Needs a decision",
        source: "test",
      });
      if (n >= 31) app.workspace.snooze(item.id);
    }
    await page.goto(app.url);
    await expect(page.locator("#pending-count")).toHaveText("31");
    for (const name of [/^Pending \d+$/, /^Deferred$/]) {
      await page.getByRole("button", { name }).click();
      await expectBoundedQueue(page);
      await expect(page.locator("#queue .queue-card")).toHaveCount(31);
      await expect(page.locator("#history-pagination")).toBeHidden();
    }
    await page.getByRole("button", { name: "Handled", exact: true }).click();
    await expect(page.locator("#queue")).toContainText("Nothing here yet.");
    await expect(page.locator("#history-pagination")).toBeHidden();
  } finally {
    await app.cleanup();
  }
});
