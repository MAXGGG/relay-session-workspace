import assert from "node:assert/strict";
import { test } from "node:test";
import { sessionStatus } from "../../src/core/session-status.ts";
import { Workspace } from "../../src/core/workspace.ts";

test("manual organization and deletion preserve other sessions and archive pending work", () => {
  const w = new Workspace();
  const a = w.addSession({
    name: "Alpha",
    project: "repo",
    cwd: ".",
    mode: "shell",
    status: "stopped",
  });
  const b = w.addSession({
    name: "Beta",
    project: "repo",
    cwd: ".",
    mode: "codex",
    status: "stopped",
  });
  w.updateSession(b.id, { group: " Work ", pinned: true });
  assert.equal(b.group, "Work");
  assert.equal(b.pinned, true);
  assert.throws(() => w.updateSession(b.id, { group: "x".repeat(61) }), /group/);
  assert.throws(() => w.updateSession(b.id, { pinned: "yes" as unknown as boolean }), /Pinned/);
  w.move(b.id, a.id);
  assert.deepEqual(
    w.state.sessions.map((s) => s.id),
    [b.id, a.id],
  );
  w.move(b.id, b.id);
  w.move(b.id, null);
  assert.deepEqual(
    w.state.sessions.map((s) => s.id),
    [a.id, b.id],
  );
  assert.throws(() => w.move(a.id, "missing"), /not found/);
  const item = w.enqueue(a.id, {
    kind: "review",
    title: "Keep this",
    detail: "Evidence",
    source: "test",
  });
  w.archive(a.id, true);
  assert.equal(w.item(item.id).status, "pending");
  assert.equal(w.state.selectedSessionId, b.id);
  w.selectItem(item.id);
  assert.equal(a.archivedAt, undefined);
  w.archive(a.id, true);
  w.state.replyDraft = { id: "draft", sessionId: a.id, text: "hello" };
  w.state.deliveries = [
    { id: "d", sessionId: a.id, runId: "r", text: "hello", status: "sent", at: 1 },
  ];
  w.recordEvent(`${a.id}:event`);
  w.remove(a.id);
  assert.equal(w.state.replyDraft, undefined);
  assert.deepEqual(w.state.items, []);
  assert.deepEqual(w.state.deliveries, []);
  assert.deepEqual(w.state.processedEvents, []);
  assert.equal(w.state.selectedSessionId, b.id);
  b.status = "working";
  assert.throws(() => w.remove(b.id), /Stop/);
  b.status = "error";
  w.remove(b.id);
  assert.equal(w.state.selectedSessionId, null);
  const lone = w.addSession({
    name: "lone",
    project: "repo",
    cwd: ".",
    mode: "shell",
    status: "stopped",
  });
  w.remove(lone.id);
  assert.equal(w.state.deliveries?.length, 0);
});

test("status describes process liveness separately from reported agent activity", () => {
  const w = new Workspace();
  const s = w.addSession({ name: "CLI", project: "repo", cwd: ".", mode: "shell" });
  const live = { stopping: false };
  assert.equal(sessionStatus(s, undefined, []).code, "stopped");
  assert.equal(sessionStatus(s, live, []).code, "running");
  assert.equal(sessionStatus(s, { stopping: true }, []).code, "stopping");
  s.status = "working";
  assert.equal(sessionStatus(s, live, []).label, "Terminal active");
  s.attentionMode = "events";
  assert.equal(sessionStatus(s, live, []).label, "Working");
  const item = w.enqueue(s.id, { kind: "question", title: "Input", detail: "?", source: "test" });
  assert.equal(sessionStatus(s, live, [item]).code, "waiting");
  w.resolve(item.id);
  assert.equal(sessionStatus(s, live, [item]).code, "working");
  const review = w.enqueue(s.id, {
    kind: "review",
    title: "Earlier result",
    detail: "done",
    source: "test",
  });
  assert.equal(
    sessionStatus(s, live, [review]).code,
    "working",
    "an earlier result must not hide a new working turn",
  );
  s.status = "error";
  assert.match(sessionStatus(s, live, []).detail, /still running/);
  assert.match(sessionStatus(s, undefined, []).detail, /failed/);
  s.status = "waiting";
  assert.equal(sessionStatus(s, live, []).code, "ready");
  assert.equal(sessionStatus(s, undefined, [item]).code, "stopped");
});

test("status names the human action and preserves working, deferred and other-session distinctions", () => {
  const w = new Workspace();
  const s = w.addSession({
    name: "Agent",
    project: "repo",
    cwd: ".",
    mode: "claude",
    attentionMode: "events",
  });
  const other = w.addSession({ name: "Other", project: "repo", cwd: ".", mode: "shell" });
  const live = { stopping: false };
  assert.equal(sessionStatus(s, live, []).label, "Session open");
  const labels = {
    question: "Waiting for input",
    approval: "Approval needed",
    review: "Ready to review",
    activity: "Check activity",
    error: "Error needs attention",
  } as const;
  for (const [kind, label] of Object.entries(labels)) {
    const item = w.enqueue(s.id, {
      kind: kind as keyof typeof labels,
      title: label,
      detail: label,
      source: "test",
    });
    assert.equal(sessionStatus(s, live, w.state.items).label, label);
    assert.equal(sessionStatus(s, live, w.state.items).attentionKind, kind);
    assert.equal(sessionStatus(other, live, w.state.items).label, "Session open");
    w.snooze(item.id);
    assert.equal(sessionStatus(s, live, w.state.items).label, "Session open");
  }
  const review = w.enqueue(s.id, {
    kind: "review",
    title: "Result",
    detail: "done",
    source: "test",
  });
  const approval = w.enqueue(s.id, {
    kind: "approval",
    title: "Permission",
    detail: "Decide",
    source: "test",
  });
  assert.equal(sessionStatus(s, live, w.state.items).label, "Approval needed");
  assert.equal(w.state.items.at(-2)?.id, review.id, "presentation does not reorder saved items");
  w.resolve(approval.id);
  assert.equal(sessionStatus(s, live, w.state.items).label, "Ready to review");
  s.status = "working";
  assert.equal(sessionStatus(s, live, w.state.items).label, "Working");
  w.resolve(review.id);
  s.status = "waiting";
  assert.equal(sessionStatus(s, live, w.state.items).label, "Idle · ready");
});

test("coordinator settings survive retirement changes and interrupted requests are not retried", () => {
  const w = new Workspace();
  w.state.settings = { retireAfterDays: 0, coordinator: { provider: "claude" } };
  w.retirement(14);
  assert.equal(w.state.settings.coordinator?.provider, "claude");
  w.state.coordinatorRequests = [
    { id: "request", text: "create task", status: "running" },
    { id: "done", text: "open", status: "done" },
  ];
  w.recover();
  assert.equal(w.state.coordinatorRequests[0].status, "failed");
  assert.equal(w.state.messages.length, 1);
  w.recover();
  assert.equal(w.state.messages.length, 1);
});
