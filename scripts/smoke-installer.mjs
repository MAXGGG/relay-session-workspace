import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

if (process.platform !== "win32") throw new Error("Installer acceptance requires Windows.");
const run = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const metadata = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const installer = path.join(root, "release", `Zyi-${metadata.version}-win-x64.exe`);
const data = path.join(process.env.APPDATA, "Zyi");
if (existsSync(data))
  throw new Error(
    "Existing Zyi user data found. Run installer acceptance in a clean Windows account.",
  );
const registered = await run(
  "reg.exe",
  [
    "query",
    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
    "/s",
    "/f",
    "Zyi",
    "/d",
    "/e",
  ],
  { windowsHide: true },
).then(
  () => true,
  () => false,
);
if (registered) throw new Error("Existing Zyi installation found. Use a clean Windows account.");
const parent = realpathSync(os.tmpdir());
const temporary = mkdtempSync(path.join(parent, "zyi-installer-"));
function removeBuildTest() {
  if (path.dirname(temporary) !== parent || !path.basename(temporary).startsWith("zyi-installer-"))
    throw new Error("Unsafe cleanup path.");
  rmSync(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
const target = path.join(temporary, "Zyi test installation");
const marker = path.join(data, "installer-acceptance.txt");
let ownsData = false;
let uninstalled = false;
const execute = (file, args, env) =>
  run(file, args, {
    cwd: root,
    windowsHide: true,
    timeout: 120000,
    maxBuffer: 1000000,
    env: { ...process.env, ...env },
  });
async function uninstall() {
  if (uninstalled) return;
  const file = path.join(target, "Uninstall Zyi.exe");
  if (existsSync(file)) {
    await execute(file, ["/S"]);
    const deadline = Date.now() + 30000;
    while (existsSync(path.join(target, "Zyi.exe"))) {
      if (Date.now() > deadline) throw new Error(`Uninstaller did not finish. Inspect ${target}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  uninstalled = true;
}
try {
  await execute(installer, ["/S", `/D=${target}`]);
  assert.ok(existsSync(path.join(target, "Zyi.exe")), "installer creates the desktop application");
  mkdirSync(data);
  ownsData = true;
  writeFileSync(marker, "preserve user data during upgrade and uninstall");
  const result = await execute(process.execPath, ["--test", "test/desktop/app.test.ts"], {
    ZYI_DESKTOP_EXECUTABLE: path.join(target, "Zyi.exe"),
  });
  process.stdout.write(result.stdout);
  await execute(installer, ["/S", `/D=${target}`]);
  assert.equal(readFileSync(marker, "utf8"), "preserve user data during upgrade and uninstall");
  await uninstall();
  assert.equal(existsSync(path.join(target, "Zyi.exe")), false, "uninstaller removes the app");
  assert.ok(existsSync(marker), "uninstaller retains user data");
  console.log(
    "Windows install, installed-app acceptance, reinstall and data-preserving uninstall passed.",
  );
} finally {
  await uninstall();
  if (ownsData) {
    rmSync(marker, { force: true });
    try {
      rmdirSync(data);
    } catch {
      /* Preserve any newly added files. */
    }
  }
  removeBuildTest();
}
