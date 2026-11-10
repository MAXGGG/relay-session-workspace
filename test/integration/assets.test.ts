import assert from "node:assert/strict";
import test from "node:test";
import { removeTemporary, temporaryDirectory, testApp } from "../helpers.ts";

test("a missing packaged asset returns an error without crashing the terminal server", async () => {
  const assets = temporaryDirectory();
  const app = await testApp(false, { assetsRoot: assets });
  try {
    const response = await fetch(app.address);
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /ENOENT/);
    assert.equal((await fetch(`${app.address}/health`)).status, 200);
    assert.equal((await app.request("/api/state")).response.status, 200);
  } finally {
    await app.cleanup();
    removeTemporary(assets);
  }
});
