import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { projectRoot } from "../../src/server/app.ts";
import { fixtureCli, testApp, waitUntil } from "../helpers.ts";

test("sidebar operations archive unresolved work, reject live deletion, and remove only the chosen record", async () => {
  const app = await testApp(false);
  try {
    const created = await app.request("/api/sessions", {
      name: "Alpha",
      cwd: projectRoot,
      mode: "custom",
      executable: process.execPath,
      args: [path.join(projectRoot, "test/fixtures/terminal-worker.mjs")],
      attentionMode: "manual",
    });
    const id = created.body.state.selectedSessionId;
    await waitUntil(() => app.terminals.output(id).includes("WORKER_READY"));
    const status = await app.request("/api/state");
    assert.equal(status.body.sessionStatuses[id].code, "running");
    assert.equal(
      (await app.request("/api/session", { action: "delete", sessionId: id, confirmName: "Alpha" }))
        .response.status,
      400,
    );
    await app.request("/api/attention", { sessionId: id, kind: "question", text: "Still pending" });
    assert.equal((await app.request("/api/state")).body.sessionStatuses[id].code, "waiting");
    await app.request("/api/session", {
      action: "update",
      sessionId: id,
      group: "Client A",
      pinned: true,
    });
    const archived = await app.request("/api/session", { action: "stop-archive", sessionId: id });
    assert.equal(archived.response.status, 200);
    assert.equal(archived.body.queue.length, 1);
    assert.equal(archived.body.sessionStatuses[id].code, "stopped");
    assert.equal(app.terminals.records.has(id), false);
    assert.equal(
      (await app.request("/api/session", { action: "delete", sessionId: id, confirmName: "wrong" }))
        .response.status,
      400,
    );
    const saved = JSON.parse(readFileSync(path.join(app.stateDir, "workspace.json"), "utf8"));
    assert.equal(saved.sessions[0].group, "Client A");
    assert.equal(saved.sessions[0].pinned, true);
    const file = path.join(app.stateDir, "terminals", `${id}.log`);
    assert.equal(existsSync(file), true);
    const deleted = await app.request("/api/session", {
      action: "delete",
      sessionId: id,
      confirmName: "Alpha",
    });
    assert.equal(deleted.response.status, 200);
    assert.equal(deleted.body.state.sessions.length, 0);
    assert.equal(deleted.body.queue.length, 0);
    assert.equal(existsSync(file), false);
    assert.equal(existsSync(path.join(projectRoot, "package.json")), true);
  } finally {
    await app.cleanup();
  }
});

test("agent coordinator creates a real CLI with initial task, navigates, and deduplicates requests", async () => {
  let calls = 0;
  const app = await testApp(false, {
    coordinatorRunner: async ({ prompt }) => {
      calls++;
      assert.match(prompt, /COORDINATOR_CONVERSATION/);
      if (calls === 1)
        return {
          message: "I will start that task.",
          actions: [
            {
              kind: "create",
              name: "Fix payments",
              cwd: projectRoot,
              mode: "codex",
              task: "Investigate retry behavior",
              priority: 1,
            },
          ],
        };
      const session = app.workspace.state.sessions[0];
      if (calls === 2)
        return {
          message: "Here is the payments investigation.",
          actions: [
            { kind: "open", sessionId: session.id },
            { kind: "group", sessionId: session.id, group: "Payments" },
          ],
        };
      return {
        message: "I will execute a shell command.",
        actions: [{ kind: "exec", command: "bad" }],
      };
    },
  });
  try {
    const executable = fixtureCli(
      app.stateDir,
      path.join(projectRoot, "test/fixtures/terminal-worker.mjs"),
    );
    await app.request("/api/settings", {
      coordinator: { provider: "codex", executable, defaultCwd: projectRoot },
    });
    const first = await app.request("/api/chat", {
      id: "create-1",
      text: "Start a new session to investigate payment retries",
    });
    assert.equal(first.response.status, 200);
    assert.equal(first.body.state.sessions.length, 1);
    const session = app.workspace.state.sessions[0];
    await waitUntil(() => app.terminals.output(session.id).includes("WORKER_READY"));
    assert.match(app.terminals.output(session.id), /Investigate retry behavior/);
    assert.equal(session.priority, 1);
    assert.ok(session.initialPromptStartedAt);
    assert.match(first.body.state.messages.at(-1).text, /Created and started/);
    await app.request("/api/chat", {
      id: "create-1",
      text: "Start a new session to investigate payment retries",
    });
    assert.equal(calls, 1);
    assert.equal(
      (await app.request("/api/chat", { id: "create-1", text: "changed" })).response.status,
      400,
    );
    const opened = await app.request("/api/chat", {
      id: "open-1",
      text: "Take me back to the problem with retries and group it under Payments",
    });
    assert.equal(opened.body.state.selectedSessionId, session.id);
    assert.equal(session.group, "Payments");
    const invalid = await app.request("/api/chat", {
      id: "bad-1",
      text: "invalid planner fixture",
    });
    assert.match(invalid.body.state.messages.at(-1).text, /unsupported action/);
    assert.equal(app.workspace.state.sessions.length, 1);
    const stopped = await app.request("/api/stop", { sessionId: session.id });
    assert.equal(stopped.response.status, 200);
    await waitUntil(() => !app.terminals.records.has(session.id));
    await app.request("/api/start", { sessionId: session.id });
    await waitUntil(() => app.terminals.output(session.id).includes("WORKER_READY"));
    assert.doesNotMatch(app.terminals.output(session.id), /Investigate retry behavior/);
  } finally {
    await app.cleanup();
  }
});

test("agent requests can be cancelled, retain conversation, and reject unmentioned project directories", async () => {
  let wait = true;
  const app = await testApp(false, {
    coordinatorRunner: ({ signal, prompt }) => {
      if (!wait)
        return Promise.resolve({
          message: "Creating",
          actions: [{ kind: "create", name: "Wrong folder", cwd: projectRoot, mode: "codex" }],
        });
      assert.match(prompt, /wait for me/);
      return new Promise((_, reject) =>
        signal.addEventListener("abort", () => reject(new Error("Request cancelled")), {
          once: true,
        }),
      );
    },
  });
  try {
    const pending = app.request("/api/chat", { id: "wait", text: "wait for me" });
    await waitUntil(() => app.workspace.state.coordinatorRequests?.[0]?.status === "running");
    assert.equal(
      (await app.request("/api/chat", { id: "wait", text: "wait for me" })).response.status,
      202,
    );
    assert.equal(
      (await app.request("/api/chat", { id: "another", text: "second" })).response.status,
      400,
    );
    await app.request("/api/chat/cancel", {});
    const cancelled = await pending;
    assert.equal(cancelled.body.coordinator.busy, false);
    assert.match(cancelled.body.state.messages.at(-1).text, /cancelled/);
    wait = false;
    const result = await app.request("/api/chat", {
      id: "unsafe-project",
      text: "Create a session but I have not said where",
    });
    assert.match(result.body.state.messages.at(-1).text, /supply the project directory/);
    assert.equal(app.workspace.state.sessions.length, 0);
  } finally {
    await app.cleanup();
  }
});
