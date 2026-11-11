# Feature catalogue

This is the inventory of current and proposed behavior. The [roadmap](roadmap.md) orders work; GitHub issues hold implementation discussion and PR links. Update status in the PR that changes it. A shipped implementation is not proof of live compatibility with every agent or OS.

**Shipped** = tagged preview; **Partial** = implementation with named gaps; **Planned** = accepted direction; **Exploring** = not committed. Priorities: P0 data loss/security, P1 daily reliability, P2 improvement, P3 exploration. Owner for unassigned work: @MAXGGG.

## Current release: 0.5.3

| ID | Feature | Status | Evidence and limits |
| --- | --- | --- | --- |
| F01 | Shell, Claude, Codex and custom CLI profiles; original PTY | Shipped | [Profiles](../test/integration/profiles.test.ts), [lifecycle](../test/integration/lifecycle.test.ts). Local host only; cannot adopt arbitrary external terminals. |
| F02 | Priority queue; next, defer, classify, resolve/reopen | Shipped | [Queue tests](../test/unit/attention.test.ts), [browser flow](../test/e2e/workspace.spec.ts). Opening never resolves an item; silence is a suggestion. |
| F03 | Claude completion/question/permission hooks | Partial | [Bridge tests](../test/integration/claude-bridge.test.ts), [follow-up flow](../test/e2e/session-library.spec.ts). Submitted follow-ups acknowledge earlier automatic response cards; background events alone preserve them. Requires Claude profile and connected hooks; Shell launches do not install integration. Real Mac/Claude acceptance remains open. |
| F04 | Coordinator navigation, clarification and worker creation | Shipped | [Transport](../test/integration/coordinator-transport.test.ts), [management](../test/e2e/management.spec.ts). CLI account, bounded context, no autonomous approval. |
| F05 | Reviewed replies and delivery receipts | Shipped | [Routing](../test/integration/attention-routing.test.ts). Explicit session/run binding; uncertain deliveries are not replayed. |
| F06 | Groups, pins, order, search, notes, archive/restore/deletion | Shipped | [Management](../test/e2e/management.spec.ts). Automatic retirement only archives stopped sessions without pending work. |
| F07 | Templates, group folders and Claude permission preference | Shipped | [Library](../test/e2e/session-library.spec.ts), [launch options](../test/e2e/launch-options.spec.ts). Templates exclude conversation IDs and notes. |
| F08 | Claude name and conversation resume | Partial | [Profiles](../test/integration/profiles.test.ts). Launch-only naming; no live rename sync. Shell records have no automatic Claude ID capture. |
| F09 | Terminal screen restoration and panel resizing | Shipped | [Screen replay](../test/integration/terminal-screen.test.ts), [browser acceptance](../test/e2e/release.spec.ts). Stopped output is bounded. |
| F10 | Atomic state, backup, workspace lock and recovery | Shipped | [Store](../test/integration/store.test.ts), [lifecycle](../test/unit/lifecycle.test.ts). Records survive; process memory does not. |
| F11 | Windows x64 and Mac arm64/x64 packages | Partial | [Packaged acceptance](../test/desktop/app.test.ts). Windows unsigned; Mac ad-hoc signed, not notarized. CI does not prove interactive privacy/Gatekeeper behavior. |

## Accepted work

F18 is implemented by the maintenance foundation PR and maintained on main independently of installer releases. Other entries below remain planned until their acceptance evidence is recorded.

| ID | Priority | Feature / problem | Acceptance criteria |
| --- | --- | --- | --- |
| F12 | P1 | Recurring Mac folder denial | Sanitized evidence and exact versions; distinguish same-run failures from upgrade permission loss; actionable checks; real Mac reproduction before claiming a fix. |
| F13 | P1 | Stable signed distribution | Mac Developer ID signing, notarization and upgrade permission tests; Windows signing when credentials exist; verify installed artifacts. |
| F14 | P1 | Obvious attention capability and hook health | Show profile/detection limitations; test a real Claude completion while another session is selected. |
| F15 | P1 | Safe profile conversion | Explicit stopped-session conversion; preserve notes/queue/history identity; validate arguments; never pretend an unidentified conversation resumed. |
| F16 | P2 | Naming consistency | Report launch-only synchronization; use supported interfaces; never inject rename commands into a busy worker blindly. |
| F17 | P1 | Diagnostics and recovery | User-reviewed redacted export; exclude secrets, prompts and transcripts by default; actionable folder/hook errors; test redaction/recovery. |
| F18 | P1 | Maintained development workflow | Inventory, PR intake, ownership, CI/security/native gates, release and maintenance policies enforced on GitHub. |
| F19 | P2 | Knowledge before retirement | Source-linked scoped facts/skills; deduplication, reviewed diffs, rollback and failure handling. Auto-apply only with later explicit opt-in. |
| F20 | P1 | Safe workspace upgrades | Versioned migration fixtures, untouched backup and explicit unsupported-version recovery; retain pending work. |

## Exploration

| ID | Priority | Idea | Decision needed |
| --- | --- | --- | --- |
| F21 | P3 | Remote hosts / session discovery | Authentication and process ownership; distinguish saved history from live process adoption. |
| F22 | P3 | More structured agent adapters | Public event protocol and live validation; terminal core stays agent-independent. |
| F23 | P3 | Automatic updates | Signed verified artifacts, explicit restart behavior and rollback first. |

Out of scope now: autonomous approvals, unlimited shared model memory, hosted multi-user terminals, automatic Git worktrees and transferring live processes between computers.
