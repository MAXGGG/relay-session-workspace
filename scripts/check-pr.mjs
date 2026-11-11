import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function validatePullRequest(pr) {
  const errors = [];
  if (
    !/^(feat|fix|docs|refactor|test|build|ci|chore|perf|revert)(\([\w./-]+\))?!?: \S.{5,119}$/.test(
      pr.title ?? "",
    )
  )
    errors.push(
      "Use type(scope): description with a meaningful title (6–120 characters after the prefix).",
    );
  if (pr.user?.login === "dependabot[bot]") return errors;
  let body = pr.body ?? "";
  let previous;
  do {
    previous = body;
    body = body.replace(/<!--[\s\S]*?(?:-->|$)/g, "");
  } while (body !== previous);
  for (const heading of ["Problem", "Changes", "Validation", "Risk and recovery", "Related work"]) {
    const sections = [...body.matchAll(/^## ([^\r\n]+)\r?\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)];
    const content =
      sections
        .find((match) => match[1].trim().toLowerCase() === heading.toLowerCase())?.[2]
        .trim() ?? "";
    if (
      content.length < 20 ||
      /^(tbd|todo|n\/a|none|fill (this|in)|describe here)[.!\s]*$/i.test(content)
    )
      errors.push(
        `Fill the "${heading}" section with evidence or a specific explanation (at least 20 characters).`,
      );
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH || process.argv[2], "utf8"));
  if (!event.pull_request) throw new Error("Expected a pull_request event.");
  const errors = validatePullRequest(event.pull_request);
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else console.log("PR intake passed. Review and technical checks are still required.");
}
