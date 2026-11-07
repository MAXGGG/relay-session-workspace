import assert from "node:assert/strict";
import { test } from "node:test";
import { ingestSessionEvent, QuietMonitor } from "../../src/core/attention.ts";
import { Workspace } from "../../src/core/workspace.ts";

test("generic agent events preserve review results and isolate duplicate IDs per session", () => {
  const w = new Workspace();
  const a = w.addSession({ name: "a", project: "p", cwd: ".", mode: "codex" });
  const b = w.addSession({ name: "b", project: "p", cwd: ".", mode: "custom" });
  const event = {
    eventId: "one",
    type: "question" as const,
    text: "Which option?",
    conversationId: "saved",
  };
  ingestSessionEvent(w, a.id, event);
  ingestSessionEvent(w, a.id, event);
  ingestSessionEvent(w, b.id, event);
  assert.equal(w.queue().length, 2);
  assert.equal(a.conversationId, "saved");
  ingestSessionEvent(w, a.id, { eventId: "two", type: "approval" });
  ingestSessionEvent(w, a.id, { eventId: "three", type: "review", text: "Check output" });
  ingestSessionEvent(w, a.id, { eventId: "four", type: "working" });
  assert.deepEqual(
    w
      .queue()
      .filter((item) => item.sessionId === a.id)
      .map((item) => item.kind),
    ["review"],
  );
  ingestSessionEvent(w, a.id, { eventId: "five", type: "idle" });
  assert.equal(a.status, "idle");
  ingestSessionEvent(w, a.id, { eventId: "six", type: "error" });
  assert.equal(a.status, "error");
  ingestSessionEvent(w, a.id, { eventId: "seven", type: "review", text: "Check output" });
  assert.equal(
    w.queue().filter((item) => item.sessionId === a.id && item.kind === "review").length,
    2,
    "distinct turn IDs preserve identical-looking results",
  );
});

test("quiet suggestions never claim completion, repeat while unchanged, or replace real requests", () => {
  let now = 0;
  const w = new Workspace(undefined, () => now);
  const a = w.addSession({
    name: "a",
    project: "p",
    cwd: ".",
    mode: "custom",
    attentionMode: "quiet",
    quietSeconds: 3,
  });
  const b = w.addSession({
    name: "b",
    project: "p",
    cwd: ".",
    mode: "custom",
    attentionMode: "manual",
  });
  const monitor = new QuietMonitor();
  const live = new Set([a.id, b.id]);
  monitor.observe(w, a.id, " ");
  assert.equal(monitor.observations.size, 0);
  monitor.observe(w, a.id, "Working\n");
  monitor.observe(w, b.id, "Working\n");
  assert.equal(monitor.tick(w, live), false);
  now = 3000;
  assert.equal(monitor.tick(w, live), true);
  assert.equal(w.queue()[0].kind, "activity");
  assert.equal(w.queue()[0].confidence, "suggested");
  assert.equal(monitor.tick(w, live), false);
  monitor.observe(w, a.id, "More output\n");
  assert.equal(w.queue().length, 0);
  now = 6000;
  monitor.tick(w, live);
  w.snooze(w.queue()[0].id);
  monitor.observe(w, a.id, "Again\n");
  now = 9000;
  assert.equal(monitor.tick(w, live), false);
  assert.equal(w.state.items.filter((item) => item.status === "snoozed").length, 1);
  monitor.tick(w, new Set());
  assert.equal(monitor.observations.size, 0);
});
