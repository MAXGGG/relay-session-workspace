import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function seriousFindings(sarif) {
  if (sarif.version !== "2.1.0" || !Array.isArray(sarif.runs) || !sarif.runs.length)
    throw new Error("Missing or unsupported SARIF results.");
  const findings = [];
  for (const run of sarif.runs) {
    if (!run.tool?.driver || !Array.isArray(run.results))
      throw new Error("SARIF must include rules and results.");
    for (const result of run.results) {
      const reference = result.rule?.toolComponent;
      if (
        reference?.index !== undefined &&
        (!Number.isInteger(reference.index) || reference.index < 0)
      )
        throw new Error("Invalid SARIF rule component index.");
      const component = reference
        ? reference.index !== undefined
          ? run.tool.extensions?.[reference.index]
          : run.tool.extensions?.find((entry) =>
              reference.guid ? entry.guid === reference.guid : entry.name === reference.name,
            )
        : run.tool.driver;
      if (!component || !Array.isArray(component.rules))
        throw new Error("SARIF result refers to an unknown rule component.");
      const id = result.rule?.id ?? result.ruleId;
      const index = result.rule?.index ?? result.ruleIndex;
      if (index !== undefined && (!Number.isInteger(index) || index < 0))
        throw new Error("Invalid SARIF rule index.");
      const rule =
        index === undefined
          ? component.rules.find((entry) => entry.id === id)
          : component.rules[index];
      if (!rule || typeof rule.id !== "string" || !rule.id)
        throw new Error("SARIF result refers to an unknown rule.");
      if (
        (id !== undefined && rule.id !== id) ||
        (result.ruleId !== undefined && rule.id !== result.ruleId)
      )
        throw new Error("SARIF rule identity does not match its index.");
      const score = Number(rule.properties?.["security-severity"] ?? 0);
      if (!Number.isFinite(score)) throw new Error("Invalid SARIF security score.");
      const level = result.level ?? rule.defaultConfiguration?.level ?? "warning";
      if (score >= 7 || level === "error") findings.push(rule.id);
    }
  }
  return [...new Set(findings)];
}

export function checkSarifDirectory(directory) {
  const files = readdirSync(directory).filter((file) => file.endsWith(".sarif"));
  if (!files.length) throw new Error("No SARIF files were generated.");
  const findings = files.flatMap((file) =>
    seriousFindings(JSON.parse(readFileSync(path.join(directory, file), "utf8"))),
  );
  if (findings.length)
    throw new Error(`Blocking code-scanning findings: ${[...new Set(findings)].join(", ")}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkSarifDirectory(process.argv[2]);
  console.log("Code-scanning findings gate passed.");
}
