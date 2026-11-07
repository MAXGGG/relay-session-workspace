// A deterministic terminal peer for real PTY tests. It never calls an AI service.
import { randomUUID } from "node:crypto";
import readline from "node:readline";

console.log(`ARGS:${JSON.stringify(process.argv.slice(2))}`);
console.log("WORKER_READY");
const lines = readline.createInterface({ input: process.stdin, terminal: false });
lines.on("line", async (line) => {
  if (line === "exit") return process.exit(0);
  if (line === "fail") return process.exit(7);
  if (line.startsWith("event:")) {
    const event = JSON.parse(line.slice(6));
    const response = await fetch(process.env.RELAY_EVENT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.RELAY_TOKEN}`,
      },
      body: JSON.stringify({
        sessionId: process.env.RELAY_SESSION_ID,
        runId: process.env.RELAY_RUN_ID,
        event: { eventId: randomUUID(), ...event },
      }),
    });
    console.log(`EVENT_STATUS:${response.status}`);
  } else console.log(`RECEIVED:${JSON.stringify(line)}`);
});
