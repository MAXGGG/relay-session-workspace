import type { Workspace } from "../core/workspace.ts";
import type { Store } from "./store.ts";
import type { Terminals } from "./terminals.ts";

export async function deliverReply(
  workspace: Workspace,
  terminals: Terminals,
  store: Store,
  input: {
    id: string;
    sessionId: string;
    runId: string;
    text: string;
    itemId?: string;
  },
) {
  if (typeof input.id !== "string" || !/^[\w-]{1,100}$/.test(input.id))
    throw new Error("Invalid delivery ID.");
  if (
    typeof input.text !== "string" ||
    !input.text.trim() ||
    input.text.length > 8000 ||
    Array.from(input.text).some((character) => {
      const code = character.charCodeAt(0);
      return code === 127 || (code < 32 && ![9, 10, 13].includes(code));
    })
  )
    throw new Error("Reply must contain 1–8000 characters without terminal control codes.");
  const previous = workspace.state.deliveries?.find((entry) => entry.id === input.id);
  if (previous) {
    if (
      previous.sessionId !== input.sessionId ||
      previous.runId !== input.runId ||
      previous.text !== input.text
    )
      throw new Error("Delivery ID already belongs to a different reply.");
    return previous;
  }
  const session = workspace.session(input.sessionId);
  const terminal = terminals.records.get(session.id);
  if (!terminal || terminal.stopping || input.runId !== terminal.runId)
    throw new Error("Terminal changed or stopped. Open it again before sending.");
  if (terminal.replyPending)
    throw new Error("A reply is already being submitted to this terminal. Wait for it to finish.");
  if (input.itemId) {
    const item = workspace.item(input.itemId);
    if (item.sessionId !== session.id)
      throw new Error("The attention item belongs to a different session.");
    if (item.kind === "approval") throw new Error("Decide approvals in the original terminal.");
  }
  const delivery = {
    ...input,
    status: "pending" as "pending" | "sent" | "failed" | "uncertain",
    at: workspace.now(),
  };
  workspace.state.deliveries ??= [];
  workspace.state.deliveries.push(delivery);
  workspace.state.deliveries = workspace.state.deliveries.slice(-500);
  // Write-ahead receipt: a crash cannot silently cause the browser to resend a prompt.
  store.save(workspace.snapshot());
  terminal.replyPending = true;
  let written = false;
  try {
    const text = input.text.replace(/\r\n?/g, "\n");
    if (session.mode === "claude" || session.mode === "codex") {
      terminals.write(session.id, `\x1b[200~${text}\x1b[201~`);
      written = true;
      // Interactive agents distinguish a paste burst from the subsequent Enter key.
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (terminals.records.get(session.id)?.runId !== input.runId)
        throw new Error(
          "Terminal changed while sending. Inspect the original terminal before retrying.",
        );
      terminals.write(session.id, "\r");
    } else {
      terminals.write(session.id, `${text.replaceAll("\n", "\r")}\r`);
      written = true;
    }
    delivery.status = "sent";
    if (
      workspace.state.replyDraft?.sessionId === session.id &&
      workspace.state.replyDraft.text === input.text
    )
      delete workspace.state.replyDraft;
    session.lastActivityAt = workspace.now();
    workspace.message(
      "assistant",
      `Sent your reply to ${session.name} (${session.id}). Check its terminal for the response.`,
    );
  } catch (error) {
    delivery.status = written ? "uncertain" : "failed";
    store.save(workspace.snapshot());
    throw error;
  } finally {
    terminal.replyPending = false;
  }
  store.save(workspace.snapshot());
  return delivery;
}
