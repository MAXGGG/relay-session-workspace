import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { projectRoot } from "../../src/server/app.ts";
import { testApp } from "../helpers.ts";

test("the installed Claude bridge delivers large Unicode completions and empty Stop events", async () => {
  const app = await testApp(false);
  try {
    const result = await app.request("/api/sessions", {
      name: "Bridge",
      cwd: projectRoot,
      mode: "custom",
      executable: process.execPath,
      args: [path.join(projectRoot, "test/fixtures/terminal-worker.mjs")],
      attentionMode: "events",
    });
    const id = result.body.state.selectedSessionId;
    const runId = app.terminals.records.get(id)?.runId;
    const emit = async (event: unknown) => {
      const child = spawn(process.execPath, [path.join(projectRoot, "scripts/claude-hook.mjs")], {
        env: {
          ...process.env,
          RELAY_HOOK_URL: `${app.address}/api/hook`,
          RELAY_TOKEN: app.token,
          RELAY_SESSION_ID: id,
          RELAY_RUN_ID: runId,
        },
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
      child.stdin.end(JSON.stringify(event));
      await new Promise<void>((resolve, reject) => {
        child.on("error", reject);
        child.on("exit", (code) =>
          code === 0 ? resolve() : reject(new Error(`Bridge exited ${code}`)),
        );
      });
    };
    await emit({ hook_event_name: "SessionStart", session_id: "saved-conversation" });
    assert.equal(app.workspace.session(id).conversationId, "saved-conversation");
    await emit({ hook_event_name: "Stop", last_assistant_message: '结果\\"\n'.repeat(30000) });
    assert.equal(app.workspace.queue().length, 1, "long results must not silently fail validation");
    assert.ok(app.workspace.queue()[0].detail.startsWith("结果"));
    await emit({ hook_event_name: "Stop" });
    assert.equal(app.workspace.queue().length, 2);
  } finally {
    await app.cleanup();
  }
});
