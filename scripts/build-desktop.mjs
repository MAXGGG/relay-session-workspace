import { execFileSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const build = path.join(root, "build");
if (Number(process.versions.node.split(".")[0]) !== 24)
  throw new Error(
    "Build the desktop with Node 24 so native modules and the bundled runtime match.",
  );
// Only this generated directory is eligible for recursive cleanup.
if (path.dirname(build) !== path.resolve(root) || path.basename(build) !== "build")
  throw new Error("Unsafe build path.");
rmSync(build, { recursive: true, force: true, maxRetries: 5 });
mkdirSync(build, { recursive: true });
execFileSync(
  process.execPath,
  [path.join(root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.desktop.json"],
  { cwd: root, stdio: "inherit" },
);
const backend = path.join(build, "backend");
const metadata = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(path.join(root, "package-lock.json"), "utf8"));
for (const directory of ["public", "assets"])
  cpSync(path.join(root, directory), path.join(backend, directory), { recursive: true });
mkdirSync(path.join(backend, "scripts"), { recursive: true });
for (const file of ["demo-worker.mjs", "claude-hook.mjs", "relay-event.mjs"])
  cpSync(path.join(root, "scripts", file), path.join(backend, "scripts", file));
cpSync(path.join(root, "desktop/preload.cjs"), path.join(backend, "desktop/preload.cjs"));
cpSync(path.join(root, "LICENSE"), path.join(backend, "LICENSE"));
writeFileSync(
  path.join(backend, "package.json"),
  JSON.stringify({ name: "zyi-engine", version: metadata.version, type: "module", private: true }),
);
for (const [relative, entry] of Object.entries(lock.packages)) {
  if (!relative || entry.dev || entry.devOptional) continue;
  const source = path.join(root, relative);
  if (!existsSync(source)) {
    if (entry.optional) continue;
    throw new Error(`Missing production dependency: ${relative}`);
  }
  cpSync(source, path.join(backend, relative), {
    recursive: true,
    dereference: true,
    filter: (file) => {
      if (relative !== "node_modules/node-pty") return true;
      const segments = path.relative(source, file).split(path.sep);
      if (segments[0] === "prebuilds" && segments[1])
        return segments[1] === `${process.platform}-${process.arch}`;
      if (process.platform !== "win32" && segments[0] === "third_party") return false;
      return true;
    },
  });
}
const runtime = path.join(build, "runtime");
mkdirSync(runtime, { recursive: true });
const executable = path.join(runtime, process.platform === "win32" ? "node.exe" : "node");
cpSync(process.execPath, executable);
if (process.platform !== "win32") chmodSync(executable, 0o755);
const license = await fetch(
  `https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`,
  { signal: AbortSignal.timeout(30000) },
);
if (!license.ok) throw new Error(`Could not bundle Node license (${license.status}).`);
writeFileSync(path.join(runtime, "LICENSE"), await license.text());
writeFileSync(
  path.join(runtime, "version.txt"),
  `${process.version}\n${process.platform}-${process.arch}\n`,
);
const desktop = path.join(build, "desktop-app");
mkdirSync(desktop, { recursive: true });
writeFileSync(
  path.join(desktop, "package.json"),
  JSON.stringify(
    {
      name: metadata.name,
      productName: "Zyi",
      version: metadata.version,
      description: metadata.description,
      author: metadata.author,
      license: metadata.license,
      main: "main.cjs",
    },
    null,
    2,
  ),
);
writeFileSync(
  path.join(desktop, "main.cjs"),
  'const path = require("node:path");\nconst {pathToFileURL} = require("node:url");\nimport(pathToFileURL(path.resolve(__dirname, "../backend/desktop/main.js")).href);\n',
);
console.log(
  `Desktop prepared for ${process.platform}-${process.arch}; includes Node ${process.version}.`,
);
