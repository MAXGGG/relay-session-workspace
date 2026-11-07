import assert from "node:assert/strict";
import { test } from "node:test";
import { coordinate } from "../../src/core/coordinator.ts";
import { seedDemo } from "../../src/core/demo.ts";
import { Workspace } from "../../src/core/workspace.ts";

test("coordinator navigates by task ID or session name without answering or resolving", () => {
  const w = new Workspace();
  seedDemo(w, ".");
  assert.match(coordinate(w, "next task"), /Payments API/);
  const task = w.state.selectedItemId as string;
  assert.match(coordinate(w, "next"), /Website/);
  assert.match(coordinate(w, `open ${task}`), new RegExp(task));
  assert.equal(w.state.selectedSessionId, "session-payments");
  assert.equal(w.queue().length, 2);
  assert.match(coordinate(w, "show website"), /Opened Website/);
  assert.equal(w.state.selectedItemId, null);
  assert.match(coordinate(w, "switch to session-payments"), /Opened Payments/);
  assert.match(coordinate(w, "open Payments API"), /Opened Payments/);
});

test("priority, defer, and explicit review commands persist their effects", () => {
  const w = new Workspace();
  seedDemo(w, ".");
  assert.match(coordinate(w, "make payments P3"), /now P3/);
  assert.match(coordinate(w, "what's next?"), /Website/);
  assert.match(coordinate(w, "defer this for 10 minutes"), /10 minutes/);
  assert.equal(w.queue().length, 1);
  assert.match(coordinate(w, "next task"), /Payments/);
  assert.match(coordinate(w, "reviewed"), /handled/);
  assert.match(coordinate(w, "status"), /clear/);
  assert.match(coordinate(w, "next"), /clear/);
  assert.match(coordinate(w, "defer"), /resolved/);
  const review = w.state.items.find((i) => i.kind === "review");
  assert.ok(review);
  w.selectItem(review.id);
  assert.match(coordinate(w, "snooze"), /30 minutes/);
  assert.match(coordinate(w, "defer 0"), /1–10080/);
  assert.match(coordinate(w, "mark done"), /handled/);
});

test("ambiguous, unsupported, missing, and invalid requests cannot silently route work", () => {
  const w = new Workspace();
  seedDemo(w, ".");
  w.addSession({
    name: "Payments reporting",
    project: "checkout-service",
    cwd: ".",
    mode: "shell",
  });
  const before = w.state.selectedSessionId;
  assert.match(coordinate(w, "open payments"), /Which session/);
  assert.equal(w.state.selectedSessionId, before);
  assert.match(coordinate(w, "open nonexistent"), /No session/);
  assert.match(coordinate(w, "delete all my files"), /does not answer/);
  assert.match(coordinate(w, "done"), /Open a queue item/);
  assert.match(coordinate(w, "defer 5"), /Open a queue item/);
  assert.match(coordinate(w, "what needs my attention?"), /P1/);
  assert.throws(() => coordinate(w, " "), /Enter a command/);
  assert.throws(() => coordinate(w, "x".repeat(2001)), /Enter a command/);
  assert.equal(w.state.messages.at(-1)?.role, "assistant");
});

test("reply commands only prepare an explicit target draft and refuse ambiguity", () => {
  const w = new Workspace();
  seedDemo(w, ".");
  assert.match(coordinate(w, "reply to Payments API: Use option B"), /Nothing has been sent/);
  assert.equal(w.state.replyDraft?.sessionId, "session-payments");
  assert.equal(w.state.replyDraft?.text, "Use option B");
  const draftId = w.state.replyDraft?.id;
  assert.match(coordinate(w, "reply to missing: yes"), /No session/);
  assert.equal(w.state.replyDraft?.id, draftId);
});
