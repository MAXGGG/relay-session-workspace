import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { createApp, projectRoot } from "../../src/server/app.ts";
import { validLibrary } from "../../src/server/session-library.ts";
import { Store } from "../../src/server/store.ts";
import { testApp } from "../helpers.ts";

test("saved groups supply folders and reusable templates exclude conversation-specific data", async () => {
  const app = await testApp(false);
  let reopened: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    assert.equal(
      (
        await app.request("/api/library", {
          action: "save-group",
          name: "Documents",
          cwd: projectRoot,
        })
      ).response.status,
      200,
    );
    const template = {
      action: "save-template",
      name: "Test agent",
      mode: "custom",
      priority: 1,
      executable: process.execPath,
      args: [path.join(projectRoot, "test/fixtures/terminal-worker.mjs")],
      attentionMode: "events",
      conversationId: "must-not-copy",
      notes: "private session",
      cwd: "must-not-copy",
    };
    const saved = await app.request("/api/library", template);
    assert.equal(saved.response.status, 200);
    const stored = saved.body.state.templates[0];
    assert.equal(stored.conversationId, undefined);
    assert.equal(stored.cwd, undefined);
    assert.equal(stored.notes, undefined);
    const created = await app.request("/api/sessions", {
      ...stored,
      id: undefined,
      name: "First",
      group: "Documents",
    });
    assert.equal(created.response.status, 200);
    const sessionId = created.body.state.selectedSessionId;
    assert.equal(app.workspace.session(sessionId).cwd, path.resolve(projectRoot));
    await app.request("/api/library", {
      action: "save-group",
      name: "Documents",
      cwd: app.stateDir,
    });
    assert.equal(
      app.workspace.session(sessionId).cwd,
      path.resolve(projectRoot),
      "changing a group must not relocate existing workers",
    );
    await app.close();
    reopened = await createApp({ stateDir: app.stateDir, demo: false });
    assert.equal(reopened.workspace.state.groups?.[0].cwd, app.stateDir);
    assert.equal(reopened.workspace.state.templates?.[0].id, stored.id);
    assert.equal(reopened.workspace.session(sessionId).status, "stopped");
    assert.equal(new Store(app.stateDir).load()?.templates?.length, 1);
  } finally {
    await reopened?.close();
    await app.cleanup();
  }
});

test("library validation rejects malformed saved data and deletion keeps sessions intact", async () => {
  const app = await testApp(false);
  try {
    for (const invalid of [
      { action: "save-group", name: "Bad", cwd: "relative" },
      { action: "save-group", name: "", cwd: projectRoot },
      { action: "save-template", name: "Bad", mode: "demo" },
      { action: "save-template", name: "Bad", mode: "custom", attentionMode: "events" },
      { action: "unknown" },
    ])
      assert.equal((await app.request("/api/library", invalid)).response.status, 400);
    assert.equal(
      validLibrary(
        [
          { name: "a", cwd: "x" },
          { name: "a", cwd: "y" },
        ],
        undefined,
      ),
      false,
    );
    assert.equal(validLibrary(undefined, [{}]), false);
    assert.equal(validLibrary(undefined, undefined), true);
    await app.request("/api/library", { action: "save-group", name: "Work", cwd: projectRoot });
    const saved = await app.request("/api/library", {
      action: "save-template",
      name: "Shell",
      mode: "shell",
      attentionMode: "manual",
    });
    const id = saved.body.state.templates[0].id;
    await app.request("/api/library", {
      action: "save-template",
      id,
      name: "Shell edited",
      mode: "shell",
      attentionMode: "quiet",
    });
    assert.equal(app.workspace.state.templates?.length, 1);
    await app.request("/api/library", { action: "delete-template", id });
    await app.request("/api/library", { action: "delete-group", name: "Work" });
    assert.equal(app.workspace.state.templates?.length, 0);
    assert.equal(app.workspace.state.groups?.length, 0);
  } finally {
    await app.cleanup();
  }
});
