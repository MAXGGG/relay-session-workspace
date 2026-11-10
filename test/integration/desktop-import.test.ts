import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { importWorkspace } from "../../desktop/import-workspace.ts";
import { Workspace } from "../../src/core/workspace.ts";
import { acquireWorkspace } from "../../src/server/lock.ts";
import { Store } from "../../src/server/store.ts";
import { Transcripts } from "../../src/server/transcripts.ts";
import { removeTemporary, temporaryDirectory } from "../helpers.ts";

test("desktop import preserves session IDs, pending attention and output; refuses overwrite and live source", () => {
  const source = temporaryDirectory(),
    target = temporaryDirectory();
  try {
    const workspace = new Workspace();
    const session = workspace.addSession({
      name: "Existing work",
      project: "Example",
      cwd: source,
      mode: "shell",
      notes: "Keep this finding",
      priority: 1,
    });
    workspace.enqueue(session.id, {
      kind: "question",
      title: "Decision needed",
      detail: "Which region?",
      source: "manual",
    });
    new Store(source).save(workspace.snapshot());
    const original = readFileSync(path.join(source, "workspace.json"), "utf8");
    const transcript = new Transcripts(source);
    transcript.append(session.id, "saved terminal output");
    transcript.flush();
    const unlock = acquireWorkspace(source);
    assert.throws(() => importWorkspace(source, target), /already open/);
    unlock();
    assert.equal(importWorkspace(source, target), 1);
    assert.deepEqual(new Store(target).load(), workspace.snapshot());
    assert.equal(new Transcripts(target).read(session.id), "saved terminal output");
    assert.equal(readFileSync(path.join(source, "workspace.json"), "utf8"), original);
    assert.throws(() => importWorkspace(source, target), /empty desktop workspace/);
    assert.throws(() => importWorkspace(source, source), /separate/);
  } finally {
    removeTemporary(source);
    removeTemporary(target);
  }
});

test("desktop import rejects invalid source without replacing the destination", () => {
  const source = temporaryDirectory(),
    target = temporaryDirectory();
  try {
    const empty = new Workspace().snapshot();
    new Store(target).save(empty);
    writeFileSync(path.join(source, "workspace.json"), '{"sessions":[]}');
    assert.throws(() => importWorkspace(source, target), /Invalid saved workspace/);
    assert.deepEqual(new Store(target).load(), empty);
    new Store(source).save(empty);
    const libraryOnly = { ...empty, groups: [{ name: "Saved work", cwd: target }] };
    new Store(target).save(libraryOnly);
    assert.throws(() => importWorkspace(source, target), /empty desktop workspace/);
    assert.deepEqual(new Store(target).load(), libraryOnly);
  } finally {
    removeTemporary(source);
    removeTemporary(target);
  }
});
