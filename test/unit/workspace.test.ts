import assert from "node:assert/strict";
import { test } from "node:test";
import { validPriority, Workspace } from "../../src/core/workspace.ts";

function fixture() {
  let time = 1000;
  const workspace = new Workspace(undefined, () => time);
  const first = workspace.addSession({
    name: "First",
    project: "one",
    cwd: ".",
    mode: "shell",
    priority: 2,
  });
  const second = workspace.addSession({
    name: "Second",
    project: "two",
    cwd: ".",
    mode: "claude",
    priority: 1,
  });
  const add = (sessionId: string, title: string) =>
    workspace.enqueue(sessionId, { kind: "review", title, detail: title, source: "test" });
  return {
    workspace,
    first,
    second,
    add,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

test("priority wins over age; viewing and next preserve unresolved work", () => {
  const { workspace: w, first, second, add, advance } = fixture();
  const old = add(first.id, "Old result");
  advance(10);
  const urgent = add(second.id, "Urgent result");
  assert.deepEqual(
    w.queue().map((item) => item.id),
    [urgent.id, old.id],
  );
  assert.equal(w.next()?.id, urgent.id);
  assert.equal(w.state.selectedSessionId, second.id);
  assert.equal(w.next()?.id, old.id);
  assert.equal(w.queue().length, 2);
  w.priority(first.id, 1);
  assert.equal(w.queue()[0].id, old.id);
  w.selectSession(second.id);
  assert.equal(w.state.selectedItemId, null);
  w.selectItem(urgent.id);
  w.resolve(urgent.id);
  w.priority(second.id, 3);
  assert.equal(w.item(urgent.id).priority, 1, "historical priority stays intact");
  assert.equal(w.next()?.id, old.id);
  assert.equal(w.next()?.id, old.id);
  w.resolve(old.id);
  assert.equal(w.next(), null);
});

test("snoozed work returns at the specified time and can resolve while deferred", () => {
  const { workspace: w, first, add, advance } = fixture();
  const item = add(first.id, "Review");
  w.snooze(item.id);
  assert.equal(w.queue().length, 0);
  assert.equal(w.wake(), false);
  advance(30 * 60000);
  assert.equal(w.wake(), true);
  assert.equal(w.queue().length, 1);
  w.snooze(item.id, 10);
  w.resolve(item.id);
  assert.equal(w.item(item.id).snoozedUntil, undefined);
  assert.throws(() => w.snooze(item.id), /resolved/);
  for (const value of [0, -1, 10081, NaN]) assert.throws(() => w.snooze(item.id, value), /Defer/);
});

test("pending events deduplicate while a later occurrence can become a new item", () => {
  const { workspace: w, first, add } = fixture();
  const item = add(first.id, "Same result");
  assert.equal(add(first.id, "Same result").id, item.id);
  w.resolve(item.id);
  assert.notEqual(add(first.id, "Same result").id, item.id);
  assert.equal(w.recordEvent("once"), true);
  assert.equal(w.recordEvent("once"), false);
  for (let i = 0; i < 2010; i++) w.recordEvent(`event-${i}`);
  assert.equal(w.state.processedEvents.length, 2000);
});

test("validate identities, names, priorities, and modes before mutation", () => {
  const { workspace: w, first } = fixture();
  const base = { name: "Valid", project: "project", cwd: ".", mode: "shell" as const };
  assert.throws(() => w.addSession({ ...base, name: " " }), /name/);
  assert.throws(() => w.addSession({ ...base, name: "x".repeat(101) }), /name/);
  assert.throws(() => w.addSession({ ...base, mode: "bad" as "shell" }), /mode/);
  assert.throws(() => w.addSession({ ...base, id: first.id }), /Duplicate/);
  assert.throws(() => w.session("missing"), /not found/);
  assert.throws(() => w.selectItem("missing"), /not found/);
  assert.throws(() => w.selectSession("missing"), /not found/);
  assert.throws(() => w.priority(first.id, 0), /Priority/);
  assert.equal(validPriority(3), 3);
  assert.equal(w.addSession(base).priority, 2);
});

test("snapshots are isolated, equal timestamps use stable IDs, and restart preserves queue", () => {
  const { workspace: w, first, add } = fixture();
  w.addSession({ name: "Demo", project: "demo", cwd: ".", mode: "demo", status: "working" });
  add(first.id, "A");
  add(first.id, "B");
  assert.deepEqual(
    w.queue().map((item) => item.id),
    w
      .queue()
      .map((item) => item.id)
      .sort(),
  );
  const snapshot = w.snapshot();
  snapshot.sessions[0].name = "Different";
  assert.equal(w.session(first.id).name, "First");
  for (let i = 0; i < 105; i++) w.message(i % 2 ? "user" : "assistant", `Message ${i}`);
  assert.equal(w.state.messages.length, 100);
  const restored = new Workspace(w.snapshot());
  restored.recover();
  assert.equal(restored.session(first.id).status, "stopped");
  assert.equal(restored.state.sessions.find((s) => s.mode === "demo")?.status, "working");
  assert.equal(restored.queue().length, 2);
});
