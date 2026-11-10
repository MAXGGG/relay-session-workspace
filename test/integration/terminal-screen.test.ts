import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import headless from "@xterm/headless";
import { WebSocket } from "ws";
import { projectRoot } from "../../src/server/app.ts";
import { testApp, waitUntil } from "../helpers.ts";

test("reattaching restores the current screen and cursor after raw history has been truncated", async () => {
  const app = await testApp(false);
  let socket: WebSocket | undefined;
  const mirror = new headless.Terminal({ cols: 100, rows: 24, allowProposedApi: true });
  try {
    const result = await app.request("/api/sessions", {
      name: "Border",
      mode: "custom",
      cwd: projectRoot,
      executable: process.execPath,
      args: [path.join(projectRoot, "test/fixtures/terminal-border.mjs")],
    });
    const id = result.body.state.selectedSessionId;
    await waitUntil(() => app.terminals.output(id).includes("BORDER_READY"));
    socket = new WebSocket(`${app.address.replace("http", "ws")}/terminal?token=${app.token}`);
    const attached = new Promise<Record<string, any>>((resolve) =>
      socket?.on("message", (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.type === "attached") resolve(message);
      }),
    );
    await new Promise<void>((resolve) => socket?.once("open", resolve));
    socket.send(JSON.stringify({ type: "attach", sessionId: id }));
    const snapshot = await attached;
    await new Promise<void>((resolve) => mirror.write(snapshot.data, resolve));
    assert.match(mirror.buffer.active.getLine(0)?.translateToString() ?? "", /┌── Input ──┐/);
    assert.match(mirror.buffer.active.getLine(2)?.translateToString() ?? "", /└───────────┘/);
    assert.equal(mirror.buffer.active.cursorY, 1);
    assert.equal(mirror.buffer.active.cursorX, 3);
    assert.equal(snapshot.cols, 100);
  } finally {
    socket?.terminate();
    mirror.dispose();
    await app.cleanup();
  }
});
