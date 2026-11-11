import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { validatePullRequest } from "../../scripts/check-pr.mjs";
import { releaseChecksums, releaseMetadata } from "../../scripts/check-release.mjs";

const body = ["Problem", "Changes", "Validation", "Risk and recovery", "Related work"]
  .map((heading) => `## ${heading}\n\nSpecific evidence explaining this section of the change.\n`)
  .join("\n");

test("PR intake accepts substantive descriptions and rejects placeholders/comments", () => {
  assert.deepEqual(
    validatePullRequest({ title: "fix(claude): preserve completion events", body }),
    [],
  );
  assert.ok(
    validatePullRequest({
      title: "fix: fix it",
      body: body.replace(
        "Specific evidence explaining this section of the change.",
        "<!-- plenty of placeholder words are not evidence -->",
      ),
    }).some((e) => e.includes("Problem")),
  );
  assert.ok(validatePullRequest({ title: "update", body }).some((e) => e.includes("title")));
  assert.equal(
    validatePullRequest({ title: "docs: explain all supported launch options", body: "" }).length,
    5,
  );
});

test("PR content remains data and Dependabot exemption only skips generated-body rules", () => {
  assert.deepEqual(
    validatePullRequest({
      title: "chore(deps): bump a pinned dependency",
      body: "",
      user: { login: "dependabot[bot]" },
    }),
    [],
  );
  assert.ok(validatePullRequest({ title: "bad", user: { login: "dependabot[bot]" } }).length);
  assert.equal(
    validatePullRequest({
      title: "docs: describe expected runtime behavior",
      body: "<!-- ## Problem\n$(echo injected) -->",
    }).length,
    5,
  );
});

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "zyi-release-policy-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "docs"));
  mkdirSync(path.join(root, "public"));
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ version: "0.5.1" }));
  writeFileSync(
    path.join(root, "package-lock.json"),
    JSON.stringify({ version: "0.5.1", packages: { "": { version: "0.5.1" } } }),
  );
  writeFileSync(
    path.join(root, "docs/release-notes-0.5.1.md"),
    "Release notes explaining behavior, limitations and how to recover.",
  );
  writeFileSync(path.join(root, "CHANGELOG.md"), "## [0.5.1]\nChanges.");
  writeFileSync(path.join(root, "public/index.html"), '<span class="version">0.5.1</span>');
  return root;
}

test("release metadata fails closed for mismatched tags, lockfiles and missing notes", (t) => {
  const root = fixture(t);
  assert.equal(releaseMetadata(root, "v0.5.1").notes, "docs/release-notes-0.5.1.md");
  assert.throws(() => releaseMetadata(root, "v0.5.2"), /tag/);
  unlinkSync(path.join(root, "docs/release-notes-0.5.1.md"));
  assert.throws(() => releaseMetadata(root, "v0.5.1"), /ENOENT/);
  writeFileSync(path.join(root, "package-lock.json"), '{"version":"0.5.0"}');
  assert.throws(() => releaseMetadata(root, "v0.5.1"), /Lockfile/);
});

test("release metadata requires changelog and matching visible version", (t) => {
  const root = fixture(t);
  writeFileSync(path.join(root, "public/index.html"), '<span class="version">0.5.0</span>');
  assert.throws(() => releaseMetadata(root, "v0.5.1"), /Visible/);
  writeFileSync(path.join(root, "CHANGELOG.md"), "## Unreleased");
  assert.throws(() => releaseMetadata(root, "v0.5.1"), /CHANGELOG/);
});

test("release checksums reject incomplete, unexpected and empty packages", (t) => {
  const root = fixture(t);
  const directory = path.join(root, "assets");
  mkdirSync(directory);
  const names = [
    "Zyi-0.5.1-win-x64.exe",
    ...["arm64", "x64"].flatMap((arch) =>
      ["zip", "dmg"].map((ext) => `Zyi-0.5.1-mac-${arch}.${ext}`),
    ),
  ];
  assert.throws(() => releaseChecksums(directory, "0.5.1"), /five/);
  for (const name of names) writeFileSync(path.join(directory, name), "package fixture");
  assert.equal(releaseChecksums(directory, "0.5.1").trim().split("\n").length, 5);
  assert.match(releaseChecksums(directory, "0.5.1"), /^[a-f0-9]{64} {2}Zyi-/);
  writeFileSync(path.join(directory, names[0]), "");
  assert.throws(() => releaseChecksums(directory, "0.5.1"), /empty/);
  writeFileSync(path.join(directory, "unrelated.exe"), "unexpected");
  assert.throws(() => releaseChecksums(directory, "0.5.1"), /five/);
});

test("repository policy rejects privileged triggers, floating actions and stale required checks", (t) => {
  const root = fixture(t);
  mkdirSync(path.join(root, ".github/workflows"), { recursive: true });
  writeFileSync(
    path.join(root, ".github/main-ruleset.json"),
    JSON.stringify({
      rules: [
        {
          type: "required_status_checks",
          parameters: { required_status_checks: [{ context: "CI required" }] },
        },
      ],
    }),
  );
  const workflow =
    "on: pull_request\npermissions:\n  contents: read\njobs:\n  gate:\n    name: CI required\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo checked\n";
  const target = path.join(root, ".github/workflows/test.yml");
  const run = (content) => {
    writeFileSync(target, content);
    return spawnSync(
      process.execPath,
      [fileURLToPath(new URL("../../scripts/check-repository.mjs", import.meta.url))],
      { cwd: root, encoding: "utf8" },
    );
  };
  assert.equal(run(workflow).status, 0);
  for (const content of [
    workflow.replace("on: pull_request", "on:\n  pull_request_target:"),
    workflow.replace("run: echo checked", "uses: actions/checkout@v7"),
    workflow.replace("name: CI required", "name: Renamed gate"),
  ]) {
    const result = run(content);
    assert.equal(result.status, 1, result.stdout + result.stderr);
  }
});
