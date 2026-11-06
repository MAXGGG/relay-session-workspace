import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { projectRoot } from "../../src/server/app.ts";

for (const mode of ["natural", "stopped", "concurrent"]) {
  test(`a ${mode} terminal releases resources so its host can exit naturally`, async () => {
    const { stdout, stderr } = await promisify(execFile)(
      process.execPath,
      [path.join(projectRoot, "test/fixtures/terminal-lifecycle.ts"), mode],
      { timeout: 20000, windowsHide: true },
    );
    assert.match(stdout, /LIFECYCLE_COMPLETE/);
    assert.equal(stderr, "");
  });
}
