import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { checkSarifDirectory, seriousFindings } from "../../scripts/check-sarif.mjs";

const report = (score, level = "warning") => ({
  version: "2.1.0",
  runs: [
    {
      tool: {
        driver: {
          rules: [
            {
              id: "test/rule",
              properties: { "security-severity": score },
              defaultConfiguration: { level },
            },
          ],
        },
      },
      results: [{ ruleId: "test/rule" }],
    },
  ],
});

test("SARIF gate blocks high/critical and error-level findings, including inherited levels", () => {
  assert.deepEqual(seriousFindings(report("7.5")), ["test/rule"]);
  assert.deepEqual(seriousFindings(report("9.8")), ["test/rule"]);
  assert.deepEqual(seriousFindings(report("0", "error")), ["test/rule"]);
  assert.deepEqual(seriousFindings(report("5.5")), []);
  const indexed = report("8.0");
  indexed.runs[0].results = [{ ruleIndex: 0 }];
  assert.deepEqual(seriousFindings(indexed), ["test/rule"]);
});

test("SARIF gate fails closed on absent or malformed scan output", (t) => {
  assert.throws(() => seriousFindings({}), /SARIF/);
  assert.throws(() => seriousFindings(report("invalid")), /score/);
  const unknown = report("8.0");
  unknown.runs[0].results = [{ ruleId: "unrecognized" }];
  assert.throws(() => seriousFindings(unknown), /unknown/);
  const root = mkdtempSync(path.join(os.tmpdir(), "zyi-sarif-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.throws(() => checkSarifDirectory(root), /No SARIF/);
});
