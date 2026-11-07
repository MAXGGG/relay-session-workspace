import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { projectRoot } from "../../src/server/app.ts";

for (const mode of ["natural", "stopped", "concurrent", "stubborn"]) {
  test(`a ${mode} terminal releases resources so its host can exit naturally`, async () => {
    // Teardown races need several independent hosts, not just one successful run.
    const attempts = mode === "concurrent" ? 5 : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const { stdout, stderr } = await promisify(execFile)(
        process.execPath,
        [path.join(projectRoot, "test/fixtures/terminal-lifecycle.ts"), mode],
        { timeout: 20000, windowsHide: true },
      );
      assert.match(stdout, /LIFECYCLE_COMPLETE/);
      assert.equal(stderr, "");
    }
  });
}
