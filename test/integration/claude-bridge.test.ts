import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { projectRoot } from "../../src/server/app.ts";
import { testApp, waitUntil } from "../helpers.ts";

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
    const oldItems = app.workspace.queue();
    await emit({ hook_event_name: "UserPromptSubmit" });
    assert.equal(app.workspace.queue().length, 2, "background prompts do not acknowledge results");
    app.terminals.write(id, "draft without submission");
    await emit({ hook_event_name: "UserPromptSubmit" });
    assert.equal(app.workspace.queue().length, 2, "typing alone is not a reply");
    app.terminals.write(id, "\r");
    assert.equal(app.workspace.queue().length, 2, "Enter alone does not prove submission");
    const stale = await app.request("/api/hook", {
      relaySessionId: id,
      runId: "stale",
      event: { hook_event_name: "UserPromptSubmit" },
    });
    assert.equal(stale.response.status, 400);
    assert.equal(app.workspace.queue().length, 2);
    await emit({ hook_event_name: "UserPromptSubmit" });
    assert.equal(app.workspace.queue().length, 0);
    assert.ok(oldItems.every((item) => item.status === "resolved"));
    await emit({ hook_event_name: "Stop", message: "Next response" });
    await emit({ hook_event_name: "UserPromptSubmit" });
    assert.equal(app.workspace.queue().length, 1, "a consumed reply cannot clear a later result");
    app.terminals.write(id, "\r");
    app.terminals.write(id, "\x1b");
    await emit({ hook_event_name: "UserPromptSubmit" });
    assert.equal(app.workspace.queue().length, 1, "cancelled input cannot acknowledge a result");
    app.terminals.write(id, "\r");
    const now = app.workspace.now;
    app.workspace.now = () => now() + 31000;
    await emit({ hook_event_name: "UserPromptSubmit" });
    assert.equal(app.workspace.queue().length, 1, "expired input cannot acknowledge a result");
    app.workspace.now = now;
    app.terminals.write(id, "\r");
    await app.request("/api/stop", { sessionId: id });
    await waitUntil(() => !app.terminals.records.has(id));
    await app.request("/api/start", { sessionId: id });
    const restarted = await app.request("/api/hook", {
      relaySessionId: id,
      runId: app.terminals.records.get(id)?.runId,
      event: { hook_event_name: "UserPromptSubmit" },
    });
    assert.equal(restarted.response.status, 200);
    assert.equal(
      app.workspace.queue().length,
      1,
      "restarting cannot reuse an old input acknowledgement",
    );
  } finally {
    await app.cleanup();
  }
});
