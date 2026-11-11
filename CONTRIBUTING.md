# Contributing to Zyi

Read [PROJECT.md](PROJECT.md), [AGENTS.md](AGENTS.md), [features](docs/features.md) and [architecture](docs/architecture.md). Zyi remains a desktop preview.

## Setup

Use Node 24 LTS (.nvmrc), then:
```sh
npm ci
npm run setup:browser
npm run dev
```
Build native packages on their target OS/architecture. Commit deliberate lockfile changes. Review native install-script allowances rather than enabling all scripts.

## Intake

1. Check issues and feature IDs. A bug needs reproduction; a feature needs an outcome and acceptance criteria. Small maintenance/docs fixes can go straight to a PR.
2. Use a branch such as fix/hook-health. One reviewable outcome per PR; separate unrelated cleanup/dependency updates.
3. Changes to architecture, persistence, process ownership or trust boundaries need a short [decision](docs/decisions/README.md).
4. Open a draft while scope/evidence is incomplete. Fill the template before requesting review.

Title: `type(optional-scope): description`. Types: feat, fix, docs, refactor, test, build, ci, chore, perf, revert. Example: `fix(claude): surface disconnected hooks`.

The **PR intake** check validates title and substantive Problem, Changes, Validation, Risk and recovery, and Related work sections. Comments/placeholders do not count. Dependabot keeps its generated body but still needs a valid title and all technical checks. Metadata checks do not establish correctness.

## Definition of done

- Explain the trigger, previous behavior, result and scope; link an issue/feature ID or explain a small standalone change.
- Reproduce bugs with behavioral tests when practical. Persistence changes include migration/backup evidence. Use temporary data and deterministic fixtures, not personal history or default paid calls.
- Run npm run verify. Record exact commands/results and unavailable checks; distinguish simulation from live integration.
- UI changes need screenshots or recorded visual inspection. PTY/desktop changes need native packaged/installed lifecycle evidence.
- Preserve explicit input targets and approval boundaries. No tokens, transcripts, local .relay state or credentials in the diff.
- Update docs, feature status and Unreleased changelog when behavior changes.
- Explain risk, data compatibility and rollback. Resolve review threads; never weaken a gate to hide a failure.

## Review and merge

CODEOWNERS names @MAXGGG. External changes need maintainer review. Seek a second reviewer for sensitive changes when available. A sole maintainer cannot approve their own PR; the baseline therefore requires PRs and checks with zero mandatory approvals. Own changes need written self-review and evidence. Raise the rule to one approval when another active maintainer joins.

Required checks: **PR intake**, **CI required**, **Desktop required**, **Security required**. Merge only on the current revision with up-to-date checks and resolved conversations. Squash merge and delete the feature branch. No routine direct/force pushes to main. Emergency admin bypass requires a recorded reason and follow-up.

Review behavior, failure recovery, ownership, tests capable of catching the bug, OS/agent claims and supply-chain changes. AI-authored code meets the same bar; the human submitter owns the result.

## Maintenance and AI

Dependabot opens bounded weekly updates. Keep native runtime/PTY/Electron changes separate from routine tooling. Do not run audit fix --force without reviewing version changes. See [security](SECURITY.md), [maintenance](docs/maintenance.md) and [releases](docs/releases.md).

Give AI agents acceptance criteria; have them read AGENTS.md, reproduce, implement, validate and report limits. Review the diff. Stable constraints belong in root instructions, decisions in ADRs, and task history in issues/PRs.
