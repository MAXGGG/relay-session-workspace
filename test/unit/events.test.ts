import assert from "node:assert/strict";
import { test } from "node:test";
import { ingestEvent } from "../../src/core/events.ts";
import type { WorkerEvent } from "../../src/core/types.ts";
import { Workspace } from "../../src/core/workspace.ts";

function fixture() {
  const w = new Workspace();
  const session = w.addSession({ name: "Worker", project: "repo", cwd: ".", mode: "claude" });
  return { w, session, emit: (event: WorkerEvent) => ingestEvent(w, session.id, event) };
}

test("turn question, user answer, and review are separate attention transitions", () => {
  const { w, session, emit } = fixture();
  emit({ hook_event_name: "SessionStart", session_id: "claude-conversation" });
  assert.equal(session.claudeId, "claude-conversation");
  emit({ hook_event_name: "Stop", last_assistant_message: "Which approach?", eventId: "one" });
  emit({ hook_event_name: "Stop", last_assistant_message: "Duplicate?", eventId: "one" });
  assert.equal(w.queue().length, 1);
  assert.equal(w.queue()[0].kind, "question");
  assert.equal(w.queue()[0].confidence, "suggested");
  emit({ hook_event_name: "UserPromptSubmit" });
  assert.equal(w.queue().length, 0);
  assert.equal(session.status, "working");
  emit({ hook_event_name: "Stop", message: "The change is ready." });
  emit({ hook_event_name: "UserPromptSubmit" });
  assert.equal(w.queue()[0].kind, "review", "new prompts do not silently accept results");
  emit({ hook_event_name: "Stop", last_assistant_message: "" });
  assert.equal(w.queue().length, 1);
});

test("structured questions resolve only after the question tool completes", () => {
  const { w, emit } = fixture();
  emit({ hook_event_name: "PreToolUse", tool_name: "Read" });
  emit({ hook_event_name: "PreToolUse", tool_name: "AskUserQuestion" });
  emit({
    hook_event_name: "PreToolUse",
    tool_name: "AskUserQuestion",
    tool_input: {
      questions: [
        { header: "Empty" },
        { question: "Pick a database" },
        { question: "Pick a region" },
      ],
    },
  });
  assert.equal(w.queue().length, 2);
  emit({ hook_event_name: "Stop", last_assistant_message: "Please answer the questions." });
  assert.equal(w.queue().length, 2);
  emit({ hook_event_name: "UserPromptSubmit" });
  assert.equal(w.queue().length, 2);
  emit({ hook_event_name: "PostToolUse", tool_name: "AskUserQuestion" });
  assert.equal(w.queue().length, 0);
});

test("permission notices deduplicate and only matching execution clears the request", () => {
  const { w, emit } = fixture();
  emit({ hook_event_name: "PermissionRequest", tool_name: "Bash" });
  emit({
    hook_event_name: "Notification",
    notification_type: "permission_prompt",
    message: "Permission needed",
  });
  emit({ hook_event_name: "Notification", notification_type: "idle_prompt" });
  assert.equal(w.queue().length, 1);
  emit({ hook_event_name: "PostToolUse", tool_name: "Read" });
  emit({ hook_event_name: "PostToolUse" });
  assert.equal(w.queue().length, 1);
  emit({ hook_event_name: "PostToolUse", tool_name: "Bash" });
  assert.equal(w.queue().length, 0);
  emit({ hook_event_name: "PermissionRequest" });
  assert.match(w.queue()[0].title, /a tool/);
  w.resolve(w.queue()[0].id);
  emit({ hook_event_name: "Notification", notification_type: "permission_prompt" });
  assert.match(w.queue()[0].title, /Permission requested/);
});

test("background work, failures and session closure preserve pending attention", () => {
  const { w, session, emit } = fixture();
  emit({
    hook_event_name: "Stop",
    last_assistant_message: "Waiting for worker",
    background_tasks: [{}],
  });
  assert.equal(session.status, "working");
  assert.equal(w.queue().length, 0);
  emit({ hook_event_name: "Stop", session_crons: [{}] });
  assert.equal(session.status, "working");
  emit({ hook_event_name: "StopFailure" });
  assert.equal(w.queue()[0].kind, "error");
  emit({ hook_event_name: "StopFailure", message: "Rate limit" });
  assert.equal(w.queue().length, 2);
  emit({ hook_event_name: "SessionEnd" });
  emit({ hook_event_name: "Unknown" });
  assert.equal(session.status, "stopped");
  assert.equal(w.queue().length, 2);
});
