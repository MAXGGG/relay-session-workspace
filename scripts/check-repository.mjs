import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseDocument } from "yaml";

const errors = [];
const read = (file) => readFileSync(file, "utf8");
const filesUnder = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesUnder(path.join(dir, entry.name)) : [path.join(dir, entry.name)],
  );
const yamlFiles = filesUnder(".github").filter((file) => /\.ya?ml$/.test(file));
const checks = new Set();
for (const file of yamlFiles) {
  const document = parseDocument(read(file), { uniqueKeys: true });
  if (document.errors.length) {
    errors.push(`${file}: ${document.errors.map((e) => e.message).join("; ")}`);
    continue;
  }
  if (!file.includes("workflows")) continue;
  const workflow = document.toJS();
  const triggers =
    typeof workflow.on === "string"
      ? [workflow.on]
      : Array.isArray(workflow.on)
        ? workflow.on
        : Object.keys(workflow.on ?? {});
  if (triggers.includes("pull_request_target"))
    errors.push(`${file}: do not run PR code with pull_request_target.`);
  if (workflow.permissions?.contents !== "read")
    errors.push(`${file}: default contents permission must be read.`);
  for (const job of Object.values(workflow.jobs ?? {})) {
    if (job.name) checks.add(job.name);
    for (const step of job.steps ?? []) {
      if (step.uses && !/^\.\//.test(step.uses) && !/@[a-f0-9]{40}$/.test(step.uses))
        errors.push(`${file}: pin action to a full commit: ${step.uses}`);
      if (
        step.uses?.startsWith("actions/checkout@") &&
        step.with?.["persist-credentials"] !== false
      )
        errors.push(`${file}: checkout must disable persisted credentials.`);
    }
  }
}
const rules = JSON.parse(read(".github/main-ruleset.json"));
for (const rule of rules.rules.filter((rule) => rule.type === "required_status_checks"))
  for (const check of rule.parameters.required_status_checks)
    if (!checks.has(check.context)) errors.push(`Required check has no job: ${check.context}`);

const markdown = [
  ...readdirSync(".").filter((file) => file.endsWith(".md")),
  ...filesUnder("docs").filter((file) => file.endsWith(".md")),
];
for (const file of markdown) {
  const content = read(file).replace(/```[\s\S]*?```/g, "");
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].trim().replace(/^<|>$/g, "").split("#")[0];
    if (!target || /^(?:[a-z]+:|\/\/)/i.test(target)) continue;
    if (!existsSync(path.resolve(path.dirname(file), decodeURIComponent(target))))
      errors.push(`${file}: broken local link: ${target}`);
  }
}
const pkg = JSON.parse(read("package.json"));
const lock = JSON.parse(read("package-lock.json"));
if (pkg.version !== lock.version || pkg.version !== lock.packages?.[""]?.version)
  errors.push("Package and lockfile versions differ.");
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    "Repository YAML, action pins, required-check names, local doc links and versions passed.",
  );
