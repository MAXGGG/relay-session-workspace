import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

export function acquireWorkspace(directory: string): () => void {
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, "workspace.lock");
  if (existsSync(file)) {
    let pid: number;
    try {
      pid = JSON.parse(readFileSync(file, "utf8")).pid;
    } catch {
      throw new Error(
        `Unreadable workspace lock. Check for another Relay server before removing ${file}`,
      );
    }
    if (!Number.isInteger(pid) || pid <= 0) throw new Error(`Invalid workspace lock: ${file}`);
    let alive = true;
    try {
      process.kill(pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") alive = false;
    }
    if (alive)
      throw new Error(
        `This workspace is already open in Relay (PID ${pid}). Use its existing launch link or a different RELAY_DATA_DIR.`,
      );
    unlinkSync(file);
  }
  const contents = JSON.stringify({ pid: process.pid, startedAt: Date.now() });
  writeFileSync(file, contents, { flag: "wx", mode: 0o600 });
  return () => {
    if (existsSync(file) && readFileSync(file, "utf8") === contents) unlinkSync(file);
  };
}
