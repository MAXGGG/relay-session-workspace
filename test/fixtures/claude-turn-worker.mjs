// Deterministic Claude event peer. Uses the shipped bridge; never calls a model.
import { spawn } from "node:child_process";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

async function emit(event) {
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL("../../scripts/claude-hook.mjs", import.meta.url))],
    {
      stdio: ["pipe", "ignore", "inherit"],
      windowsHide: true,
    },
  );
  child.stdin.end(JSON.stringify(event));
  await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`Hook exited ${code}`))));
  });
}

await emit({ hook_event_name: "SessionStart", session_id: "fixture-conversation" });
console.log("SIMULATED_CLAUDE_READY");
process.stdout.write("\x1b[?2004h");
let turn = 0;
for await (const raw of readline.createInterface({ input: process.stdin, terminal: false })) {
  const text = raw.replaceAll("\x1b[200~", "").replaceAll("\x1b[201~", "").trim();
  if (!text) continue;
  await emit({ hook_event_name: "UserPromptSubmit" });
  const result = `Response ${++turn}: ${text}`;
  console.log(result);
  await emit({ hook_event_name: "Stop", last_assistant_message: result });
}
