import path from "node:path";
import { createApp } from "./app.ts";

const app = await createApp({
  port: Number(process.env.RELAY_PORT ?? 8123),
  stateDir: process.env.RELAY_DATA_DIR ? path.resolve(process.env.RELAY_DATA_DIR) : undefined,
  demo: process.env.RELAY_DEMO !== "0",
});
console.log(`Relay is ready: ${app.url}`);
console.log("Local only. Sample sessions are simulated. Press Ctrl+C to stop.");
let closing = false;
const close = async () => {
  if (closing) return;
  closing = true;
  await app.close();
  process.exitCode = 0;
};
process.on("SIGINT", close);
process.on("SIGTERM", close);
