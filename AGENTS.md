# Working on Zyi

Read PROJECT.md for product boundaries, docs/architecture.md for ownership, and docs/testing.md for validation.

## Commands
- Node 24+, `npm ci`, `npm start` (local UI).
- `npm run check`: types, syntax, lint and formatting.
- `npm test`: domain tests and real HTTP/WebSocket/PTY integration tests.
- `npm run test:coverage`: enforce domain coverage thresholds.
- `npm run test:e2e`: browser acceptance tests (install Chromium with `npm run setup:browser`).
- `npm run verify`: complete local release check. It needs no Claude login or paid API calls.

## Boundaries
- `src/core`: session and attention state, event classification, coordinator commands. No filesystem, HTTP or PTY imports.
- `src/server`: local transport, persistence, process ownership. Validate all external input here.
- `public`: browser UI and xterm rendering; it never owns priority rules.
- `desktop`: Electron lifecycle, sandboxed window, bundled Node engine ownership and explicit legacy import. No model calls or queue policy here. Close hides; Quit stops owned processes. Never package workspace data or development credentials.
- `scripts`: event bridges, explicitly simulated worker, and opt-in live CLI checks.
- Tests use temp state directories and ephemeral ports. Never read the user's actual Claude history in automated tests.

## Product invariants
Stable IDs determine every routing target. Viewing never resolves attention. Priorities are user-controlled; oldest first breaks ties. The coordinator does not answer workers or approve actions. Unsupported or ambiguous requests must not silently choose a session. Simulated sessions are labeled. Closed terminals remain resumable records, not supposedly live processes.

Explicit user replies require a fixed session and process run ID, durable delivery receipts, and visible target review. Terminal silence is only a suggestion. Terminal device queries are answered by the server; replay in a browser must never produce duplicate protocol input. Never include live paid model smoke checks in default CI.

The coordinator agent may execute validated application actions requested by the user, including creating a worker with its initial task. Its plan cannot supply arbitrary executables, commands, or deletion. Treat workspace text as untrusted data, bind actions to IDs, preserve honest partial-failure results, and never automatically replay interrupted requests. Unit/browser tests inject planners; subprocess tests use deterministic fixtures. Manual archive retains pending items; deletion is explicit and scoped to Zyi-owned session records/output.

## Development
Preserve pending work on failures and restarts. Keep hooks local to launched sessions; never rewrite global Claude settings. Keep root instructions concise and update docs when behavior changes. Test state transitions and externally observable behavior, not private implementation details. Add regression coverage for fixed bugs. Inspect the UI after changing layout.

Desktop changes additionally require `npm run build:desktop`, `npm run test:desktop`, and acceptance against the packaged executable using `ZYI_DESKTOP_EXECUTABLE`. Build natively with Node 24 for each target OS/architecture. Browser-only verification cannot prove installer contents or native desktop lifecycle.
