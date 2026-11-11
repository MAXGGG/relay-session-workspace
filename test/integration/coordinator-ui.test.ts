import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCoordinatorPlan } from "../../src/server/coordinator-agent.ts";
import { coordinatorFlows } from "../../src/server/coordinator-ui.ts";
import { testApp } from "../helpers.ts";

test("coordinator workflows validate fields and stable targets, return only to the caller and do not replay", async () => {
  let plan: unknown;
  const app = await testApp(false, { coordinatorRunner: async () => plan });
  try {
    const session = app.workspace.addSession({
      name: "Original",
      project: "repo",
      cwd: app.stateDir,
      mode: "custom",
      status: "stopped",
    });
    plan = {
      message: "Prepare edits",
      actions: [
        {
          kind: "ui",
          flow: "edit-session",
          sessionId: session.id,
          fields: [{ name: "name", value: "Proposed" }],
        },
      ],
    };
    const request = { id: "edit-1", text: "Rename Original to Proposed" };
    const result = await app.request("/api/chat", request);
    assert.equal(result.body.uiRequest.sessionId, session.id);
    assert.equal(result.body.uiRequest.values.name, "Proposed");
    assert.equal(session.name, "Original", "form preparation alone does not save");
    assert.equal((await app.request("/api/state")).body.uiRequest, undefined);
    assert.equal((await app.request("/api/chat", request)).body.uiRequest, undefined);
    plan = {
      message: "Bad target",
      actions: [{ kind: "ui", flow: "delete-session", sessionId: "missing" }],
    };
    const missing = await app.request("/api/chat", {
      id: "missing",
      text: "Delete a missing target",
    });
    assert.equal(missing.body.uiRequest, undefined);
    assert.match(missing.body.state.messages.at(-1).text, /not found/);
    plan = {
      message: "Injected fields",
      actions: [
        { kind: "rename", sessionId: session.id, name: "Must not change" },
        { kind: "ui", flow: "settings", fields: [{ name: "innerHTML", value: "bad" }] },
      ],
    };
    await app.request("/api/chat", { id: "invalid", text: "Invalid fixture" });
    assert.equal(session.name, "Original", "validate the whole plan before any action");
    assert.equal(app.workspace.state.coordinatorRequests?.at(-1)?.status, "failed");
  } finally {
    await app.cleanup();
  }
});

test("coordinator can reopen, classify and restore using existing domain rules", async () => {
  let plan: unknown;
  const app = await testApp(false, { coordinatorRunner: async () => plan });
  try {
    const session = app.workspace.addSession({
      name: "Archived",
      project: "repo",
      cwd: app.stateDir,
      mode: "custom",
      status: "stopped",
    });
    const item = app.workspace.enqueue(session.id, {
      kind: "review",
      title: "Result",
      detail: "Review me",
      source: "test",
    });
    app.workspace.resolve(item.id);
    app.workspace.archive(session.id, true);
    plan = {
      message: "Restore the work",
      actions: [
        { kind: "restore", sessionId: session.id },
        { kind: "reopen", itemId: item.id },
        { kind: "classify", itemId: item.id, itemKind: "question" },
      ],
    };
    const response = await app.request("/api/chat", {
      id: "restore",
      text: "Restore Archived and reopen Result as a question",
    });
    assert.equal(response.body.queue.length, 1);
    assert.equal(item.status, "pending");
    assert.equal(item.kind, "question");
    assert.equal(item.confidence, "manual");
    assert.equal(session.archivedAt, undefined);
  } finally {
    await app.cleanup();
  }
});

test("workflow catalogue rejects arbitrary selectors, fields, controls, invalid values and multiple dialogs", () => {
  for (const flow of Object.keys(coordinatorFlows)) {
    assert.equal(
      parseCoordinatorPlan({
        message: "Prepare",
        actions: [
          {
            kind: "ui",
            flow,
            sessionId: "session",
            itemId: "item",
            ...(flow === "desktop-menu" ? { fields: [{ name: "operation", value: "about" }] } : {}),
          },
        ],
      }).actions.length,
      1,
    );
  }
  for (const action of [
    { kind: "ui", flow: "#delete-session" },
    { kind: "ui", flow: "edit-session" },
    { kind: "ui", flow: "attention-preview" },
    { kind: "ui", flow: "queue", fields: [{ name: "filter", value: '"] button' }] },
    { kind: "ui", flow: "settings", fields: [{ name: "coordinatorModel", value: "\u001b[31m" }] },
    {
      kind: "ui",
      flow: "settings",
      fields: [
        { name: "retireAfterDays", value: "14" },
        { name: "retireAfterDays", value: "0" },
      ],
    },
    { kind: "ui", flow: "queue", fields: [{ name: "page", value: "-1" }] },
    { kind: "ui", flow: "layout", fields: [{ name: "chat", value: "Infinity" }] },
    { kind: "ui", flow: "notifications", fields: [{ name: "enabled", value: "maybe" }] },
    { kind: "resolve", itemKind: "invented" },
    { kind: "next", flow: "settings" },
  ])
    assert.throws(() => parseCoordinatorPlan({ message: "Invalid", actions: [action] }));
  assert.throws(() =>
    parseCoordinatorPlan({
      message: "Two dialogs",
      actions: [
        { kind: "ui", flow: "settings" },
        { kind: "ui", flow: "templates" },
      ],
    }),
  );
});
