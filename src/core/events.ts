import type { WorkerEvent } from "./types.ts";
import type { Workspace } from "./workspace.ts";

export function ingestEvent(workspace: Workspace, sessionId: string, event: WorkerEvent): void {
  const session = workspace.session(sessionId);
  if (event.eventId && !workspace.recordEvent(`${sessionId}:${event.eventId}`)) return;
  if (event.session_id) {
    session.claudeId = event.session_id;
    session.conversationId = event.session_id;
  }
  const text = (event.last_assistant_message ?? event.message ?? "").trim().slice(0, 20000);
  const add = (
    kind: "question" | "approval" | "review" | "error",
    detail: string,
    source: string,
    requestKey?: string,
    suggested = false,
  ) => {
    workspace.enqueue(sessionId, {
      kind,
      detail,
      title: detail.replace(/\s+/g, " ").slice(0, 120) || "Session needs attention",
      source,
      ...(requestKey ? { requestKey } : {}),
      confidence: suggested ? "suggested" : "detected",
    });
  };
  const resolveQuestions = (source: string, requestKey?: string) => {
    for (const item of workspace.state.items) {
      if (
        item.sessionId === sessionId &&
        item.status !== "resolved" &&
        item.source === source &&
        (!requestKey || item.requestKey === requestKey)
      )
        workspace.resolve(item.id);
    }
  };

  switch (event.hook_event_name) {
    case "SessionStart":
      session.status = "idle";
      break;
    case "UserPromptSubmit":
      session.status = "working";
      session.lastActivityAt = workspace.now();
      resolveQuestions("turn-question");
      resolveQuestions("idle-prompt");
      break;
    case "PreToolUse":
      if (event.tool_name === "AskUserQuestion") {
        session.status = "waiting";
        for (const question of event.tool_input?.questions ?? []) {
          if (question.question) add("question", question.question, "structured-question");
        }
      }
      break;
    case "PermissionRequest":
      session.status = "waiting";
      add(
        "approval",
        text ||
          `Permission requested for ${event.tool_name ?? "a tool"}. Open the terminal to decide.`,
        "permission",
        event.tool_name,
      );
      break;
    case "PostToolUse":
      if (event.tool_name === "AskUserQuestion") resolveQuestions("structured-question");
      if (event.tool_name) resolveQuestions("permission", event.tool_name);
      session.status = "working";
      break;
    case "Notification":
      if (event.notification_type === "idle_prompt") {
        session.status = "waiting";
        if (
          !workspace.state.items.some(
            (item) => item.sessionId === sessionId && item.status !== "resolved",
          )
        )
          workspace.enqueue(sessionId, {
            kind: "activity",
            title: "Claude is waiting for input",
            detail:
              text ||
              "Claude reported an idle prompt. Check the terminal for a result or question.",
            source: "idle-prompt",
            confidence: "suggested",
          });
      }
      if (event.notification_type === "permission_prompt") {
        session.status = "waiting";
        if (
          !workspace.state.items.some(
            (item) =>
              item.sessionId === sessionId &&
              item.source === "permission" &&
              item.status !== "resolved",
          )
        ) {
          add(
            "approval",
            text || "Permission requested. Open the terminal to decide.",
            "permission",
          );
        }
      }
      break;
    case "Stop": {
      session.lastActivityAt = workspace.now();
      if (event.background_tasks?.length || event.session_crons?.length) {
        session.status = "working";
        break;
      }
      session.status = "waiting";
      const structured = workspace.state.items.some(
        (item) =>
          item.sessionId === sessionId &&
          item.source === "structured-question" &&
          item.status !== "resolved",
      );
      if (!structured) {
        const question = /\?\s*$/.test(text);
        add(
          question ? "question" : "review",
          text || "Claude finished its turn. Open the terminal to review the result.",
          question ? "turn-question" : "turn-result",
          undefined,
          Boolean(text),
        );
      }
      break;
    }
    case "StopFailure":
      session.status = "error";
      add(
        "error",
        text || "Claude could not complete its response. Inspect the terminal.",
        "failure",
      );
      break;
    case "SessionEnd":
      session.status = "stopped";
      break;
    default:
      break;
  }
}
