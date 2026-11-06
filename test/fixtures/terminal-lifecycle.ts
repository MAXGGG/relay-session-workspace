// A child process that must exit naturally: process.exit() would hide leaked PTY workers.

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
  if (--remaining === 0) finished.resolve();
};
const readyIds = new Set<string>();
app.terminals.onData = (id, _data) => {
  const output = app.terminals.output(id);
  const ready = process.platform === "win32" ? output.includes(">") : /[$#] /.test(output);
  if (!ready || readyIds.has(id)) return;
  readyIds.add(id);
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
    mode: "shell",
  });
  app.terminals.start(session);
}
await finished.promise;
await app.cleanup();
console.log("LIFECYCLE_COMPLETE");
