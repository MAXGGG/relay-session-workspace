# Maintenance and ownership

## Sources of truth

| Question | Location |
| --- | --- |
| Product boundaries | [PROJECT.md](../PROJECT.md) |
| Current/planned capabilities | [Features](features.md) |
| Order and exit criteria | [Roadmap](roadmap.md), then issues |
| Change acceptance | [Contributing](../CONTRIBUTING.md), PR template |
| Architecture rationale | [Decisions](decisions/README.md) |
| Validation and shipping | [Testing](testing.md), [releases](releases.md) |
| Vulnerabilities | [Security](../SECURITY.md) |

@MAXGGG is accountable maintainer/release owner. CODEOWNERS routes review; it does not prove review occurred. Document handover and raise approval requirements when another maintainer joins.

## Triage and routine work

Use open → accepted/backlog → in progress → in review → done. Accepted issues need owner, feature ID where relevant, problem/reproduction, acceptance, priority and validation plan. Milestones specify scope, not unsupported dates.

P0: data loss, wrong-session delivery, exploitable security issue; stop affected releases and investigate first. P1: core workflow unreliable/unavailable. P2: improvements/moderate dependency risks. P3: exploration. Priority differs from severity and runtime session priority.

Close with evidence or an explicit duplicate/out-of-scope reason. No automatic stale closure of unresolved bugs. Distinguish “not reproduced”, configuration resolved, and implementation fixed.

- Weekly: triage reports, review dependency/security jobs, CI failures and PRs.
- Monthly: review roadmap, compatibility, expiring dependency risks and signing blockers.
- Every release: changelog, native evidence, affected real-agent tests, installer contents, data recovery and rollback.
- After incidents: redacted reproduction, cause/impact/recovery, regression and documentation improvements.

A flaky check needs an owner and bounded fix; do not rerun until green or repeat full tests on unchanged passing code without cause.

## Compatibility and data

Node 24 LTS is the build baseline. Desktop targets: Windows x64, Mac arm64/x64. Ubuntu tests server/browser, not a Linux desktop product. Agent compatibility depends on CLI flags/events, not model names. Record actual tested versions; fixtures do not prove live behavior.

Schema changes specify readers/writers, migration order, unsupported-version behavior and backup/restore. Retain pre-migration data and test old-version fixtures. Check an old app can read new state before rollback; never overwrite user data to make recovery appear successful.

Support latest preview only until a stable policy is adopted. 0.x still requires migration notices and clear user-facing changes.

## GitHub enforcement

- main: PR required, up-to-date **PR intake**, **CI required**, **Desktop required**, **Security required**, resolved conversations.
- Squash/linear history; no main deletion/force push; delete merged branches.
- Zero required approvals with one maintainer; one after a second joins. Document emergency admin bypass.
- Read-only default Actions token; automated PR approval off.
- Private vulnerability reporting and dependency alerts enabled.

[main-ruleset.json](../.github/main-ruleset.json) is desired configuration, not proof of enforcement. Verify GitHub Settings → Rules. Apply check names only after a real PR emits and passes them.

## Production readiness

Before calling Zyi stable: bound P1 reliability failures, verify signing and Mac permissions across upgrades, validate actual agent workflows, test state recovery, provide redacted diagnostics and maintain a support/release owner. P2 knowledge extraction is not a prerequisite for a reliable session manager.
