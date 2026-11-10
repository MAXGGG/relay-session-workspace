import { existsSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Session } from "../core/types.ts";

export function findExecutable(name: string): string | undefined {
  const names =
    process.platform === "win32" && !path.extname(name)
      ? [`${name}.exe`, `${name}.cmd`, `${name}.bat`, name]
      : [name];
  const directories =
    path.isAbsolute(name) || name.includes(path.sep)
      ? [""]
      : [
          ...(process.env.PATH || "").split(path.delimiter),
          path.join(os.homedir(), ".local", "bin"),
        ];
  for (const directory of directories) {
    for (const file of names) {
      const candidate = path.resolve(directory, file);
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    }
  }
  return undefined;
}

export function launchProfile(session: Session, root: string, hookConfig: string) {
  let executable: string;
  let args: string[];
  const conversation = session.conversationId || session.claudeId;
  if (session.mode === "demo") {
    executable = process.execPath;
    args = [
      path.join(root, "scripts/demo-worker.mjs"),
      session.demoScenario ?? "question",
      session.name,
    ];
  } else if (session.mode === "shell") {
    executable =
      session.executable ||
      (process.platform === "win32"
        ? process.env.ComSpec || "cmd.exe"
        : process.env.SHELL || "/bin/bash");
    args = session.args?.length
      ? session.args
      : process.platform === "win32" && !session.executable
        ? ["/d", "/q"]
        : [];
  } else if (session.mode === "claude") {
    executable = session.executable || findExecutable("claude") || "claude";
    args = ["--settings", hookConfig, "--name", session.name, ...(session.args ?? [])];
    if (conversation) args.push("--resume", conversation);
  } else if (session.mode === "codex") {
    executable = session.executable || findExecutable("codex") || "codex";
    args = [
      ...(conversation ? ["resume", conversation] : []),
      "--no-daemon",
      "--no-alt-screen",
      ...(session.args ?? []),
    ];
  } else {
    executable = session.executable || "";
    if (!executable) throw new Error("Choose an executable for the custom session.");
    args =
      conversation && session.resumeArgs?.length
        ? session.resumeArgs.map((arg) => arg.replaceAll("{conversationId}", conversation))
        : (session.args ?? []);
  }
  if (session.initialPrompt && session.initialPromptStartedAt === undefined && !conversation) {
    if (session.mode !== "claude" && session.mode !== "codex")
      throw new Error("Initial tasks require a Claude or Codex session.");
    args.push("--", session.initialPrompt);
  }
  return executableCommand(executable, args);
}

export function executableCommand(executable: string, args: string[]) {
  executable = findExecutable(executable) ?? executable;
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(executable)) {
    // A batch shim adds cmd.exe parsing. Keep each argument quoted and refuse
    // quote/env-expansion syntax instead of silently changing or executing it.
    if ([executable, ...args].some((value) => /["%\0\r\n]/.test(value)))
      throw new Error(
        "Windows .cmd/.bat launchers cannot safely pass embedded quotes or %. Use the native executable for these arguments.",
      );
    const command = [executable, ...args].map((value) => `"${value}"`).join(" ");
    return { executable: process.env.ComSpec || "cmd.exe", args: `/d /v:off /s /c "${command}"` };
  }
  return { executable, args };
}

export function argumentList(value: unknown): string[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    value.some((arg) => typeof arg !== "string" || arg.length > 8000 || /[\0\r\n]/.test(arg))
  )
    throw new Error("Arguments must be an array of up to 100 single-line strings.");
  return value;
}
