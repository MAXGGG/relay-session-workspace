// Fake inference transport for CI. Real model checks are opt-in.
import fs from "node:fs";
import path from "node:path";

const index = process.argv.indexOf("--output-last-message");

let input = "";
for await (const chunk of process.stdin) input += chunk;
if (input === "wait forever") {
  fs.writeFileSync(
    path.join(index >= 0 ? path.dirname(process.argv[index + 1]) : process.cwd(), "ready.json"),
    String(process.pid),
  );
  setInterval(() => {}, 1000);
} else if (input === "fail") {
  console.error("Sign in to the fixture account.");
  process.exitCode = 2;
} else {
  const plan = { message: input, actions: [] };
  if (index >= 0) fs.writeFileSync(process.argv[index + 1], JSON.stringify(plan));
  else console.log(JSON.stringify({ result: JSON.stringify(plan) }));
}
