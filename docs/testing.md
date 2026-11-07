# Testing and continued development

Use Node 24+ and `npm ci`. Install Chromium once with `npm run setup:browser` (add `-- --with-deps` for Linux system dependencies). Browser binaries live inside the ignored dependency directory by default.

| Layer | What it proves |
| --- | --- |
| Unit | Priority/age ordering, selection without resolution, snooze/wake, ambiguity, reply drafts, per-session event deduplication, uncertainty, archive/retirement, and recovery. |
| Integration | Snapshot/backup validation, workspace ownership, real HTTP/WebSocket/PTY routing, explicit delivery/retry/stale-target rejection, profiles and literal Windows shim arguments, retained terminal output, and twelve concurrent worker replies. |
| Browser | Empty onboarding, custom CLI, task notes, rename/search, next/open, reviewed reply targets, classification/reopen, archive/restore, settings, reconnect, and desktop/mobile layouts. |
| Live Codex (opt-in) | Actual installed Codex starts in a PTY, answers an initial prompt and a reply sent through Relay, survives browser reload, and reaches the generic attention queue. |
| Manual Claude | On a machine with Claude installed: start/authenticate a session, ask a question, observe hooks, answer it, review a result, stop and resume. Separate from unattended CI. |

Run `npm run verify` before submitting a change. Coverage gates apply to core decision logic (90% lines/functions, 85% branches); coverage is not a claim that every integration is proven. Browser failures retain traces/screenshots. Tests use temporary directories and do not spend model tokens. GitHub Actions runs checks, tests, coverage and browser acceptance on Windows and Ubuntu.

Version 0.2 local validation on Windows passes 17 unit tests, 19 integration tests, and 10 browser tests. Domain coverage is 100% lines, 98.48% branches, and 98.25% functions. The Windows-specific shim test is skipped on Linux. Coverage percentages do not measure agent correctness or prove every CLI's behavior.

Live acceptance was also executed on Windows with Node 24.22.1 and `codex-cli 0.167.0-alpha.3.2`: actual model responses, explicit follow-up submission, browser reconnect to the same process, and a quiet-output attention item passed. Claude and macOS live validation remain outstanding. CI evidence for the release is recorded in [the release plan](release-plan.md).

When fixing a bug, first reproduce its observable failure with a test. Avoid sleeps and broad mocks; await real events and inject time only into the domain model. Keep demo fixtures visibly simulated. Add a test scenario when a new coordinator action or lifecycle state is introduced.

## Run the live Codex check

After authenticating the installed CLI and trusting the Relay repository, run `npm run smoke:codex`. The optional `-- --trust-project` argument explicitly accepts the initial repository trust prompt for this test. It makes two small model requests under a read-only sandbox and asks for no tool use. It never runs in `verify` or CI. Review `test-artifacts/codex-live.png` and `.log` if it fails; these artifacts are ignored by Git.

Live testing caught two bugs that mock sessions did not: replayed terminal color queries polluted agent input, and submitting Enter in the same burst as bracketed paste left a Codex message in its composer. Terminal queries now have one server-side owner; Claude/Codex paste and submission are separate and check the run ID again before Enter.

The browser routing regression changes the selected session while a reply dialog is open and asserts that only the originally named worker receives the text. Replaying/reloading after a completed draft must not reopen that already-sent draft. Twelve-PTY integration verifies that each worker receives exactly its own reply.

## Manual Claude acceptance

This checklist is not yet executed on the user's Claude machine. Automated tests exercise real HTTP, WebSocket, hook bridge and terminal processes, but synthetic Claude events cannot prove all current CLI behavior.

1. Create a new Claude session in a disposable project. Complete normal authentication if needed; confirm its session ID is captured.
2. Send a task in the terminal. Verify working status, then a review item when the turn stops. Opening it must not mark it handled.
3. Trigger a structured question and a normal tool permission prompt. Check queue type, navigate from the coordinator, answer only in the terminal, and confirm no duplicate stale item remains.
4. Run three sessions concurrently with P1/P2/P3 priorities. Confirm Next selects the intended item, defer returns at expiry, and exact task IDs route correctly.
5. Stop and start a Claude session. Confirm it resumes the same saved conversation; quit and restart Relay and repeat. Pending items must survive.
6. Close the browser while work runs, then reopen the launch link. Confirm the managed process continues. Stop Relay and confirm its managed terminals exit.
7. Try a known saved conversation ID from the same project. Confirm CLI resume behavior and hook settings on the installed Claude version.

Record the OS, Node version, Claude version and failing event payload with sensitive content removed. Do not claim this check passed from demo tests alone.
