import type { AttentionItem, Session } from "./types.ts";

export function sessionStatus(
  session: Session,
  live: { stopping: boolean } | undefined,
  items: AttentionItem[],
) {
  if (live?.stopping)
    return { code: "stopping", label: "Stopping", detail: "Waiting for the process to exit." };
  if (!live)
    return session.status === "error"
      ? { code: "error", label: "Error", detail: "The process failed or could not start." }
      : { code: "stopped", label: "Stopped", detail: "Saved session; no live process." };
  if (session.status === "error")
    return {
      code: "error",
      label: "Error",
      detail: "The session reported an error; its process is still running.",
    };
  if (
    items.some(
      (i) =>
        i.sessionId === session.id &&
        i.status === "pending" &&
        (session.status !== "working" || i.kind !== "review"),
    )
  )
    return {
      code: "waiting",
      label: "Needs attention",
      detail: "This session has an item in your attention queue.",
    };
  if (session.status === "working")
    return {
      code: "working",
      label: session.attentionMode === "events" ? "Working" : "Active",
      detail:
        session.attentionMode === "events"
          ? "The agent reported work in progress."
          : "Terminal activity observed; this does not prove the agent is thinking.",
    };
  if (session.status === "waiting")
    return {
      code: "ready",
      label: "Ready for input",
      detail: "The agent finished its turn or reported an idle prompt.",
    };
  return {
    code: "running",
    label: "Running",
    detail: "Process is alive. No work or completion state has been reported.",
  };
}
