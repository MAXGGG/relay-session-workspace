// A hook must never prevent the worker from progressing when Zyi is unavailable.
import { randomUUID } from "node:crypto";

try {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 2_000_000) process.exit(0);
  }
  const source = JSON.parse(input);
  // Forward only the fields needed by the queue, not arbitrary tool results or credentials.
  const event = Object.fromEntries(
    [
      "hook_event_name",
      "session_id",
      "last_assistant_message",
      "message",
      "notification_type",
      "tool_name",
      "background_tasks",
      "session_crons",
    ]
      .filter((key) => source[key] !== undefined)
      .map((key) => [key, source[key]]),
  );
  if (source.tool_name === "AskUserQuestion") event.tool_input = source.tool_input;
  event.eventId = randomUUID();
  await fetch(process.env.RELAY_HOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.RELAY_TOKEN}`,
    },
    body: JSON.stringify({
      relaySessionId: process.env.RELAY_SESSION_ID,
      runId: process.env.RELAY_RUN_ID,
      event,
    }),
    signal: AbortSignal.timeout(1800),
  });
} catch {
  /* Zyi may have been closed; leave the actual Claude session alone. */
}
