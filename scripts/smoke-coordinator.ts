// Opt-in paid inference: two coordinator turns and one tiny worker task.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { stripVTControlCharacters } from "node:util";
import { createApp, projectRoot } from "../src/server/app.ts";
import { findExecutable } from "../src/server/profiles.ts";
import { removeTemporary, temporaryDirectory, waitUntil } from "../test/helpers.ts";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const { chromium } = await import("@playwright/test");
const executable = findExecutable("codex");
if (!executable) throw new Error("Install and authenticate Codex before this opt-in check.");
const directory = temporaryDirectory();
const app = await createApp({ stateDir: directory, demo: false });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
let workerId = "";
try {
  app.workspace.state.settings = {
    retireAfterDays: 0,
    coordinator: { provider: "codex", executable, defaultCwd: projectRoot, defaultMode: "codex" },
  };
  const existing = app.workspace.addSession({
    name: "Billing recovery",
    project: "Zyi",
    cwd: projectRoot,
    mode: "codex",
    status: "stopped",
    notes: "Investigating payment retries after network failures.",
  });
  await page.goto(app.url);
  await page.locator("#connection").filter({ hasText: "Connected" }).waitFor();
  await page
    .getByLabel("Coordinator command")
    .fill(
      "Please open the session investigating payment retries. Only open its saved view; do not start a process.",
    );
  await page.getByRole("button", { name: "Send command" }).click();
  await waitUntil(
    () =>
      app.workspace.state.coordinatorRequests?.[0]?.status !== undefined &&
      app.workspace.state.coordinatorRequests[0].status !== "running",
    180000,
  );
  assert.equal(
    app.workspace.state.coordinatorRequests?.[0].status,
    "done",
    app.workspace.state.messages.at(-1)?.text,
  );
  assert.equal(app.workspace.state.selectedSessionId, existing.id);
  assert.equal(app.terminals.records.size, 0);
  console.log("Live coordinator selected the semantically matching session without starting it.");
  await page
    .getByLabel("Coordinator command")
    .fill(
      `Create a new Codex session named Coordinator live worker in ${projectRoot}, P2. Its entire task is: reply with the concatenation of RELAY_, AGENT_, WORKER_, and OK. Do not use tools or change files. Start it now with that task.`,
    );
  await page.getByRole("button", { name: "Send command" }).click();
  await waitUntil(
    () =>
      app.workspace.state.coordinatorRequests?.[1]?.status !== undefined &&
      app.workspace.state.coordinatorRequests[1].status !== "running",
    180000,
  );
  assert.equal(
    app.workspace.state.coordinatorRequests?.[1].status,
    "done",
    app.workspace.state.messages.at(-1)?.text,
  );
  assert.equal(app.workspace.state.sessions.length, 2);
  const worker = app.workspace.state.sessions.find((s) => s.id !== existing.id);
  assert.ok(worker?.initialPrompt);
  workerId = worker.id;
  console.log(
    "Live coordinator created a worker and passed its initial task. Waiting for its response.",
  );
  await waitUntil(() => {
    const output = stripVTControlCharacters(app.terminals.output(workerId));
    if (output.includes("Trust this folder?"))
      throw new Error("Complete repository trust in Codex before this opt-in check.");
    if (!app.terminals.records.has(workerId)) throw new Error(`Worker exited: ${output}`);
    return output.includes("RELAY_AGENT_WORKER_OK");
  }, 120000);
  await page.reload();
  await page.locator("#connection").filter({ hasText: "Connected" }).waitFor();
  console.log(
    "PASS: actual coordinator inference, semantic navigation, worker creation, task delivery, and real worker response.",
  );
} finally {
  mkdirSync(path.join(projectRoot, "test-artifacts"), { recursive: true });
  await page.screenshot({
    path: path.join(projectRoot, "test-artifacts/coordinator-live.png"),
    fullPage: true,
  });
  writeFileSync(
    path.join(projectRoot, "test-artifacts/coordinator-live.log"),
    JSON.stringify(
      {
        messages: app.workspace.state.messages,
        terminal: stripVTControlCharacters(app.terminals.output(workerId)),
      },
      null,
      2,
    ),
  );
  await browser.close();
  await app.close();
  removeTemporary(directory);
}
