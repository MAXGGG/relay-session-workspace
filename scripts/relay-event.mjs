// Agent-independent event bridge. Example: node relay-event.mjs question "Which region?"
import { randomUUID } from "node:crypto";

try {
  const [type, ...words] = process.argv.slice(2);
  if (!["working", "question", "approval", "review", "error", "idle"].includes(type))
    throw new Error("Use working, question, approval, review, error, or idle.");
  if (!process.env.RELAY_EVENT_URL)
    throw new Error("Run this command inside a Relay-managed terminal.");
  const response = await fetch(process.env.RELAY_EVENT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.RELAY_TOKEN}`,
    },
    body: JSON.stringify({
      sessionId: process.env.RELAY_SESSION_ID,
      runId: process.env.RELAY_RUN_ID,
      event: { eventId: randomUUID(), type, text: words.join(" ") },
    }),
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw new Error(`Relay rejected the event (${response.status}).`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
