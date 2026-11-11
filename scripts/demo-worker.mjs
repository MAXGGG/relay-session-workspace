import { randomUUID } from "node:crypto";
import readline from "node:readline";

const [scenario = "question", name = "Sample"] = process.argv.slice(2);
const prompt = () => process.stdout.write("\r\n\x1b[38;5;75m›\x1b[0m ");
console.log(`\x1b[1;36m${name}\x1b[0m  ·  SIMULATED SESSION`);
console.log("This is a sample worker in a real terminal. No AI calls are made.\n");
console.log(
  scenario === "question"
    ? "Should failed refunds retry automatically, or wait for a manual review?"
    : scenario === "review"
      ? "Navigation update is ready for review. Keyboard focus and mobile layout are included."
      : "Research is in progress. Type a message to simulate a follow-up.",
);
prompt();
const emit = async (event) => {
  try {
    await fetch(process.env.RELAY_HOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.RELAY_TOKEN}`,
      },
      body: JSON.stringify({
        relaySessionId: process.env.RELAY_SESSION_ID,
        runId: process.env.RELAY_RUN_ID,
        event: { ...event, eventId: randomUUID() },
      }),
    });
  } catch {
    /* Manager can be offline. */
  }
};
const input = readline.createInterface({ input: process.stdin });
input.on("line", async (line) => {
  if (line.trim() === "exit") {
    input.close();
    process.exit(0);
  }
  await emit({ hook_event_name: "UserPromptSubmit" });
  console.log(`\n\x1b[90mSample worker received:\x1b[0m ${line}`);
  const result = "Sample result is ready for your review. No project files were changed.";
  console.log(`\n${result}`);
  await emit({ hook_event_name: "Stop", last_assistant_message: result });
  prompt();
});
