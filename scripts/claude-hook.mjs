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
  // Bound the *encoded* payload, including Unicode and JSON escaping. The
  // receiver accepts 64 KiB; full responses and tool payloads can be much larger.
  const event = {};
  for (const key of ["hook_event_name", "session_id", "notification_type", "tool_name"])
    if (typeof source[key] === "string") event[key] = source[key].slice(0, 200);
  for (const [key, limit] of [
    ["last_assistant_message", 4000],
    ["message", 2000],
  ])
    if (typeof source[key] === "string") event[key] = source[key].slice(0, limit);
  for (const key of ["background_tasks", "session_crons"])
    if (Array.isArray(source[key]) && source[key].length) event[key] = [{}];
  if (source.tool_name === "AskUserQuestion" && Array.isArray(source.tool_input?.questions))
    event.tool_input = {
      questions: source.tool_input.questions.slice(0, 5).map((q) => ({
        question: typeof q?.question === "string" ? q.question.slice(0, 500) : "",
      })),
    };
  event.eventId = randomUUID();
  const response = await fetch(process.env.RELAY_HOOK_URL, {
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
    signal: AbortSignal.timeout(3000),
  });
  await response.body?.cancel();
  if (!response.ok) throw new Error("Hook was rejected");
} catch {
  // Report failure without exposing the token, endpoint, or conversation text.
  process.stderr.write(
    "[Zyi] Could not deliver session status. Check Zyi's connection indicator.\n",
  );
}
