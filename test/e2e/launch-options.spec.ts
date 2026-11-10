import path from "node:path";
import { test as base, expect } from "@playwright/test";
import { projectRoot } from "../../src/server/app.ts";
import { fixtureCli, testApp } from "../helpers.ts";

const test = base.extend<{ app: Awaited<ReturnType<typeof testApp>> }>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright fixture signature.
  app: async ({}, use) => {
    const app = await testApp(false);
    try {
      await use(app);
    } finally {
      await app.cleanup();
    }
  },
});

test("argument errors identify and focus the invalid field; exact permission JSON launches", async ({
  page,
  app,
}) => {
  const executable = fixtureCli(
    app.stateDir,
    path.join(projectRoot, "test/fixtures/terminal-worker.mjs"),
  );
  await page.goto(app.url);
  await page.locator("#new-session").click();
  await page.getByLabel("Name", { exact: true }).fill("Claude options");
  await page.getByLabel("Project directory", { exact: true }).fill(projectRoot);
  await page.locator("#session-form [name=mode]").selectOption("claude");
  await page.locator("#advanced-settings > summary").click();
  await page.locator("#session-form [name=executable]").fill(executable);
  await page.getByText("Launch arguments and recovery", { exact: true }).click();
  const args = page.getByLabel("Arguments (JSON array)", { exact: true });
  const resume = page.getByLabel("Custom resume arguments (JSON array)", { exact: true });
  await args.fill('["--dangerously-skip-permissions"]');
  await resume.fill("[,]");
  await page.locator("#advanced-settings > summary").click();
  await page.locator("#session-submit").click();
  await expect(page.locator("#dialog-error")).toContainText("Custom resume arguments");
  await expect(resume).toBeFocused();
  expect(app.workspace.state.sessions).toHaveLength(0);
  await resume.fill("[]");
  for (const value of ['["--flag",,]', "[“--flag”]", '{"flag":true}', "[123]"]) {
    await args.fill(value);
    await page.locator("#session-submit").click();
    await expect(page.locator("#dialog-error")).toContainText("Arguments (JSON array)");
    await expect(args).toBeFocused();
    expect(app.workspace.state.sessions).toHaveLength(0);
  }
  await args.fill('["--dangerously-skip-permissions", 123]');
  await page.locator("#session-form [name=mode]").selectOption("shell");
  await expect(page.locator("#dialog-error")).toContainText("Arguments (JSON array)");
  await expect(page.locator("#session-form [name=attentionMode]")).toHaveValue("manual");
  await page.locator("#session-form [name=mode]").selectOption("claude");
  await args.fill('["--dangerously-skip-permissions"]');
  await resume.fill("   ");
  await page.locator("#session-submit").click();
  await expect(page.locator("#session-dialog")).not.toBeVisible();
  await expect(page.locator(".xterm-accessibility-tree")).toContainText(
    "--dangerously-skip-permissions",
  );
  expect(app.workspace.state.sessions[0].args).toEqual(["--dangerously-skip-permissions"]);
  await expect(page.locator("#dialog-error")).toHaveText("");
});

test("Claude permission checkbox survives templates and editing without altering other arguments", async ({
  page,
  app,
}) => {
  const executable = fixtureCli(
    app.stateDir,
    path.join(projectRoot, "test/fixtures/terminal-worker.mjs"),
  );
  await app.request("/api/library", {
    action: "save-template",
    name: "Claude defaults",
    mode: "claude",
    executable,
    attentionMode: "events",
    args: ["--model", "opus"],
  });
  await page.goto(app.url);
  await page.locator("#new-session").click();
  await page.locator("#session-template").selectOption({ label: "Claude defaults" });
  const skip = page.getByRole("checkbox", { name: "Skip Claude permission prompts", exact: true });
  await expect(skip).toBeVisible();
  await expect(skip).not.toBeChecked();
  await skip.check();
  await page.getByText("Save these settings as a template", { exact: true }).click();
  await page.locator("#save-template").click();
  await expect
    .poll(() => app.workspace.state.templates?.[0].args)
    .toEqual(["--model", "opus", "--dangerously-skip-permissions"]);
  await page.locator("#close-dialog").click();
  await page.reload();
  await page.locator("#new-session").click();
  await page.locator("#session-template").selectOption({ label: "Claude defaults" });
  await expect(skip).toBeChecked();
  await page.locator("#session-form [name=mode]").selectOption("shell");
  await expect(skip).not.toBeVisible();
  expect(JSON.parse(await page.locator("#session-form [name=args]").inputValue())).toEqual([
    "--model",
    "opus",
  ]);
  await page.locator("#session-template").selectOption("");
  await page.locator("#session-template").selectOption({ label: "Claude defaults" });
  await expect(skip).toBeChecked();
  await page.getByLabel("Name", { exact: true }).fill("Saved preference");
  await page.getByLabel("Project directory", { exact: true }).fill(projectRoot);
  await page.locator("#session-submit").click();
  await expect(page.locator(".xterm-accessibility-tree")).toContainText(
    "--dangerously-skip-permissions",
  );
  await page.locator("#edit-session").click();
  await expect(skip).toBeChecked();
  await skip.uncheck();
  await page.locator("#session-submit").click();
  await expect.poll(() => app.workspace.state.sessions[0].args).toEqual(["--model", "opus"]);
  expect(app.workspace.state.templates?.[0].args).toContain("--dangerously-skip-permissions");
});
