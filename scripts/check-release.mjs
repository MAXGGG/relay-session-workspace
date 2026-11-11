import { createHash } from "node:crypto";
import { appendFileSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function releaseMetadata(root, tag) {
  const read = (file) => readFileSync(path.join(root, file), "utf8");
  const pkg = JSON.parse(read("package.json"));
  const lock = JSON.parse(read("package-lock.json"));
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version) || tag !== `v${pkg.version}`)
    throw new Error("Release tag must exactly match package.json version.");
  if (lock.version !== pkg.version || lock.packages?.[""]?.version !== pkg.version)
    throw new Error("Lockfile version does not match the release.");
  const notes = `docs/release-notes-${pkg.version}.md`;
  if (read(notes).trim().length < 40) throw new Error("Release notes must describe the release.");
  if (!read("CHANGELOG.md").includes(`## [${pkg.version}]`))
    throw new Error("Add this version to CHANGELOG.md.");
  if (!read("public/index.html").includes(`class="version">${pkg.version}</span>`))
    throw new Error("Visible application version does not match.");
  return { version: pkg.version, notes };
}

export function releaseChecksums(directory, version) {
  const expected = [
    `Zyi-${version}-win-x64.exe`,
    ...["arm64", "x64"].flatMap((arch) =>
      ["dmg", "zip"].map((ext) => `Zyi-${version}-mac-${arch}.${ext}`),
    ),
  ].sort();
  const actual = readdirSync(directory)
    .filter((file) => file !== "SHA256SUMS.txt")
    .sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual))
    throw new Error("Release assets must contain exactly the five matching Windows/Mac packages.");
  const lines = expected
    .map((file) => {
      const target = path.join(directory, file);
      if (!statSync(target).isFile() || statSync(target).size === 0)
        throw new Error(`Release asset is empty or invalid: ${file}`);
      return `${createHash("sha256").update(readFileSync(target)).digest("hex")}  ${file}`;
    })
    .join("\n");
  return `${lines}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const metadata = releaseMetadata(process.cwd(), process.argv[2]);
  if (process.argv[3]) {
    const directory = path.resolve(process.argv[3]);
    writeFileSync(
      path.join(directory, "SHA256SUMS.txt"),
      releaseChecksums(directory, metadata.version),
    );
  }
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `version=${metadata.version}\nnotes=${metadata.notes}\n`,
    );
  console.log(`Release ${metadata.version} validated; notes: ${metadata.notes}`);
}
