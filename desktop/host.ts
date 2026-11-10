import { type ChildProcess, execFile, fork } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export async function desktopEnvironment(runtime: string): Promise<NodeJS.ProcessEnv> {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  // Finder does not inherit the interactive shell PATH (Homebrew, nvm, etc.).
  if (process.platform === "darwin") {
    const shell = env.SHELL || "/bin/zsh";
    const shellPath = await new Promise<string>((resolve) => {
      execFile(
        shell,
        ["-ilc", 'printf "\\nZYI_PATH_START%sZYI_PATH_END\\n" "$PATH"'],
        { timeout: 8000, maxBuffer: 100000, env },
        (_error, output) => {
          resolve(output.match(/ZYI_PATH_START([^\r\n]*)ZYI_PATH_END/)?.[1] || "");
        },
      );
    });
    if (shellPath) env.PATH = shellPath;
  }
  env.PATH = [
    ...new Set(
      [
        ...(env.PATH || "").split(path.delimiter),
        path.join(os.homedir(), ".local", "bin"),
        ...(process.platform === "darwin" ? ["/opt/homebrew/bin", "/usr/local/bin"] : []),
        path.dirname(runtime),
      ].filter(Boolean),
    ),
  ].join(path.delimiter);
  return env;
}

export async function startBackend(root: string, directory: string, runtime: string) {
  const env = await desktopEnvironment(runtime);
  mkdirSync(directory, { recursive: true });
  const child = fork(path.join(root, "desktop/server.js"), [], {
    execPath: runtime,
    execArgv: [],
    cwd: directory,
    env: { ...env, ZYI_DATA_DIR: directory },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let diagnostics = "";
  child.stderr?.on("data", (chunk) => {
    diagnostics = (diagnostics + chunk.toString()).slice(-16000);
  });
  child.stdout?.resume();
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("The terminal engine did not start within 30 seconds."));
    }, 30000);
    const failed = (error: Error) => {
      clearTimeout(timer);
      reject(error);
    };
    child.once("error", failed);
    child.once("exit", (code) =>
      failed(new Error(`Terminal engine exited (${code}). ${diagnostics}`)),
    );
    child.on("message", (value) => {
      if (
        !value ||
        typeof value !== "object" ||
        !("type" in value) ||
        value.type !== "ready" ||
        !("url" in value) ||
        typeof value.url !== "string"
      )
        return;
      const parsed = new URL(value.url);
      if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1") return;
      clearTimeout(timer);
      resolve(value.url);
    });
  });
  return { child, url, diagnostics: () => diagnostics };
}

export async function stopBackend(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      if (process.platform === "win32" && child.pid) {
        execFile(
          "taskkill.exe",
          ["/pid", String(child.pid), "/t", "/f"],
          { windowsHide: true },
          () => resolve(),
        );
      } else {
        child.kill("SIGKILL");
        resolve();
      }
    }, 15000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    if (child.connected) child.send("shutdown", () => {});
    else child.kill();
  });
}

export function windowPreferences(directory: string): {
  width: number;
  height: number;
  maximized?: boolean;
} {
  try {
    const saved = JSON.parse(readFileSync(path.join(directory, "window.json"), "utf8"));
    if (Number.isInteger(saved.width) && Number.isInteger(saved.height))
      return {
        width: Math.max(900, Math.min(2560, saved.width)),
        height: Math.max(600, Math.min(1600, saved.height)),
        maximized: saved.maximized === true,
      };
  } catch {
    /* First launch or corrupt preference: use the defaults. */
  }
  return { width: 1440, height: 950 };
}

export function saveWindowPreferences(
  directory: string,
  bounds: { width: number; height: number },
  maximized: boolean,
) {
  if (existsSync(directory))
    writeFileSync(
      path.join(directory, "window.json"),
      JSON.stringify({ width: bounds.width, height: bounds.height, maximized }),
    );
}
