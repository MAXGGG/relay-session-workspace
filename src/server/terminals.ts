import { existsSync } from "node:fs";
import path from "node:path";
import * as pty from "node-pty";
import type { Session } from "../core/types.ts";
import { releaseWindowsPty } from "./windows-pty.ts";

interface TerminalRecord {
  process: pty.IPty;
  output: string;
  finished: Promise<void>;
  stopping: boolean;
}
export class Terminals {
  records = new Map<string, TerminalRecord>();
  closing = false;
  root: string;
  hookConfig: string;
  endpoint: string;
  token: string;
  onData: (id: string, data: string) => void;
  onExit: (id: string, exitCode: number) => void;
  constructor(options: {
    root: string;
    hookConfig: string;
    endpoint: string;
    token: string;
    onData: (id: string, data: string) => void;
    onExit: (id: string, code: number) => void;
  }) {
    this.root = options.root;
    this.hookConfig = options.hookConfig;
    this.endpoint = options.endpoint;
    this.token = options.token;
    this.onData = options.onData;
    this.onExit = options.onExit;
  }
  start(session: Session): boolean {
    if (this.closing) throw new Error("Workspace is shutting down.");
    const existing = this.records.get(session.id);
    if (existing?.stopping) throw new Error("Terminal is still stopping. Try again shortly.");
    if (existing) return false;
    let executable: string;
    let args: string[];
    if (session.mode === "demo") {
      executable = process.execPath;
      args = [
        path.join(this.root, "scripts/demo-worker.mjs"),
        session.demoScenario ?? "question",
        session.name,
      ];
    } else if (session.mode === "shell") {
      executable =
        process.platform === "win32"
          ? process.env.ComSpec || "cmd.exe"
          : process.env.SHELL || "/bin/bash";
      args = process.platform === "win32" ? ["/d", "/q"] : [];
    } else {
      executable = session.executable || findClaude() || "claude";
      args = ["--settings", this.hookConfig];
      if (session.claudeId) args.push("--resume", session.claudeId);
    }
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    );
    Object.assign(env, {
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      RELAY_SESSION_ID: session.id,
      RELAY_HOOK_URL: this.endpoint,
      RELAY_TOKEN: this.token,
    });
    const child = pty.spawn(executable, args, {
      name: "xterm-256color",
      cols: 100,
      rows: 24,
      cwd: session.cwd,
      env,
      // The bundled ConPTY closes its console without the legacy process-list race.
      ...(process.platform === "win32" ? { useConptyDll: true } : {}),
    });
    const finished = Promise.withResolvers<void>();
    const record = { process: child, output: "", finished: finished.promise, stopping: false };
    this.records.set(session.id, record);
    child.onData((data) => {
      record.output = (record.output + data).slice(-250000);
      this.onData(session.id, data);
    });
    child.onExit(({ exitCode }) => {
      releaseWindowsPty(child);
      this.records.delete(session.id);
      finished.resolve();
      if (!this.closing) this.onExit(session.id, exitCode);
    });
    return true;
  }
  write(id: string, data: string): void {
    const record = this.records.get(id);
    if (!record) throw new Error("Terminal is stopped. Start it before typing.");
    if (typeof data !== "string" || data.length > 32768)
      throw new Error("Terminal input is too large.");
    record.process.write(data);
  }
  resize(id: string, cols: number, rows: number): void {
    if (
      !Number.isInteger(cols) ||
      !Number.isInteger(rows) ||
      cols < 2 ||
      cols > 500 ||
      rows < 2 ||
      rows > 200
    )
      return;
    const record = this.records.get(id);
    if (record && !record.stopping) record.process.resize(cols, rows);
  }
  output(id: string): string {
    return this.records.get(id)?.output ?? "";
  }
  stop(id: string): void {
    const record = this.records.get(id);
    if (!record || record.stopping) return;
    record.stopping = true;
    record.process.kill();
  }
  async dispose(): Promise<void> {
    this.closing = true;
    const pending = [...this.records.values()].map((record) => record.finished);
    for (const id of this.records.keys()) {
      try {
        this.stop(id);
      } catch {
        /* Process already exited. */
      }
    }
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.all(pending),
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error("Terminal shutdown timed out.")), 10000);
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function findClaude(): string | undefined {
  const names = process.platform === "win32" ? ["claude.exe", "claude"] : ["claude"];
  const directories = (process.env.PATH || "").split(path.delimiter);
  if (process.env.USERPROFILE)
    directories.push(path.join(process.env.USERPROFILE, ".local", "bin"));
  for (const directory of directories)
    for (const name of names) {
      const candidate = path.join(directory, name);
      if (existsSync(candidate)) return candidate;
    }
  return undefined;
}
