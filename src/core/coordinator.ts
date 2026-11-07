import type { Session } from "./types.ts";
import type { Workspace } from "./workspace.ts";

export function coordinate(workspace: Workspace, raw: string): string {
  const input = raw.trim();
  if (!input || input.length > 2000) throw new Error("Enter a command of 1–2000 characters.");
  workspace.message("user", input);
  let reply: string;
  try {
    reply = execute(workspace, input);
  } catch (error) {
    reply = error instanceof Error ? error.message : "That action could not be completed.";
  }
  workspace.message("assistant", reply);
  return reply;
}

function findSession(workspace: Workspace, query: string): Session {
  const normalized = query.trim().toLowerCase();
  const exact = workspace.state.sessions.filter(
    (session) =>
      session.id.toLowerCase() === normalized || session.name.toLowerCase() === normalized,
  );
  const matches = exact.length
    ? exact
    : workspace.state.sessions.filter((session) =>
        `${session.name} ${session.project}`.toLowerCase().includes(normalized),
      );
  if (matches.length > 1)
    throw new Error(
      `Which session? ${matches.map((session) => `${session.name} (${session.id})`).join(", ")}`,
    );
  if (!matches.length)
    throw new Error(`No session matches “${query}”. Use its name or session ID.`);
  return matches[0];
}

function execute(workspace: Workspace, input: string): string {
  const reply = /^reply to (.+?):\s*([\s\S]+)$/i.exec(input);
  if (reply) {
    const session = findSession(workspace, reply[1]);
    workspace.state.replyDraft = { id: randomUUID(), sessionId: session.id, text: reply[2] };
    workspace.selectSession(session.id);
    return `Reply drafted for ${session.name} (${session.id}). Review the target and text, then select Send to terminal. Nothing has been sent yet.`;
  }
  if (/^(next(?: task)?|what(?:'s| is) next\??)$/i.test(input)) {
    const item = workspace.next();
    if (!item)
      return "Your attention queue is clear. Deferred items will return when their timer expires.";
    return `Opening ${workspace.session(item.sessionId).name} · P${item.priority} ${item.kind}. ${item.title}\nReply in the terminal or mark the item handled. Opening it does not resolve it.`;
  }
  const open = /^(?:open|show|switch to)\s+(.+)$/i.exec(input);
  if (open) {
    const query = open[1].trim();
    const item = workspace.state.items.find(
      (entry) => entry.id.toLowerCase() === query.toLowerCase(),
    );
    if (item) {
      workspace.selectItem(item.id);
      return `Opened ${item.id} in ${workspace.session(item.sessionId).name}. ${item.title}`;
    }
    const session = findSession(workspace, query);
    workspace.selectSession(session.id);
    return `Opened ${session.name}. Its terminal is ready below.`;
  }
  const priority = /^(?:make|set|prioritize)\s+(.+?)\s+(?:priority\s+|to\s+)?p?([123])$/i.exec(
    input,
  );
  if (priority) {
    const session = findSession(workspace, priority[1]);
    workspace.priority(session.id, Number(priority[2]));
    return `${session.name} is now P${priority[2]}. Its pending items have been reordered.`;
  }
  if (/^(?:done|reviewed|mark (?:reviewed|handled|done))$/i.test(input)) {
    if (!workspace.state.selectedItemId) return "Open a queue item first, then mark it handled.";
    workspace.resolve(workspace.state.selectedItemId);
    return "Marked handled. Say “next task” when you are ready.";
  }
  const defer =
    /^(?:defer|snooze)(?:\s+(?:this|it))?(?:\s+(?:for\s+)?(\d+)(?:\s*(?:m|min|minutes?))?)?$/i.exec(
      input,
    );
  if (defer) {
    if (!workspace.state.selectedItemId) return "Open a queue item before deferring it.";
    const minutes = Number(defer[1] ?? 30);
    workspace.snooze(workspace.state.selectedItemId, minutes);
    return `Deferred for ${minutes} minutes. It will return automatically; nothing was sent to the worker.`;
  }
  if (/^(status|summary|what needs (?:my )?attention\??)$/i.test(input)) {
    const queue = workspace.queue();
    return queue.length
      ? queue
          .map(
            (item) =>
              `P${item.priority} · ${workspace.session(item.sessionId).name} · ${item.kind}: ${item.title}`,
          )
          .join("\n")
      : "No pending items. Your queue is clear.";
  }
  return "I can navigate and organize: “next task”, “open payments”, “open task-…”, “make payments P1”, “defer 30”, “reviewed”, “status”, or “reply to payments: your message”. Reply commands prepare a draft for your review. Relay does not answer workers or execute coordinator text as shell commands.";
}

import { randomUUID } from "node:crypto";
