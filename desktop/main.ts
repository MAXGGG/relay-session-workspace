import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray } from "electron";
import { Store } from "../src/server/store.ts";
import { saveWindowPreferences, startBackend, stopBackend, windowPreferences } from "./host.ts";
import { importWorkspace } from "./import-workspace.ts";

app.setName("Zyi");
if (process.platform === "win32") app.setAppUserModelId("io.github.maxggg.zyi");
if (process.env.ZYI_USER_DATA_DIR)
  app.setPath("userData", path.resolve(process.env.ZYI_USER_DATA_DIR));
const root = fileURLToPath(new URL("../", import.meta.url));
const runtime = path.join(root, "../runtime", process.platform === "win32" ? "node.exe" : "node");
const userData = app.getPath("userData");
const directory = path.join(userData, "workspace");
let window: BrowserWindow | undefined;
let tray: Tray | undefined;
let backend: Awaited<ReturnType<typeof startBackend>> | undefined;
let quitting = false;
let restarting = false;
let readyToQuit = false;
const hiddenTest = process.env.ZYI_DESKTOP_TEST === "1";
function reportError(title: string, detail: string) {
  const message = detail.replace(/#token=[a-zA-Z0-9]+/g, "#token=[redacted]");
  console.error(`${title}\n${message}`);
  if (!hiddenTest) dialog.showErrorBox(title, message);
}
let preferences: Record<string, string> = {};
try {
  preferences = JSON.parse(readFileSync(path.join(userData, "preferences.json"), "utf8"));
} catch {
  /* First launch. */
}
if (!preferences || typeof preferences !== "object" || Array.isArray(preferences)) preferences = {};

function showWindow() {
  if (!window || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}
function trusted(url: string) {
  try {
    return !!backend && new URL(url).origin === new URL(backend.url).origin;
  } catch {
    return false;
  }
}
async function start() {
  backend = await startBackend(root, directory, runtime);
  backend.child.on("exit", () => {
    if (quitting || restarting) return;
    reportError(
      "Zyi's terminal engine stopped",
      `Restart Zyi to reopen saved sessions.\n${backend?.diagnostics() || "The background process exited unexpectedly."}`,
    );
    app.quit();
  });
  return backend;
}
async function importSavedWorkspace() {
  if (!window || restarting || quitting) return;
  const saved = new Store(directory).load();
  if (
    saved?.sessions.length ||
    saved?.items.length ||
    saved?.groups?.length ||
    saved?.templates?.length
  ) {
    reportError(
      "Workspace is not empty",
      "Import requires an empty desktop workspace. Your running sessions have been left alone.",
    );
    return;
  }
  const chosen = await dialog.showOpenDialog(window, {
    title: "Import saved workspace (.relay)",
    properties: ["openDirectory", "showHiddenFiles"],
  });
  if (chosen.canceled || !chosen.filePaths[0]) return;
  const answer = await dialog.showMessageBox(window, {
    type: "question",
    buttons: ["Cancel", "Import"],
    defaultId: 1,
    cancelId: 0,
    message: "Import into this empty desktop workspace?",
    detail:
      "Stop the old server first. This copies its saved sessions, queue, notes and output. Live processes and browser preferences are not transferred. The original workspace is kept.",
  });
  if (answer.response !== 1) return;
  restarting = true;
  try {
    if (backend) await stopBackend(backend.child);
    importWorkspace(chosen.filePaths[0], directory);
  } catch (error) {
    reportError("Workspace was not imported", String(error));
  } finally {
    try {
      const engine = await start();
      await window.loadURL(engine.url);
    } catch (error) {
      reportError("Could not restart Zyi", String(error));
      app.quit();
    }
    restarting = false;
  }
}

const ownsInstance = app.requestSingleInstanceLock();
if (!ownsInstance) app.quit();
else {
  app.on("second-instance", showWindow);
  app.on("activate", showWindow);
  app.on("window-all-closed", () => {
    /* The tray keeps workers alive. */
  });
  app.on("before-quit", (event) => {
    if (readyToQuit) return;
    event.preventDefault();
    if (quitting) return;
    quitting = true;
    if (window && !window.isDestroyed())
      saveWindowPreferences(userData, window.getNormalBounds(), window.isMaximized());
    void (async () => {
      if (backend) await stopBackend(backend.child);
      readyToQuit = true;
      tray?.destroy();
      app.quit();
    })();
  });
  await app.whenReady();
  try {
    mkdirSync(userData, { recursive: true });
    const engine = await start();
    const bounds = windowPreferences(userData);
    const icon = nativeImage.createFromPath(path.join(root, "assets/icon.png"));
    window = new BrowserWindow({
      ...bounds,
      minWidth: 900,
      minHeight: 600,
      title: "Zyi",
      show: false,
      backgroundColor: "#111916",
      icon,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: path.join(root, "desktop/preload.cjs"),
      },
    });
    const content = window.webContents;
    ipcMain.handle("zyi:choose-directory", async (event) => {
      if (!window || window.isDestroyed()) return null;
      if (event.sender !== content || !trusted(event.senderFrame?.url || "")) return null;
      const chosen = await dialog.showOpenDialog(window, {
        title: "Choose a project folder",
        properties: ["openDirectory", "createDirectory"],
      });
      return chosen.canceled ? null : (chosen.filePaths[0] ?? null);
    });
    const allowedKeys = new Set(["relay-layout-v1", "relay-notifications"]);
    ipcMain.handle("zyi:menu-action", async (event, operation: unknown) => {
      if (
        !window ||
        window.isDestroyed() ||
        event.sender !== content ||
        !trusted(event.senderFrame?.url || "")
      )
        return;
      switch (operation) {
        case "about":
          app.showAboutPanel();
          break;
        case "open-data-folder":
          await shell.openPath(directory);
          break;
        case "show":
          showWindow();
          break;
        case "hide":
          window.hide();
          break;
        case "reload":
          content.reload();
          break;
        case "zoom-in":
          content.setZoomLevel(Math.min(5, content.getZoomLevel() + 0.5));
          break;
        case "zoom-out":
          content.setZoomLevel(Math.max(-3, content.getZoomLevel() - 0.5));
          break;
        case "reset-zoom":
          content.setZoomLevel(0);
          break;
        case "fullscreen":
          window.setFullScreen(!window.isFullScreen());
          break;
        case "quit": {
          const result = await dialog.showMessageBox(window, {
            type: "question",
            message: "Quit Zyi and stop its running sessions?",
            detail: "Saved sessions and attention history are retained.",
            buttons: ["Cancel", "Quit Zyi"],
            defaultId: 0,
            cancelId: 0,
          });
          if (result.response === 1) app.quit();
          break;
        }
        default:
          throw new Error("Unsupported desktop menu action.");
      }
    });
    ipcMain.handle("zyi:import-workspace", async (event) => {
      if (event.sender !== content || !trusted(event.senderFrame?.url || "")) return;
      await importSavedWorkspace();
    });
    ipcMain.on("zyi:preferences", (event) => {
      event.returnValue =
        event.sender === content && trusted(event.senderFrame?.url || "") ? preferences : {};
    });
    ipcMain.on("zyi:preference", (event, key: unknown, value: unknown) => {
      if (
        event.sender !== content ||
        !trusted(event.senderFrame?.url || "") ||
        typeof key !== "string" ||
        !allowedKeys.has(key) ||
        !(value === null || (typeof value === "string" && value.length < 4096))
      )
        return;
      if (value === null) delete preferences[key];
      else preferences[key] = value;
      writeFileSync(path.join(userData, "preferences.json"), JSON.stringify(preferences));
    });
    content.setWindowOpenHandler(() => ({ action: "deny" }));
    content.on("will-navigate", (event, url) => {
      if (!trusted(url)) event.preventDefault();
    });
    content.on("will-redirect", (event, url) => {
      if (!trusted(url)) event.preventDefault();
    });
    content.on("will-attach-webview", (event) => event.preventDefault());
    content.session.setPermissionRequestHandler((contents, permission, callback) =>
      callback(
        contents === content && trusted(contents.getURL()) && permission === "notifications",
      ),
    );
    content.session.setPermissionCheckHandler(
      (contents, permission, origin) =>
        contents === content && trusted(origin) && permission === "notifications",
    );
    window.on("close", (event) => {
      if (!window) return;
      saveWindowPreferences(userData, window.getNormalBounds(), window.isMaximized());
      if (!quitting) {
        event.preventDefault();
        window.hide();
      }
    });
    window.once("ready-to-show", () => {
      if (bounds.maximized) window?.maximize();
      if (!hiddenTest) showWindow();
    });
    const trayImage = nativeImage.createFromPath(path.join(root, "assets/tray.png"));
    if (process.platform === "darwin") trayImage.setTemplateImage(true);
    tray = new Tray(trayImage);
    tray.setToolTip("Zyi · Your attention, in order");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Open Zyi", click: showWindow },
        { label: "Quit Zyi (stop sessions)", click: () => app.quit() },
      ]),
    );
    tray.on("click", showWindow);
    content.on("page-title-updated", (_event, title) => tray?.setToolTip(title));
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: "Zyi",
          submenu: [
            { label: "About Zyi", click: () => app.showAboutPanel() },
            { label: "Open Zyi", click: showWindow },
            { label: "Import saved workspace…", click: () => void importSavedWorkspace() },
            {
              label: "Open data folder",
              click: () => {
                void shell.openPath(directory);
              },
            },
            { type: "separator" },
            {
              label: "Quit Zyi (stop sessions)",
              accelerator: "CmdOrCtrl+Q",
              click: () => app.quit(),
            },
          ],
        },
        { role: "editMenu" },
        {
          label: "View",
          submenu: [
            { role: "reload" },
            { role: "resetZoom" },
            { role: "zoomIn" },
            { role: "zoomOut" },
            { role: "togglefullscreen" },
          ],
        },
      ]),
    );
    app.setAboutPanelOptions({
      applicationName: "Zyi",
      applicationVersion: app.getVersion(),
      copyright: "MIT · Zyi contributors",
      iconPath: path.join(root, "assets/icon.png"),
    });
    await window.loadURL(engine.url);
  } catch (error) {
    reportError("Zyi could not start", String(error));
    app.quit();
  }
}
