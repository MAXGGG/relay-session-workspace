# Working on Relay

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
- `scripts`: Claude hook bridge and explicitly simulated worker.
- Tests use temp state directories and ephemeral ports. Never read the user's actual Claude history in automated tests.

## Product invariants
Stable IDs determine every routing target. Viewing never resolves attention. Priorities are user-controlled; oldest first breaks ties. The coordinator does not answer workers or approve actions. Unsupported or ambiguous requests must not silently choose a session. Simulated sessions are labeled. Closed terminals remain resumable records, not supposedly live processes.

## Development
Preserve pending work on failures and restarts. Keep hooks local to launched sessions; never rewrite global Claude settings. Keep root instructions concise and update docs when behavior changes. Test state transitions and externally observable behavior, not private implementation details. Add regression coverage for fixed bugs. Inspect the UI after changing layout.
