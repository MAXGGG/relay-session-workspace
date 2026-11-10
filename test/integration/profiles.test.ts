import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { projectRoot } from "../../src/server/app.ts";
import { argumentList, findExecutable, launchProfile } from "../../src/server/profiles.ts";
import { removeTemporary, temporaryDirectory, testApp, waitUntil } from "../helpers.ts";

test("custom CLI preserves literal arguments, edits, and explicit resume settings", async () => {
  const app = await testApp(false);
  try {
    const args = [
      path.join(projectRoot, "test/fixtures/terminal-worker.mjs"),
      "space in value",
      "a&b",
      "$(literal)",
    ];
    const created = await app.request("/api/sessions", {
      name: "Custom",
      cwd: projectRoot,
      mode: "custom",
      executable: process.execPath,
      args,
    });
    assert.equal(created.response.status, 200);
    const id = created.body.state.selectedSessionId;
    await waitUntil(() => app.terminals.output(id).includes("WORKER_READY"));
    assert.ok(app.terminals.output(id).includes(JSON.stringify(args.slice(1))));
    assert.ok(created.body.terminals[id].runId);
    const update = await app.request("/api/session", {
      sessionId: id,
      action: "update",
      name: "Renamed",
      notes: "Next: check edge cases",
      conversationId: "saved-123",
      resumeArgs: ["resume", "{conversationId}"],
    });
    assert.equal(update.response.status, 200);
    assert.equal(app.workspace.session(id).name, "Renamed");
    assert.deepEqual(launchProfile(app.workspace.session(id), projectRoot, "hooks.json").args, [
      "resume",
      "saved-123",
    ]);
    assert.equal(
      (await app.request("/api/session", { sessionId: id, action: "archive" })).response.status,
      400,
    );
    await app.request("/api/stop", { sessionId: id });
    await waitUntil(() => !app.terminals.records.has(id));
    assert.equal(
      (await app.request("/api/session", { sessionId: id, action: "archive" })).response.status,
      200,
    );
    assert.equal((await app.request("/api/start", { sessionId: id })).response.status, 400);
    await app.request("/api/session", { sessionId: id, action: "restore" });
    assert.equal(app.workspace.session(id).archivedAt, undefined);
  } finally {
    await app.cleanup();
  }
});

test("profiles handle Codex and Claude resume without executing a shell command string", () => {
  const base = {
    id: "test",
    name: "Test",
    project: "p",
    cwd: ".",
    mode: "codex" as const,
    priority: 2 as const,
    status: "stopped" as const,
    createdAt: 0,
    lastActivityAt: 0,
    executable: "agent",
    conversationId: "saved",
  };
  assert.deepEqual(launchProfile(base, ".", "settings").args, [
    "resume",
    "saved",
    "--no-daemon",
    "--no-alt-screen",
  ]);
  assert.deepEqual(
    launchProfile(
      { ...base, mode: "claude", conversationId: undefined, claudeId: "old" },
      ".",
      "settings",
    ).args,
    ["--settings", "settings", "--resume", "old"],
  );
  assert.equal(findExecutable(process.execPath), process.execPath);
  assert.equal(findExecutable("relay-this-does-not-exist-928344"), undefined);
  assert.deepEqual(argumentList(undefined), []);
  assert.throws(() => argumentList("--flag value"), /array/);
  assert.throws(() => argumentList(["bad\nvalue"]), /array/);
});

test("launch and update validation reject malformed inputs before starting processes", async () => {
  const app = await testApp(false);
  try {
    for (const extra of [
      { executable: "" },
      { executable: process.execPath, args: "not array" },
      { executable: process.execPath, quietSeconds: 0 },
      { executable: process.execPath, attentionMode: "guess" },
    ]) {
      assert.equal(
        (
          await app.request("/api/sessions", {
            name: "Invalid",
            cwd: projectRoot,
            mode: "custom",
            ...extra,
          })
        ).response.status,
        400,
      );
    }
    assert.equal(app.workspace.state.sessions.length, 0);
  } finally {
    await app.cleanup();
  }
});

test("Windows npm-style shims preserve paths with spaces and literal arguments", {
  skip: process.platform !== "win32",
}, async () => {
  const directory = temporaryDirectory();
  const app = await testApp(false);
  try {
    const shim = path.join(directory, "sample agent.cmd");
    writeFileSync(
      shim,
      `@echo off\r\n"${process.execPath}" "${path.join(projectRoot, "test/fixtures/terminal-worker.mjs")}" %*\r\n`,
    );
    const args = ["space in value", "a&b", "$(literal)"];
    for (const unsafe of ['embedded "quotes"', "%PATH%"]) {
      assert.throws(
        () =>
          launchProfile(
            {
              id: "shim",
              name: "Shim",
              cwd: projectRoot,
              project: "p",
              mode: "custom",
              executable: shim,
              args: [unsafe],
              status: "stopped",
              priority: 2,
              createdAt: 0,
              lastActivityAt: 0,
            },
            projectRoot,
            "hooks",
          ),
        /native executable/,
      );
    }
    const result = await app.request("/api/sessions", {
      name: "Shim",
      cwd: projectRoot,
      mode: "custom",
      executable: shim,
      args,
      attentionMode: "manual",
    });
    assert.equal(result.response.status, 200);
    const id = result.body.state.selectedSessionId;
    await waitUntil(() => app.terminals.output(id).includes("WORKER_READY"));
    assert.ok(
      app.terminals.output(id).includes(`ARGS:${JSON.stringify(args)}`),
      app.terminals.output(id),
    );
  } finally {
    await app.cleanup();
    removeTemporary(directory);
  }
});
