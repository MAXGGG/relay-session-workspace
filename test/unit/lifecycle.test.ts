import assert from "node:assert/strict";
import { test } from "node:test";
import { Workspace } from "../../src/core/workspace.ts";

test("archive preserves records and refuses running or unresolved work", () => {
  const w = new Workspace(undefined, () => 100);
  const session = w.addSession({ name: "worker", project: "repo", cwd: ".", mode: "custom" });
  assert.throws(() => w.archive(session.id), /Stop/);
  session.status = "stopped";
  const item = w.enqueue(session.id, {
    kind: "review",
    title: "Result",
    detail: "Details",
    source: "test",
  });
  w.snooze(item.id);
  assert.throws(() => w.archive(session.id), /pending/);
  w.resolve(item.id);
  w.archive(session.id);
  assert.equal(session.archivedAt, 100);
  assert.equal(w.state.selectedSessionId, null);
  w.reopen(item.id);
  assert.equal(session.archivedAt, undefined);
  assert.equal(w.queue().length, 1);
  w.classify(item.id, "question");
  assert.equal(item.confidence, "manual");
  assert.throws(() => w.classify(item.id, "bad" as "question"), /Unknown/);
  w.restore(session.id);
  assert.equal(w.state.selectedSessionId, session.id);
});

test("session metadata and opt-in retirement preserve active and pending work", () => {
  let time = 0;
  const w = new Workspace(undefined, () => time);
  const a = w.addSession({
    name: "a",
    project: "repo",
    cwd: ".",
    mode: "codex",
    status: "stopped",
  });
  const b = w.addSession({
    name: "b",
    project: "repo",
    cwd: ".",
    mode: "shell",
    status: "working",
  });
  w.updateSession(a.id, {
    name: " Alpha ",
    notes: "Remember",
    quietSeconds: 20,
    attentionMode: "quiet",
  });
  assert.equal(a.name, "Alpha");
  assert.throws(() => w.updateSession(a.id, { name: " " }), /name/);
  assert.throws(() => w.updateSession(a.id, { notes: "x".repeat(20001) }), /long/);
  assert.throws(() => w.updateSession(a.id, { attentionMode: "bad" as "quiet" }), /Choose/);
  assert.throws(() => w.updateSession(a.id, { quietSeconds: 0 }), /interval/);
  assert.throws(() => w.retirement(-1), /Retirement/);
  assert.equal(w.retireInactive(), false);
  w.retirement(14);
  assert.equal(w.retireInactive(), false);
  time = 15 * 86400000;
  assert.equal(w.retireInactive(), true);
  assert.equal(b.archivedAt, undefined);
  assert.equal(w.state.selectedSessionId, b.id);
  w.state.deliveries = [
    { id: "receipt", sessionId: a.id, runId: "run", text: "hi", at: time, status: "pending" },
  ];
  w.recover();
  assert.equal(w.state.deliveries[0].status, "uncertain");
});
