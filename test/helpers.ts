import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/server/app.ts";

export function fixtureCli(directory: string, script: string): string {
  const file = path.join(
    directory,
    process.platform === "win32" ? "fixture-agent.cmd" : "fixture-agent",
  );
  const quote = (text: string) => `'${text.replaceAll("'", "'\\''")}'`;
  writeFileSync(
    file,
    process.platform === "win32"
      ? `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`
      : `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(script)} "$@"\n`,
  );
  if (process.platform !== "win32") chmodSync(file, 0o700);
  return file;
}

export function temporaryDirectory(): string {
  return mkdtempSync(path.join(realpathSync(os.tmpdir()), "relay-test-"));
}
export function removeTemporary(directory: string): void {
  const resolved = path.resolve(directory);
  const parent = realpathSync(os.tmpdir()) + path.sep;
  if (!resolved.startsWith(parent) || !path.basename(resolved).startsWith("relay-test-"))
    throw new Error("Refusing cleanup outside the test directory.");
  rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
export async function waitUntil(predicate: () => boolean, timeout = 10000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) throw new Error("Timed out waiting for observable state.");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
export async function testApp(demo = true, options: Parameters<typeof createApp>[0] = {}) {
  const directory = temporaryDirectory();
  const app = await createApp({ ...options, stateDir: directory, demo });
  app.workspace.state.settings = {
    retireAfterDays: 0,
    coordinator: { provider: options.coordinatorRunner ? "codex" : "commands" },
  };
  const request = async (route: string, body?: unknown, headers: Record<string, string> = {}) => {
    const response = await fetch(app.address + route, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${app.token}`,
        "Content-Type": "application/json",
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { response, body: await response.json() };
  };
  return {
    ...app,
    request,
    cleanup: async () => {
      await app.close();
      removeTemporary(directory);
    },
  };
}
