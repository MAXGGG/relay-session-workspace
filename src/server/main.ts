import path from "node:path";
import { createApp } from "./app.ts";

const app = await createApp({
  port: Number(process.env.ZYI_PORT ?? process.env.RELAY_PORT ?? 8123),
  stateDir:
    process.env.ZYI_DATA_DIR || process.env.RELAY_DATA_DIR
      ? path.resolve((process.env.ZYI_DATA_DIR || process.env.RELAY_DATA_DIR) as string)
      : undefined,
  demo: (process.env.ZYI_DEMO ?? process.env.RELAY_DEMO) === "1" || process.argv.includes("--demo"),
});
console.log(`Zyi is ready: ${app.url}`);
console.log(
  "Local only. Close the browser to leave workers running; Ctrl+C stops managed terminals.",
);
let closing = false;
const close = async () => {
  if (closing) return;
  closing = true;
  await app.close();
  process.exitCode = 0;
};
process.on("SIGINT", close);
process.on("SIGTERM", close);
