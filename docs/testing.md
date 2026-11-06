# Testing and continued development

Use Node 24+ and `npm ci`. Install Chromium once with `npm run setup:browser` (add `-- --with-deps` for Linux system dependencies). Browser binaries live inside the ignored dependency directory by default.

| Layer | What it proves |
| --- | --- |
| Unit | Priority/age ordering, selection without resolution, snooze/wake, target ambiguity, event deduplication, question vs result handling, invalid input. |
| Integration | Atomic state round trips, real HTTP/WebSocket authentication, event ingestion, restart semantics, real PTY input/output and cleanup. |
| Browser | Four-panel flow, next/open commands selecting the correct terminal, review/defer/priority controls, create session, refresh persistence. |
| Manual Claude | On a machine with Claude installed: start/authenticate a session, ask a question, observe hooks, answer it, review a result, stop and resume. Separate from unattended CI. |

Run `npm run verify` before submitting a change. Coverage gates apply to core decision logic (90% lines/functions, 85% branches); coverage is not a claim that every integration is proven. Browser failures retain traces/screenshots. Tests use temporary directories and do not spend model tokens. GitHub Actions runs checks, tests, coverage and browser acceptance on Windows and Ubuntu.

The initial validation passed 12 unit tests, 10 integration tests and 5 browser tests, with 100% core line/function coverage and 98.88% branch coverage. This includes actual terminal input/output and concurrent shutdown of twelve shells. The [first GitHub Actions run](https://github.com/MAXGGG/relay-session-workspace/actions/runs/42300200534) passed on Windows and Ubuntu. Real Claude acceptance and macOS validation remain outstanding.

When fixing a bug, first reproduce its observable failure with a test. Avoid sleeps and broad mocks; await real events and inject time only into the domain model. Keep demo fixtures visibly simulated. Add a test scenario when a new coordinator action or lifecycle state is introduced.

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
