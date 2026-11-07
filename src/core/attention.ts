import type { SessionEvent } from "./types.ts";
import type { Workspace } from "./workspace.ts";

export function ingestSessionEvent(
  workspace: Workspace,
  sessionId: string,
  event: SessionEvent,
): void {
  const session = workspace.session(sessionId);
  if (!workspace.recordEvent(`${sessionId}:${event.eventId}`)) return;
  session.lastActivityAt = workspace.now();
  if (event.conversationId) session.conversationId = event.conversationId;
  if (event.type === "working") {
    session.status = "working";
    for (const item of workspace.state.items) {
      if (
        item.sessionId === sessionId &&
        item.status !== "resolved" &&
        (item.source === "terminal-quiet" ||
          item.source === "agent-question" ||
          item.source === "agent-approval")
      )
        workspace.resolve(item.id);
    }
  } else if (event.type === "idle") session.status = "idle";
  else {
    session.status = event.type === "error" ? "error" : "waiting";
    const text =
      event.text ||
      (event.type === "approval"
        ? "Approval requested. Decide in the original terminal."
        : "Session needs your attention.");
    workspace.enqueue(sessionId, {
      kind: event.type,
      title: text.replace(/\s+/g, " ").slice(0, 120),
      detail: text,
      source: `agent-${event.type}`,
      requestKey: event.eventId,
    });
  }
}

/** Silence is a navigation hint, never evidence of success or a permission request. */
export class QuietMonitor {
  observations = new Map<string, { lastAt: number; text: string; emitted: boolean }>();

  observe(workspace: Workspace, id: string, plain: string): void {
    if (!plain.trim()) return;
    const session = workspace.session(id);
    session.lastActivityAt = workspace.now();
    const previous = this.observations.get(id);
    this.observations.set(id, {
      lastAt: workspace.now(),
      text: `${previous?.text ?? ""}${plain}`.slice(-4000),
      emitted: false,
    });
    if (session.attentionMode === "quiet") {
      for (const item of workspace.state.items) {
        if (
          item.sessionId === id &&
          item.source === "terminal-quiet" &&
          item.confidence === "suggested" &&
          item.status === "pending"
        )
          workspace.resolve(item.id);
      }
      if (
        !workspace.state.items.some(
          (item) =>
            item.sessionId === id &&
            item.status !== "resolved" &&
            ["question", "approval", "error"].includes(item.kind),
        )
      )
        session.status = "working";
    }
  }

  tick(workspace: Workspace, running: Set<string>): boolean {
    let changed = false;
    for (const [id, observation] of this.observations) {
      if (!running.has(id)) {
        this.observations.delete(id);
        continue;
      }
      const session = workspace.session(id);
      if (
        session.attentionMode !== "quiet" ||
        observation.emitted ||
        workspace.now() - observation.lastAt < (session.quietSeconds ?? 15) * 1000
      )
        continue;
      observation.emitted = true;
      if (workspace.state.items.some((item) => item.sessionId === id && item.status !== "resolved"))
        continue;
      workspace.enqueue(id, {
        kind: "activity",
        title: "Terminal became quiet — check when ready",
        detail: `No output for ${session.quietSeconds ?? 15} seconds. The process may still be working; this is not a completion or question detector.\n\nRecent output:\n${observation.text}`,
        source: "terminal-quiet",
        confidence: "suggested",
      });
      session.status = "idle";
      changed = true;
    }
    return changed;
  }
}
