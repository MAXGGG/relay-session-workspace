import type { AttentionItem, Session } from "./types.ts";

const attentionStates = {
  error: {
    rank: 0,
    label: "Error needs attention",
    detail: "An error is waiting in your attention queue.",
  },
  approval: {
    rank: 1,
    label: "Approval needed",
    detail: "A permission request needs your decision in the terminal.",
  },
  question: {
    rank: 2,
    label: "Waiting for input",
    detail: "A question needs your answer. Open the terminal to reply.",
  },
  review: { rank: 3, label: "Ready to review", detail: "A result is waiting for your review." },
  activity: {
    rank: 4,
    label: "Check activity",
    detail: "Activity suggestion only. Check the terminal; completion is not confirmed.",
  },
};

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
  const pending = items
    .filter(
      (i) =>
        i.sessionId === session.id &&
        i.status === "pending" &&
        (session.status !== "working" || i.kind !== "review"),
    )
    .sort((a, b) => attentionStates[a.kind].rank - attentionStates[b.kind].rank);
  if (pending.length)
    return {
      code: "waiting",
      attentionKind: pending[0].kind,
      label: attentionStates[pending[0].kind].label,
      detail: attentionStates[pending[0].kind].detail,
    };
  if (session.status === "working")
    return {
      code: "working",
      label: session.attentionMode === "events" ? "Working" : "Terminal active",
      detail:
        session.attentionMode === "events"
          ? "The agent reported work in progress."
          : "Terminal activity observed; this does not prove the agent is thinking.",
    };
  if (session.status === "waiting")
    return {
      code: "ready",
      label: "Idle · ready",
      detail: "The last turn finished or an idle prompt was reported. No pending attention items.",
    };
  return {
    code: "running",
    label: "Session open",
    detail: "Process is alive. No work or completion state has been reported.",
  };
}
