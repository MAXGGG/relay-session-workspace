# Testing and continued development

## Maintenance gates

In addition to product tests below, `npm run verify` includes tooling policy tests and `npm run check:repo` (YAML parsing, action pins, required-check names, local documentation links and version consistency). CI runs actionlint against workflow syntax. PR metadata has a separate **PR intake** check so description edits do not rerun every native build. `npm run audit:deps` checks the complete tree for high/critical advisories; CodeQL and dependency scans also run weekly. Moderate findings remain visible and tracked in SECURITY.md.

**CI required**, **Desktop required** and **Security required** fail if an expected upstream job fails or is skipped. GitHub's main ruleset requires those plus **PR intake**. These checks must pass on the current PR revision; a green local test is not a substitute. Tagged publication additionally calls security validation and checks release metadata/assets. See [releases](releases.md).

Tooling policy tests cover incomplete PR descriptions, untrusted metadata, version mismatches and incomplete/empty release assets. They do not change domain coverage thresholds. Workflow syntax is validated by actionlint locally or by the Repository policy job.

SARIF tests cover CodeQL extension-rule references, legacy driver rules, mismatched identities and invalid indexes. The 0.5.3 renderer test injects hostile metadata into a snapshot and asserts it creates no markup while remaining readable as literal text. PR scans can be differential; verify the full main security scan before tagging, and retain full security validation on tagged publication.

## Product validation

Version 0.5.3 has 22 unit, 36 integration, 27 browser and 2 desktop acceptance tests (87 on Windows; the Windows-only shim test is skipped on other platforms), plus nine tooling-policy tests. `npm run verify` covers the first three layers and tooling; build the desktop before `npm run test:desktop`. CI uses deterministic planners and subprocess fixtures; no model calls are made. Earlier management, coordinator, routing and resizing coverage remains in place.

Coordinator regressions exercise schema arguments and malformed prose from real CLI fixtures, validation before mutation, typed UI targets and fields, no effect replay, settings/folder/template forms, a real custom-template PTY launch, edit/delete target binding, cancellation, history/export/layout controls and preserving unsaved forms during delayed inference. Native acceptance covers menu IPC rejection, zoom, cancelled Quit and cancelled import; live model intent selection and OS permission dialogs remain separate acceptance.

Queue-history regressions reproduce the growing workspace with 61 handled records. They verify internal scrolling at desktop heights of 950, 720 and 600px, 20-item pages, handled-time ordering, last-page removal/reopen, refresh retention, live updates and a 390px stacked layout. Large Pending/Deferred lists stay complete and independently scrollable. Inspect the generated queue-history screenshots after changing layout.

The 0.5.2 follow-up regression reproduces accumulated Claude review cards. A real PTY fixture invokes the shipped bridge for consecutive turns, exercises terminal typing and the Reply dialog, and verifies only the latest response remains pending while Handled history survives reload. Unit/integration cases preserve other sessions, errors, approvals, manual classifications and newer results, and reject background-only, cancelled, expired and stale-process acknowledgement. This is deterministic integration evidence, not a live Claude/macOS acceptance claim.

New regressions cover empty Claude completions, actual hook-bridge delivery of long Unicode responses, saved group/template persistence and independent sessions, native folder-picker IPC, working/priority visibility, and a TUI input border whose original drawing commands have left raw transcript retention. Browser acceptance switches that terminal repeatedly and resizes it. Core coverage is 100% lines, 98.43% branches and 97.10% functions. This does not substitute for real Claude acceptance on the user's machine.

Desktop tests launch the actual Electron application and its bundled Node engine. They check terminal roundtrips, renderer isolation, window hiding, second-instance focus, graceful Quit, lost-parent cleanup, saved sessions and panel preferences after restart. Packaged acceptance first copies the app outside the checkout to prevent missing dependencies from falling back to development `node_modules`. Import tests preserve pending work/output and reject live or invalid sources and occupied destinations. A missing-asset regression prevents a broken package from crashing the HTTP server after headers have been sent.

`node scripts/smoke-installer.mjs` additionally tests Windows silent installation into a path containing spaces, installed-app acceptance, reinstall, uninstall and preservation of user data. It refuses to run when a Zyi installation or default user-data directory already exists; use a clean account/VM. The desktop workflow runs it after packaged tests on Windows. Mac packages are built and run natively on Apple Silicon and Intel runners; interactive Gatekeeper/notarization behavior is not proven by CI.

`npm run smoke:coordinator` separately uses a real Codex coordinator to locate an existing session by task meaning, then create a worker with an initial task and observe its actual answer. It was executed successfully on Windows during 0.3 development. It makes two coordinator calls and one worker turn using the installed account; it is never included in CI. See [0.3 acceptance](release-0.3.md) for final release evidence.

Use Node 24+ and `npm ci`. Install Chromium once with `npm run setup:browser` (add `-- --with-deps` for Linux system dependencies). Browser binaries live inside the ignored dependency directory by default.

| Layer | What it proves |
| --- | --- |
| Unit | Priority/age ordering, selection without resolution, snooze/wake, ambiguity, reply drafts, per-session event deduplication, uncertainty, archive/retirement, and recovery. |
| Integration | Snapshot/backup validation, workspace ownership, real HTTP/WebSocket/PTY routing, explicit delivery/retry/stale-target rejection, profiles and literal Windows shim arguments, retained terminal output, and twelve concurrent worker replies. |
| Browser | Empty onboarding, custom CLI, task notes, rename/search, next/open, reviewed reply targets, classification/reopen, archive/restore, settings, reconnect, and desktop/mobile layouts. |
| Live Codex (opt-in) | Actual installed Codex starts in a PTY, answers an initial prompt and a reply sent through Zyi, survives browser reload, and reaches the generic attention queue. |
| Manual Claude | On a machine with Claude installed: start/authenticate a session, ask a question, observe hooks, answer it, review a result, stop and resume. Separate from unattended CI. |

Run `npm run verify` before submitting a change. Coverage gates apply to core decision logic (90% lines/functions, 85% branches); coverage is not a claim that every integration is proven. Browser failures retain traces/screenshots. Tests use temporary directories and do not spend model tokens. GitHub Actions runs checks, tests, coverage and browser acceptance on Windows and Ubuntu.

Version 0.2 validation includes 17 unit tests, 20 integration tests, and 10 browser tests. Domain coverage is 100% lines, 98.48% branches, and 98.25% functions. The Windows-specific shim test is skipped on Linux. Coverage percentages do not measure agent correctness or prove every CLI's behavior.

Live acceptance was also executed on Windows with Node 24.22.1 and `codex-cli 0.167.0-alpha.3.2`: actual model responses, explicit follow-up submission, browser reconnect to the same process, and a quiet-output attention item passed. Claude and macOS live validation remain outstanding. CI evidence for the release is recorded in [the release plan](release-plan.md).

When fixing a bug, first reproduce its observable failure with a test. Avoid sleeps and broad mocks; await real events and inject time only into the domain model. Keep demo fixtures visibly simulated. Add a test scenario when a new coordinator action or lifecycle state is introduced.

## Run the live Codex check

After authenticating the installed CLI and trusting the Zyi repository, run `npm run smoke:codex`. The optional `-- --trust-project` argument explicitly accepts the initial repository trust prompt for this test. It makes two small model requests under a read-only sandbox and asks for no tool use. It never runs in `verify` or CI. Review `test-artifacts/codex-live.png` and `.log` if it fails; these artifacts are ignored by Git.

Live testing caught two bugs that mock sessions did not: replayed terminal color queries polluted agent input, and submitting Enter in the same burst as bracketed paste left a Codex message in its composer. Terminal queries now have one server-side owner; Claude/Codex paste and submission are separate and check the run ID again before Enter.

The browser routing regression changes the selected session while a reply dialog is open and asserts that only the originally named worker receives the text. Replaying/reloading after a completed draft must not reopen that already-sent draft. Twelve-PTY integration verifies that each worker receives exactly its own reply.

Ubuntu CI reproduced a shell remaining alive after SIGHUP during concurrent resize/stop. Stop now escalates after two seconds. Lifecycle coverage repeats twelve-shell teardown across five independent hosts and verifies termination of a worker that deliberately ignores SIGHUP, with diagnostic output if a host hangs.

## Manual Claude acceptance

This checklist is not yet executed on the user's Claude machine. Automated tests exercise real HTTP, WebSocket, hook bridge and terminal processes, but synthetic Claude events cannot prove all current CLI behavior.

1. Create a new Claude session in a disposable project. Complete normal authentication if needed; confirm its session ID is captured.
2. Send a task in the terminal. Verify working status, then a review item when the turn stops. Opening it must not mark it handled.
3. Trigger a structured question and a normal tool permission prompt. Check queue type, navigate from the coordinator, answer only in the terminal, and confirm no duplicate stale item remains.
4. Run three sessions concurrently with P1/P2/P3 priorities. Confirm Next selects the intended item, defer returns at expiry, and exact task IDs route correctly.
5. Stop and start a Claude session. Confirm it resumes the same saved conversation; quit and restart Zyi and repeat. Pending items must survive.
6. Close the browser while work runs, then reopen the launch link. Confirm the managed process continues. Stop Zyi and confirm its managed terminals exit.
7. Try a known saved conversation ID from the same project. Confirm CLI resume behavior and hook settings on the installed Claude version.

Record the OS, Node version, Claude version and failing event payload with sensitive content removed. Do not claim this check passed from demo tests alone.
