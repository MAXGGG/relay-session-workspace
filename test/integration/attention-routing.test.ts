import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { createApp, projectRoot } from "../../src/server/app.ts";
import { removeTemporary, temporaryDirectory, testApp, waitUntil } from "../helpers.ts";

async function worker(app: Awaited<ReturnType<typeof testApp>>, name: string) {
  const result = await app.request("/api/sessions", {
    name,
    cwd: projectRoot,
    mode: "custom",
    executable: process.execPath,
    args: [path.join(projectRoot, "test/fixtures/terminal-worker.mjs")],
    attentionMode: "events",
  });
  assert.equal(result.response.status, 200);
  const id = result.body.state.selectedSessionId;
  await waitUntil(() => app.terminals.output(id).includes("WORKER_READY"));
  return { id, runId: app.terminals.records.get(id)?.runId };
}

test("independent CLI events distinguish approval, question, result and reject stale or malformed events", async () => {
  const app = await testApp(false);
  try {
    const workers = await Promise.all([
      worker(app, "Question"),
      worker(app, "Result"),
      worker(app, "Approval"),
    ]);
    for (let i = 0; i < workers.length; i++) {
      app.terminals.write(
        workers[i].id,
        `event:${JSON.stringify({ type: ["question", "review", "approval"][i], text: `Worker ${i} needs attention` })}\r`,
      );
    }
    await waitUntil(() => app.workspace.queue().length === 3);
    assert.deepEqual(
      app.workspace
        .queue()
        .map((item) => item.kind)
        .sort(),
      ["approval", "question", "review"],
    );
    const target = workers[0];
    const payload = {
      sessionId: target.id,
      runId: target.runId,
      event: { eventId: "fixed", type: "review", text: "Verified result" },
    };
    await app.request("/api/events", payload);
    await app.request("/api/events", payload);
    assert.equal(app.workspace.queue().length, 4);
    assert.equal(
      (await app.request("/api/events", { ...payload, runId: "old" })).response.status,
      400,
    );
    assert.equal(
      (await app.request("/api/events", { ...payload, event: { ...payload.event, text: {} } }))
        .response.status,
      400,
    );
    assert.equal(
      (await app.request("/api/events", { ...payload, event: { eventId: "bad", type: "unknown" } }))
        .response.status,
      400,
    );
  } finally {
    await app.cleanup();
  }
});

test("explicit replies reach only the named process, deduplicate retries and reject replaced terminals", async () => {
  const app = await testApp(false);
  try {
    const a = await worker(app, "A");
    const b = await worker(app, "B");
    const payload = { id: "send-once", sessionId: a.id, runId: a.runId, text: "literal & $value" };
    const first = await app.request("/api/reply", payload);
    assert.equal(first.response.status, 200);
    assert.equal(first.body.delivery.status, "sent");
    await app.request("/api/reply", payload);
    await waitUntil(() => app.terminals.output(a.id).includes('RECEIVED:"literal & $value"'));
    assert.equal(app.terminals.output(a.id).split('RECEIVED:"literal & $value"').length - 1, 1);
    assert.ok(!app.terminals.output(b.id).includes("literal & $value"));
    assert.equal(
      (await app.request("/api/reply", { ...payload, sessionId: b.id })).response.status,
      400,
    );
    assert.equal(
      (await app.request("/api/reply", { ...payload, id: "control", text: "escape\x1b" })).response
        .status,
      400,
    );
    const approval = app.workspace.enqueue(a.id, {
      kind: "approval",
      title: "Approve?",
      detail: "Decide in terminal",
      source: "test",
    });
    assert.equal(
      (await app.request("/api/reply", { ...payload, id: "approve", itemId: approval.id })).response
        .status,
      400,
    );
    assert.equal(
      (
        await app.request("/api/reply", {
          ...payload,
          id: "wrong-item",
          sessionId: b.id,
          runId: b.runId,
          itemId: approval.id,
        })
      ).response.status,
      400,
    );
    await app.request("/api/stop", { sessionId: a.id });
    await waitUntil(() => !app.terminals.records.has(a.id));
    await app.request("/api/start", { sessionId: a.id });
    assert.equal(
      (await app.request("/api/reply", { ...payload, id: "stale" })).response.status,
      400,
    );
    assert.equal(app.workspace.item(approval.id).status, "pending");
  } finally {
    await app.cleanup();
  }
});

test("terminal replay and notes survive restart; one server owns a workspace", async () => {
  const directory = temporaryDirectory();
  let app = await createApp({ stateDir: directory, demo: false });
  try {
    await assert.rejects(() => createApp({ stateDir: directory, demo: false }), /already open/);
    const session = app.workspace.addSession({
      name: "Persistent",
      project: "p",
      cwd: projectRoot,
      mode: "custom",
      executable: process.execPath,
      args: [path.join(projectRoot, "test/fixtures/terminal-worker.mjs")],
      notes: "Resume this task",
    });
    app.terminals.start(session);
    await waitUntil(() => app.terminals.output(session.id).includes("WORKER_READY"));
    app.terminals.write(session.id, "saved-output\r");
    await waitUntil(() => app.terminals.output(session.id).includes('RECEIVED:"saved-output"'));
    await app.close();
    app = await createApp({ stateDir: directory, demo: false });
    const response = await fetch(`${app.address}/api/transcript?sessionId=${session.id}`, {
      headers: { Authorization: `Bearer ${app.token}` },
    });
    assert.ok((await response.json()).text.includes('RECEIVED:"saved-output"'));
    assert.equal(app.workspace.session(session.id).status, "stopped");
    assert.equal(app.workspace.session(session.id).notes, "Resume this task");
  } finally {
    await app.close();
    removeTemporary(directory);
  }
});

test("twelve concurrent CLI sessions keep priorities and replies isolated", {
  timeout: 30000,
}, async () => {
  const app = await testApp(false);
  try {
    const workers = await Promise.all(
      Array.from({ length: 12 }, (_, index) => worker(app, `Worker ${index}`)),
    );
    for (let index = 0; index < workers.length; index++) {
      const target = workers[index];
      await app.request("/api/priority", { sessionId: target.id, priority: (index % 3) + 1 });
      const result = await app.request("/api/events", {
        sessionId: target.id,
        runId: target.runId,
        event: {
          eventId: "same-id-different-session",
          type: "question",
          text: `Question ${index}`,
        },
      });
      assert.equal(result.response.status, 200);
    }
    assert.equal(app.workspace.queue().length, 12);
    assert.deepEqual(
      app.workspace.queue().map((item) => item.priority),
      [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3],
    );
    for (let index = 0; index < workers.length; index++) {
      const target = workers[index];
      const result = await app.request("/api/reply", {
        id: `batch-${index}`,
        sessionId: target.id,
        runId: target.runId,
        text: `message-${index}-end`,
      });
      assert.equal(result.response.status, 200);
    }
    await waitUntil(() =>
      workers.every((target, index) =>
        app.terminals.output(target.id).includes(`RECEIVED:"message-${index}-end"`),
      ),
    );
    for (const [index, target] of workers.entries()) {
      assert.equal(
        (app.terminals.output(target.id).match(/RECEIVED:/g) ?? []).length,
        1,
        `Only its own reply reaches worker ${index}`,
      );
    }
    assert.equal(
      app.workspace.queue().length,
      12,
      "Sending does not silently accept results or questions",
    );
  } finally {
    await app.cleanup();
  }
});
