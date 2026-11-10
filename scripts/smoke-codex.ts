// Opt-in live acceptance. Uses the installed Codex account and two small model turns.
// It is intentionally excluded from automated CI and npm run verify.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { stripVTControlCharacters } from "node:util";
import { createApp, projectRoot } from "../src/server/app.ts";
import { findExecutable } from "../src/server/profiles.ts";
import { removeTemporary, temporaryDirectory } from "../test/helpers.ts";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const { chromium } = await import("@playwright/test");
const executable = findExecutable("codex");
if (!executable) throw new Error("Install Codex CLI and sign in before running this opt-in check.");
const directory = temporaryDirectory();
const app = await createApp({ stateDir: directory, demo: false });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
let sessionId = "";
try {
  await page.goto(app.url);
  const response = await fetch(`${app.address}/api/sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${app.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Codex live acceptance",
      cwd: projectRoot,
      mode: "codex",
      executable,
      attentionMode: "quiet",
      quietSeconds: 3,
      args: [
        "--sandbox",
        "read-only",
        "--ask-for-approval",
        "never",
        "--no-daemon",
        "This is a terminal integration check. Reply with the concatenation of RELAY_, CODEX_, SMOKE_, and OK. Do not use tools or change any files.",
      ],
    }),
  });
  const result = await response.json();
  assert.equal(response.status, 200, result.error);
  sessionId = result.state.selectedSessionId;
  console.log("Codex started in a managed PTY. Waiting for its response.");
  const start = Date.now();
  let trusted = false;
  while (
    !stripVTControlCharacters(app.terminals.output(sessionId)).includes("RELAY_CODEX_SMOKE_OK")
  ) {
    const output = stripVTControlCharacters(app.terminals.output(sessionId));
    if (
      !trusted &&
      output.includes("Trust this folder?") &&
      output.includes("Trust and continue")
    ) {
      if (!process.argv.includes("--trust-project"))
        throw new Error(
          "Codex needs repository trust. Complete initial setup in Codex, or rerun this explicit check with --trust-project after reviewing this repository.",
        );
      app.terminals.write(sessionId, "\r");
      trusted = true;
      console.log("Accepted folder trust for the Zyi repository used by this check.");
    }
    if (!app.terminals.records.has(sessionId)) throw new Error("Codex exited before answering.");
    if (Date.now() - start > 120000)
      throw new Error(
        "No expected response after two minutes. Check authentication or the saved terminal screenshot.",
      );
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  // A reload reconnects to the same actual agent process.
  const pid = app.terminals.records.get(sessionId)?.process.pid;
  await page.reload();
  await page.locator("#connection").filter({ hasText: "Connected" }).waitFor();
  assert.equal(app.terminals.records.get(sessionId)?.process.pid, pid);
  await page.getByRole("button", { name: "Reply…", exact: true }).click();
  await page
    .getByLabel("Your message")
    .fill(
      "For the follow-up routing check, reply with the concatenation of RELAY_, FOLLOWUP_, and OK. Do not use tools.",
    );
  await page.getByRole("button", { name: "Send to terminal", exact: true }).click();
  const replyDeadline = Date.now() + 60000;
  while (!stripVTControlCharacters(app.terminals.output(sessionId)).includes("RELAY_FOLLOWUP_OK")) {
    if (Date.now() > replyDeadline)
      throw new Error("The explicit reply did not produce its expected response.");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const queueDeadline = Date.now() + 15000;
  while (
    !app.workspace.queue().some((item) => item.sessionId === sessionId) &&
    Date.now() < queueDeadline
  )
    await new Promise((resolve) => setTimeout(resolve, 250));
  assert.ok(
    app.workspace.queue().some((item) => item.sessionId === sessionId && item.kind === "activity"),
    "Quiet suggestion reaches the attention queue.",
  );
  console.log(
    "PASS: actual Codex responses, explicit reply routing, browser reconnect, and generic attention queue.",
  );
} finally {
  mkdirSync(path.join(projectRoot, "test-artifacts"), { recursive: true });
  await page.screenshot({
    path: path.join(projectRoot, "test-artifacts/codex-live.png"),
    fullPage: true,
  });
  writeFileSync(
    path.join(projectRoot, "test-artifacts/codex-live.log"),
    sessionId ? stripVTControlCharacters(app.terminals.output(sessionId)) : "No session started",
  );
  await browser.close();
  await app.close();
  removeTemporary(directory);
}
