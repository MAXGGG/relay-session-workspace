# Contributing

Read [PROJECT.md](PROJECT.md) for the product scope and [AGENTS.md](AGENTS.md) for implementation boundaries. Keep changes small enough to review as one behavior change.

## Setup and validation

Use Node 24+, `npm ci`, and `npm run setup:browser`. Start locally with `npm run dev`. Run `npm run verify` before submitting changes. The same command runs in the Windows/Ubuntu CI matrix. Preserve `package-lock.json`; update it deliberately when changing dependencies.

For npm versions with install-script approval, package.json allows only the pinned node-pty version's native setup scripts. Review that allowance when updating the dependency; do not enable arbitrary install scripts globally.

For a bug, reproduce the observable failure with a regression test, implement the fix, and run the relevant test layer. Run the full verification command before completion. UI changes need a browser flow and visual inspection; hook changes need synthetic event coverage and a manual check on a real Claude installation when possible. Clearly state when the real-Claude check was unavailable.

## Work with an AI coding agent

Give the agent a concrete acceptance condition, such as: “Add a waiting-item filter; opening a filtered item must not resolve it; include the browser test.” Ask it to read AGENTS.md, inspect existing tests, implement the smallest coherent change, and run verification. Review the resulting diff and observed behavior. Update the architecture/product notes when a boundary changes rather than growing root instruction files with task history.

## Pull requests

Describe the user-visible problem, resulting behavior, and validation. Flag any untested platform or external integration. Do not include `.relay/`, access tokens, real session transcripts, `node_modules`, or generated reports. Never weaken a test gate to make an unrelated failure disappear. Dependency upgrades touching `node-pty` must pass the natural-exit and explicit-stop subprocess tests; see the Windows compatibility note in docs/architecture.md.
