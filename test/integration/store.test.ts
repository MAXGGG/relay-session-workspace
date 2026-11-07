import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import { seedDemo } from "../../src/core/demo.ts";
import { Workspace } from "../../src/core/workspace.ts";
import { Store } from "../../src/server/store.ts";
import { removeTemporary, temporaryDirectory } from "../helpers.ts";

test("atomic snapshot round trip retains pending, deferred and resolved decisions", () => {
  const directory = temporaryDirectory();
  try {
    const store = new Store(directory);
    assert.equal(store.load(), undefined);
    const w = new Workspace();
    seedDemo(w, ".");
    w.snooze(w.queue()[0].id, 60);
    const remaining = w.queue()[0];
    w.selectItem(remaining.id);
    w.resolve(remaining.id);
    store.save(w.snapshot());
    assert.deepEqual(store.load(), w.snapshot());
    w.priority("session-payments", 3);
    store.save(w.snapshot());
    assert.equal(store.load()?.sessions[0].priority, 3);
    assert.equal(JSON.parse(readFileSync(`${store.file}.bak`, "utf8")).sessions[0].priority, 1);
  } finally {
    removeTemporary(directory);
  }
});

test("invalid saved identities and malformed launch settings are preserved for recovery", () => {
  const directory = temporaryDirectory();
  try {
    const store = new Store(directory);
    const workspace = new Workspace();
    seedDemo(workspace, ".");
    for (const mutate of [
      (s: any) => {
        s.sessions[0].id = "../outside";
      },
      (s: any) => {
        s.sessions[0].args = "not an array";
      },
      (s: any) => {
        s.items[0].kind = "unsupported";
      },
      (s: any) => {
        s.sessions.push(s.sessions[0]);
      },
      (s: any) => {
        s.deliveries = [{}];
      },
    ]) {
      const state = workspace.snapshot();
      mutate(state);
      const contents = JSON.stringify(state);
      writeFileSync(store.file, contents);
      assert.throws(() => store.load(), /preserved/);
      assert.equal(readFileSync(store.file, "utf8"), contents);
    }
  } finally {
    removeTemporary(directory);
  }
});

test("corrupt or unsupported state is reported without replacing the original", () => {
  const directory = temporaryDirectory();
  try {
    const store = new Store(directory);
    writeFileSync(store.file, "not json");
    assert.throws(() => store.load());
    assert.equal(readFileSync(store.file, "utf8"), "not json");
    writeFileSync(store.file, JSON.stringify({ version: 2 }));
    assert.throws(() => store.load(), /preserved/);
    const w = new Workspace();
    seedDemo(w, ".");
    const invalid = w.snapshot();
    invalid.items[0].sessionId = "missing";
    writeFileSync(store.file, JSON.stringify(invalid));
    assert.throws(() => store.load(), /preserved/);
  } finally {
    removeTemporary(directory);
  }
});
