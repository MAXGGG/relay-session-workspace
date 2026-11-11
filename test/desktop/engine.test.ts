import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { startBackend, stopBackend } from "../../desktop/host.ts";
import { projectRoot } from "../../src/server/app.ts";
import { removeTemporary, temporaryDirectory, waitUntil } from "../helpers.ts";

test("desktop engine stops owned workers and releases the workspace if its parent disconnects", {
  timeout: 30000,
}, async () => {
  const directory = temporaryDirectory();
  const runtime = path.join(
    projectRoot,
    "build/runtime",
    process.platform === "win32" ? "node.exe" : "node",
  );
  const engine = await startBackend(path.join(projectRoot, "build/backend"), directory, runtime);
  try {
    const fixture = path.join(directory, "worker.mjs");
    const pidFile = path.join(directory, "worker.pid");
    writeFileSync(
      fixture,
      `import fs from "node:fs";
const pending = process.argv[2] + ".pending";
fs.writeFileSync(pending, String(process.pid));
fs.renameSync(pending, process.argv[2]);
setInterval(() => {}, 1000);`,
    );
    const token = new URLSearchParams(new URL(engine.url).hash.slice(1)).get("token");
    const response = await fetch(new URL("/api/sessions", engine.url), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: "Disconnect worker",
        cwd: directory,
        mode: "custom",
        executable: runtime,
        args: [fixture, pidFile],
        attentionMode: "manual",
      }),
    });
    assert.equal(response.status, 200);
    await response.json();
    await waitUntil(() => existsSync(pidFile));
    const pid = Number(readFileSync(pidFile, "utf8"));
    assert.ok(Number.isSafeInteger(pid) && pid > 1, `Expected a worker PID, received ${pid}`);
    assert.notEqual(pid, process.pid);
    assert.notEqual(pid, engine.child.pid);
    assert.doesNotThrow(() => process.kill(pid, 0), `Worker ${pid} must be alive before shutdown`);
    engine.child.disconnect();
    await waitUntil(() => engine.child.exitCode !== null);
    assert.equal(engine.child.exitCode, 0);
    assert.equal(existsSync(path.join(directory, "workspace.lock")), false);
    assert.throws(
      () => process.kill(pid, 0),
      { code: "ESRCH" },
      `Worker ${pid} survived engine shutdown`,
    );
  } finally {
    await stopBackend(engine.child);
    removeTemporary(directory);
  }
});
