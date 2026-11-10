import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { _electron as electron, expect } from "@playwright/test";
import { projectRoot } from "../../src/server/app.ts";
import { removeTemporary, temporaryDirectory, waitUntil } from "../helpers.ts";

test("desktop: bundled terminal, isolated window, background lifecycle, durable preferences and restart", {
  timeout: 120000,
}, async () => {
  const directory = temporaryDirectory();
  let packagedExecutable: string | undefined;
  if (process.env.ZYI_DESKTOP_EXECUTABLE) {
    const original = path.resolve(process.env.ZYI_DESKTOP_EXECUTABLE);
    const source =
      process.platform === "darwin"
        ? path.resolve(path.dirname(original), "../..")
        : path.dirname(original);
    const copy = path.join(directory, path.basename(source));
    cpSync(source, copy, { recursive: true, verbatimSymlinks: true });
    packagedExecutable = path.join(copy, path.relative(source, original));
  }
  let diagnostics = "";
  const launch = async () => {
    const instance = await electron.launch({
      ...(packagedExecutable
        ? { executablePath: packagedExecutable, args: [] }
        : { args: [path.join(projectRoot, "build/desktop-app")] }),
      env: { ...process.env, ZYI_USER_DATA_DIR: directory, ZYI_DESKTOP_TEST: "1" },
      timeout: 30000,
    });
    const collect = (chunk: Buffer) => {
      diagnostics = (diagnostics + chunk.toString()).slice(-16000);
    };
    instance.process().stderr?.on("data", collect);
    instance.process().stdout?.on("data", collect);
    return instance;
  };
  let desktop: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    desktop = await launch();
    let page = await desktop.firstWindow();
    await expect(page.locator("#connection")).toContainText("Connected");
    await expect(page).toHaveTitle("Zyi · Your attention, in order");
    await expect(page.getByRole("link", { name: "Zyi home" })).toBeVisible();
    assert.equal(await page.evaluate(() => typeof (globalThis as any).require), "undefined");
    const prefs = await desktop.evaluate(({ BrowserWindow }) => {
      const p = (BrowserWindow.getAllWindows()[0].webContents as any).getLastWebPreferences();
      return { sandbox: p.sandbox, node: p.nodeIntegration, isolation: p.contextIsolation };
    });
    assert.deepEqual(prefs, { sandbox: true, node: false, isolation: true });
    await desktop.evaluate(({ dialog }, folder) => {
      const original = dialog.showOpenDialog;
      dialog.showOpenDialog = async () => {
        dialog.showOpenDialog = original;
        return { canceled: false, filePaths: [folder] };
      };
    }, directory);
    await page.locator("#new-session").click();
    await page.getByRole("button", { name: "Browse…", exact: true }).click();
    await expect(page.getByLabel("Project directory", { exact: true })).toHaveValue(directory);
    await page.getByLabel("Close dialog", { exact: true }).click();
    const runtimePath = path.join(directory, "workspace/runtime.json");
    let connection = JSON.parse(readFileSync(runtimePath, "utf8"));
    const firstAddress = connection.address;
    const backendPid = connection.pid;
    const request = async (route: string, body?: unknown) => {
      const url = new URL(connection.url);
      const token = new URLSearchParams(url.hash.slice(1)).get("token");
      const response = await fetch(connection.address + route, {
        method: body ? "POST" : "GET",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const value = await response.json();
      assert.equal(response.status, 200, JSON.stringify(value));
      return value;
    };
    const appPath = await desktop.evaluate(({ app }) => app.getAppPath());
    const executable = path.resolve(
      appPath,
      "../runtime",
      process.platform === "win32" ? "node.exe" : "node",
    );
    assert.ok(existsSync(executable), "the app includes its own Node runtime");
    const fixture = path.join(directory, "worker.mjs");
    writeFileSync(
      fixture,
      'import readline from "node:readline"; console.log("ZYI_READY_" + process.pid); readline.createInterface({input:process.stdin}).on("line", line=>console.log("ZYI_REPLY_"+line));',
    );
    const state = await request("/api/sessions", {
      name: "Desktop worker",
      mode: "custom",
      executable,
      args: [fixture],
      cwd: directory,
      priority: 1,
      attentionMode: "manual",
      notes: "Desktop recovery proof",
    });
    const id = state.state.selectedSessionId;
    await expect(page.locator(".xterm-accessibility-tree")).toContainText("ZYI_READY_");
    const output = (await page.locator(".xterm-accessibility-tree").textContent()) || "";
    const workerPid = Number(output.match(/ZYI_READY_(\d+)/)?.[1]);
    assert.ok(workerPid > 0);
    await page.getByRole("button", { name: "Reply…", exact: true }).click();
    await page.getByLabel("Your message").fill("desktop roundtrip");
    await page.getByRole("button", { name: "Send to terminal", exact: true }).click();
    await expect(page.locator(".xterm-accessibility-tree")).toContainText(
      "ZYI_REPLY_desktop roundtrip",
    );
    await page.locator("#resize-sessions").focus();
    await page.keyboard.press("Shift+ArrowRight");
    const width = await page.locator("#resize-sessions").getAttribute("aria-valuenow");
    await waitUntil(() => existsSync(path.join(directory, "preferences.json")));
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    assert.equal(
      await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
      false,
    );
    assert.doesNotThrow(() => process.kill(workerPid, 0));
    assert.doesNotThrow(() => process.kill(backendPid, 0));
    const running = await request("/api/state");
    assert.ok(running.terminals[id]);
    const desktopExecutable =
      packagedExecutable || (createRequire(import.meta.url)("electron") as string);
    await new Promise<void>((resolve, reject) => {
      execFile(
        desktopExecutable,
        packagedExecutable ? [] : [path.join(projectRoot, "build/desktop-app")],
        {
          env: { ...process.env, ZYI_USER_DATA_DIR: directory, ZYI_DESKTOP_TEST: "1" },
          windowsHide: true,
          timeout: 10000,
        },
        (error) => (error ? reject(error) : resolve()),
      );
    });
    assert.equal(
      await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
      true,
    );
    assert.equal(
      JSON.parse(readFileSync(runtimePath, "utf8")).pid,
      backendPid,
      "a second launch reuses the original engine",
    );
    mkdirSync(path.join(projectRoot, "test-artifacts"), { recursive: true });
    await page.screenshot({ path: path.join(projectRoot, "test-artifacts/zyi-desktop.png") });
    await desktop.close();
    desktop = undefined;
    await waitUntil(() => !existsSync(path.join(directory, "workspace/workspace.lock")));
    assert.throws(() => process.kill(backendPid, 0));
    assert.throws(() => process.kill(workerPid, 0));
    desktop = await launch();
    page = await desktop.firstWindow();
    await expect(page.locator("#connection")).toContainText("Connected");
    await expect(page.locator("#sessions")).toContainText("Desktop worker");
    await expect(page.locator("#session-note")).toHaveText("Desktop recovery proof");
    await expect(page.locator("#terminal-status")).toContainText("Stopped");
    await expect(page.locator("#resize-sessions")).toHaveAttribute(
      "aria-valuenow",
      width as string,
    );
    connection = JSON.parse(readFileSync(runtimePath, "utf8"));
    assert.notEqual(
      connection.address,
      firstAddress,
      "desktop preferences survive a different local origin",
    );
    const recovered = await request("/api/state");
    assert.equal(Object.keys(recovered.terminals).length, 0);
    assert.equal(recovered.state.sessions[0].id, id);
  } catch (error) {
    if (diagnostics) console.error(diagnostics);
    throw error;
  } finally {
    await desktop?.close();
    removeTemporary(directory);
  }
});
