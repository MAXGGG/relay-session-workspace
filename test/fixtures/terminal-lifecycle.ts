// A child process that must exit naturally: process.exit() would hide leaked PTY workers.

import assert from "node:assert/strict";
import path from "node:path";
import { projectRoot } from "../../src/server/app.ts";
import { testApp } from "../helpers.ts";

const app = await testApp(false);
const finished = Promise.withResolvers<void>();
const mode = process.argv[2];
const count = mode === "concurrent" ? 12 : 1;
let remaining = count;
const originalExit = app.terminals.onExit;
app.terminals.onExit = (id, code) => {
  originalExit(id, code);
  console.log(`EXIT ${id}: ${code}`);
  if (--remaining === 0) finished.resolve();
};
const readyIds = new Set<string>();
let hangupIgnored = false;
app.terminals.onData = (id, _data) => {
  const output = app.terminals.output(id);
  if (output.includes("HANGUP_IGNORED")) hangupIgnored = true;
  const ready =
    mode === "stubborn"
      ? output.includes("WORKER_READY")
      : process.platform === "win32"
        ? output.includes(">")
        : /[$#] /.test(output);
  if (!ready || readyIds.has(id)) return;
  readyIds.add(id);
  console.log(`READY ${id}`);
  if (readyIds.size !== count) return;
  for (const readyId of readyIds) {
    app.terminals.resize(readyId, 110, 30);
    if (mode === "natural") app.terminals.write(readyId, "exit\r");
    else app.terminals.stop(readyId);
    // Late browser resize messages during teardown must be harmless.
    app.terminals.resize(readyId, 90, 25);
  }
};
for (let index = 0; index < count; index++) {
  const session = app.workspace.addSession({
    name: `Lifecycle regression ${index}`,
    project: "fixture",
    cwd: projectRoot,
    mode: mode === "stubborn" ? "custom" : "shell",
    ...(mode === "stubborn"
      ? {
          executable: process.execPath,
          args: [path.join(projectRoot, "test/fixtures/terminal-worker.mjs"), "--ignore-hangup"],
        }
      : {}),
  });
  app.terminals.start(session);
}
const diagnostic = setTimeout(() => {
  console.log(
    "LIFECYCLE_PENDING",
    JSON.stringify({
      remaining,
      ready: readyIds.size,
      records: [...app.terminals.records].map(([id, record]) => ({
        id,
        stopping: record.stopping,
        output: record.output.slice(-500),
      })),
    }),
  );
}, 15000);
diagnostic.unref();
await finished.promise;
clearTimeout(diagnostic);
if (mode === "stubborn" && process.platform !== "win32") assert.equal(hangupIgnored, true);
await app.cleanup();
console.log("LIFECYCLE_COMPLETE");
