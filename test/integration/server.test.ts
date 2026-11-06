import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { test } from "node:test";
import { WebSocket } from "ws";
import { createApp, projectRoot } from "../../src/server/app.ts";
import { removeTemporary, temporaryDirectory, testApp } from "../helpers.ts";

test("HTTP boundary rejects missing tokens, foreign origins, invalid bodies and routes", async () => {
  const app = await testApp();
  try {
    assert.equal((await fetch(`${app.address}/health`)).status, 200);
    assert.equal((await fetch(`${app.address}/api/state`)).status, 401);
    assert.equal(
      (await app.request("/api/state", undefined, { Origin: "https://untrusted.example" })).response
        .status,
      403,
    );
    assert.equal((await app.request("/api/missing", {})).response.status, 404);
    assert.equal((await app.request("/api/command")).response.status, 405);
    assert.equal((await app.request("/api/command", { text: "" })).response.status, 400);
    assert.equal(
      (await app.request("/api/command", { text: "x".repeat(70000) })).response.status,
      400,
    );
    assert.equal(
      (await app.request("/api/item", { id: "missing", action: "bad" })).response.status,
      400,
    );
    assert.equal(
      (await app.request("/api/hook", { relaySessionId: "session-payments", event: {} })).response
        .status,
      400,
    );
    assert.equal(
      (
        await app.request("/api/sessions", {
          name: "bad",
          cwd: "/nonexistent-relay-folder",
          mode: "shell",
        })
      ).response.status,
      400,
    );
    assert.equal(
      (await app.request("/api/sessions", { name: "bad", cwd: projectRoot, mode: "arbitrary" }))
        .response.status,
      400,
    );
    assert.equal((await fetch(`${app.address}/package.json`)).status, 404);
    const page = await fetch(app.address);
    assert.match(page.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
    assert.match(await page.text(), /Attention queue/);
    const badJson = await fetch(`${app.address}/api/command`, {
      method: "POST",
      headers: { Authorization: `Bearer ${app.token}` },
      body: "{",
    });
    assert.equal(badJson.status, 400);
  } finally {
    await app.cleanup();
  }
});

test("API command routing, hook deduplication and queue resolution use persistent IDs", async () => {
  const app = await testApp();
  try {
    const initial = (await app.request("/api/state")).body;
    assert.equal(initial.queue.length, 2);
    const next = (await app.request("/api/command", { text: "next task" })).body;
    assert.equal(next.state.selectedSessionId, "session-payments");
    assert.equal(next.queue.length, 2);
    await app.request("/api/priority", { sessionId: "session-website", priority: 1 });
    await app.request("/api/item", {
      id: next.state.selectedItemId,
      action: "snooze",
      minutes: 60,
    });
    await app.request("/api/command", { text: "next task" });
    const current = (await app.request("/api/state")).body;
    assert.equal(current.state.selectedSessionId, "session-website");
    await app.request("/api/item", { id: current.state.selectedItemId, action: "resolve" });
    const event = { hook_event_name: "StopFailure", message: "Test failure", eventId: "dedupe-me" };
    await app.request("/api/hook", { relaySessionId: "session-research", event });
    await app.request("/api/hook", { relaySessionId: "session-research", event });
    assert.equal((await app.request("/api/state")).body.queue.length, 1);
    await app.request("/api/select", { sessionId: "session-payments" });
    assert.equal((await app.request("/api/state")).body.state.selectedItemId, null);
  } finally {
    await app.cleanup();
  }
});

test("real hook bridge submits a completion event without requiring Claude", async () => {
  const app = await testApp();
  try {
    const child = spawn(process.execPath, [path.join(projectRoot, "scripts/claude-hook.mjs")], {
      env: {
        ...process.env,
        RELAY_HOOK_URL: `${app.address}/api/hook`,
        RELAY_TOKEN: app.token,
        RELAY_SESSION_ID: "session-research",
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const finished = once(child, "exit");
    child.stdin.end(
      JSON.stringify({
        hook_event_name: "Stop",
        last_assistant_message: "Research report is ready.",
      }),
    );
    assert.equal((await finished)[0], 0);
    const state = (await app.request("/api/state")).body;
    assert.ok(
      state.queue.some((item: { title: string }) => item.title === "Research report is ready."),
    );
  } finally {
    await app.cleanup();
  }
});

test("server restart preserves queue and records actual processes as stopped", async () => {
  const directory = temporaryDirectory();
  let app = await createApp({ stateDir: directory, demo: false });
  try {
    const session = app.workspace.addSession({
      name: "Saved worker",
      project: "repo",
      cwd: projectRoot,
      mode: "claude",
      status: "working",
    });
    app.workspace.enqueue(session.id, {
      kind: "question",
      title: "Still pending?",
      detail: "Keep this",
      source: "test",
    });
    await app.close();
    app = await createApp({ stateDir: directory });
    assert.equal(app.workspace.session(session.id).status, "stopped");
    assert.equal(app.workspace.queue().length, 1);
    assert.equal(app.workspace.state.sessions.length, 1);
  } finally {
    await app.close();
    removeTemporary(directory);
  }
});

test("WebSocket and real PTY route input to the attached shell only", {
  timeout: 20000,
}, async () => {
  const app = await testApp();
  let socket: WebSocket | undefined;
  try {
    const created = await app.request("/api/sessions", {
      name: "Live shell",
      cwd: projectRoot,
      mode: "shell",
      priority: 2,
    });
    assert.equal(created.response.status, 200);
    const id = created.body.state.selectedSessionId;
    socket = new WebSocket(`${app.address.replace("http", "ws")}/terminal?token=${app.token}`);
    const messages: any[] = [];
    socket.on("message", (data) => messages.push(JSON.parse(data.toString())));
    await once(socket, "open");
    const waitFor = (predicate: () => boolean) =>
      new Promise<void>((resolve, reject) => {
        if (predicate()) return resolve();
        const timeout = setTimeout(() => {
          socket?.off("message", check);
          reject(
            new Error(
              `Expected terminal event. Received: ${JSON.stringify(messages).slice(-3000)}`,
            ),
          );
        }, 10000);
        const check = () => {
          if (predicate()) {
            clearTimeout(timeout);
            socket?.off("message", check);
            resolve();
          }
        };
        socket?.on("message", check);
      });
    socket.send(JSON.stringify({ type: "input", sessionId: id, data: "should not run\r" }));
    await waitFor(() => messages.some((message) => message.type === "error"));
    socket.send(JSON.stringify({ type: "attach", sessionId: id }));
    await waitFor(() =>
      messages.some((message) => message.type === "attached" && message.sessionId === id),
    );
    await waitFor(() => {
      const output = messages
        .filter((message) => message.type === "output" || message.type === "attached")
        .map((message) => message.data || "")
        .join("");
      return process.platform === "win32" ? output.includes(">") : /[$#] /.test(output);
    });
    socket.send(JSON.stringify({ type: "resize", sessionId: id, cols: 100, rows: 24 }));
    const command =
      process.platform === "win32"
        ? "set RELAY_TEST_WORD=ROUNDTRIP\recho RELAY_PTY_%RELAY_TEST_WORD%\r"
        : "printf 'RELAY_PTY_%s\\n' ROUNDTRIP\r";
    socket.send(JSON.stringify({ type: "input", sessionId: id, data: command }));
    await waitFor(() =>
      messages
        .filter((message) => message.type === "output")
        .map((message) => message.data)
        .join("")
        .includes("RELAY_PTY_ROUNDTRIP"),
    );
    assert.ok(app.terminals.records.has(id));
    await app.request("/api/stop", { sessionId: id });
    await waitFor(() => messages.some((message) => message.type === "exit"));
    assert.equal(app.workspace.session(id).status, "stopped");
    assert.equal(
      app.workspace.queue().filter((item) => item.sessionId === id).length,
      0,
      "intentional stopping is not a failure",
    );
    const unauthorized = new WebSocket(`${app.address.replace("http", "ws")}/terminal?token=wrong`);
    const rejected = once(unauthorized, "error");
    assert.match(String((await rejected)[0]), /401/);
  } finally {
    socket?.terminate();
    await app.cleanup();
  }
});
