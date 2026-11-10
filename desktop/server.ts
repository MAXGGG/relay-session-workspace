import { createApp } from "../src/server/app.ts";

// A bundled, ordinary Node runtime owns native PTYs. Electron's ABI and GUI
// lifecycle never enter the terminal engine or the agent's hook commands.
let closing = false;
const server = await createApp({ stateDir: process.env.ZYI_DATA_DIR, port: 0, demo: false });
const close = async () => {
  if (closing) return;
  closing = true;
  await server.close();
  if (process.connected) process.disconnect();
};
process.on("message", (message) => {
  if (message === "shutdown") void close();
});
process.on("disconnect", () => void close());
process.on("SIGTERM", () => void close());
process.on("SIGINT", () => void close());
process.send?.({ type: "ready", url: server.url });
