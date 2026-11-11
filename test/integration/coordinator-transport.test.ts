import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { projectRoot } from "../../src/server/app.ts";
import { parseCoordinatorPlan, runCoordinator } from "../../src/server/coordinator-agent.ts";
import { fixtureCli, removeTemporary, temporaryDirectory, waitUntil } from "../helpers.ts";

test("coordinator CLI transport preserves stdin, parses both providers, and reports CLI failures", async () => {
  const directory = temporaryDirectory();
  try {
    const executable = fixtureCli(
      directory,
      path.join(projectRoot, "test/fixtures/coordinator-cli.mjs"),
    );
    for (const provider of ["codex", "claude"] as const) {
      const prompt = 'Quoted "task" with & | % and\nmultiple lines; never a shell argument.';
      // Native argv transport allows the schema's JSON quotes on Windows;
      // batch-shim restrictions are tested separately in profiles.test.ts.
      const launch = (_executable: string, args: string[]) => ({
        executable: process.execPath,
        args: [path.join(projectRoot, "test/fixtures/coordinator-cli.mjs"), ...args],
      });
      const response = await runCoordinator(
        {
          provider,
          settings: { provider, executable },
          prompt,
          directory,
          signal: new AbortController().signal,
        },
        launch,
      );
      assert.equal(parseCoordinatorPlan(response).message, prompt);
      await assert.rejects(
        runCoordinator(
          {
            provider,
            settings: { provider, executable },
            prompt: "invalid output",
            directory,
            signal: new AbortController().signal,
          },
          launch,
        ),
        /No actions were applied/,
      );
    }
    await assert.rejects(
      runCoordinator({
        provider: "codex",
        settings: { provider: "codex", executable },
        prompt: "fail",
        directory,
        signal: new AbortController().signal,
      }),
      /Sign in to the fixture/,
    );
    assert.deepEqual(readdirSync(path.join(directory, "coordinator")), []);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      runCoordinator({
        provider: "codex",
        settings: { provider: "codex", executable },
        prompt: "hello",
        directory,
        signal: controller.signal,
      }),
      /cancelled/,
    );
  } finally {
    removeTemporary(directory);
  }
});

test("cancelling an in-flight coordinator terminates its subprocess and cleans temporary results", async () => {
  const directory = temporaryDirectory();
  try {
    const executable = fixtureCli(
      directory,
      path.join(projectRoot, "test/fixtures/coordinator-cli.mjs"),
    );
    const controller = new AbortController();
    const pending = runCoordinator({
      provider: "codex",
      settings: { provider: "codex", executable },
      prompt: "wait forever",
      directory,
      signal: controller.signal,
    });
    const rejected = assert.rejects(pending, /cancelled/);
    const jobs = path.join(directory, "coordinator");
    await waitUntil(
      () =>
        existsSync(jobs) &&
        readdirSync(jobs).some((job) => existsSync(path.join(jobs, job, "ready.json"))),
    );
    controller.abort();
    await rejected;
    assert.deepEqual(readdirSync(jobs), []);
  } finally {
    removeTemporary(directory);
  }
});

test("structured coordinator actions reject arbitrary commands, invalid fields, and terminal control codes", () => {
  for (const value of [
    null,
    { message: "hi", actions: "bad" },
    { message: "hi", actions: [{ kind: "exec", text: "command" }] },
    { message: "hi", actions: [{ kind: "create", executable: "bad" }] },
    { message: "hi", actions: [{ kind: "reply", text: "\u001b[31m" }] },
    { message: "hi", actions: [{ kind: "priority", priority: 9 }] },
    { message: "hi", actions: [{ kind: "create", mode: "shell" }] },
    { message: "hi", actions: [{ kind: "pin", pinned: "yes" }] },
    { message: "hi", actions: [{ kind: "defer", minutes: -1 }] },
  ])
    assert.throws(() => parseCoordinatorPlan(value));
  assert.equal(parseCoordinatorPlan({ message: "Which project?", actions: [] }).actions.length, 0);
});
