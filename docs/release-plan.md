# Relay 0.2 working release

The release is a local attention inbox for independently running CLI sessions. The user owns priorities and decisions. Relay owns navigation, durable records, and explicit routing. It runs on the same computer as the terminals; a browser can reach a remote installation through an SSH tunnel.

## Acceptance and iteration order

1. **Launch and recover any CLI.** Shell, Claude, Codex, and custom executable/argument profiles. Preserve launch settings, names, priorities, notes, and explicit conversation IDs. Restarting a process must never claim to restore a conversation unless a resume mechanism is configured. Test literal arguments, missing executables, Windows PTYs, and persisted launch settings.
2. **Collect attention.** Structured question/approval/result/error events, optional quiet-terminal suggestions for unsupported tools, and manual entries. Show uncertainty, deduplicate events, respect priorities, and retain pending work. Test concurrent workers, repeated events, snooze/wake, and restart.
3. **Handle one item.** Next, open, priority, snooze, reclassify, reopen, resolve, and explicit reply with a visible target. Prevent stale-target and duplicate sends. Never approve a worker automatically. Test routing with real PTYs and browser actions.
4. **Retain and retrieve work.** Search, rename, notes, archive/restore stopped sessions, bounded persisted terminal output, reconnect, and opt-in retirement of inactive stopped sessions without outstanding items. Do not delete files or externally owned terminals. Test shutdown, crash/recovery records, and data-directory ownership.
5. **Make the release usable.** Empty workspace onboarding, demo opt-in, session editing, attention details, optional browser notifications, readable compact layouts, installation/upgrade instructions, troubleshooting, and a repeatable real Codex smoke check. Full local checks and Windows/Linux CI must pass.

## Release boundaries

- Original interactive terminals remain available. Generic terminal silence is only a suggestion; it cannot prove an agent needs input or succeeded.
- The coordinator supports documented commands and explicit reply drafts. An LLM is not required for core operations.
- Existing arbitrary external terminals cannot be adopted. Saved conversations can be resumed by explicit ID or a custom resume argument template.
- Browser closure does not stop workers. Server shutdown stops managed processes; transcripts and queue records remain.
- Knowledge extraction into project instructions/skills remains a separate P2 release. This release retains notes and output but does not claim automatic learning.

## Progress

- Baseline: all 27 original tests passed.
- Cycle 1 complete: generic launch/resume profiles, metadata, and lifecycle policy; literal-argument and archive regression tests pass.
- Cycle 2 complete: generic events, per-session deduplication, explicit approvals, quiet suggestions, classification/reopen, and manual attention; domain and real-worker integration tests pass.
- Cycle 3 complete: reviewed reply routing, persistent receipts, stale-run rejection, terminal replay, exclusive workspace ownership, and browser reconnect. Browser tests caught and drove fixes for replayed device responses; live Codex testing drove separate paste/Enter submission.
- Cycles 4–5 complete: empty onboarding, session editing/search/notes, archive/restore, optional retirement, notifications, updated setup/recovery docs, desktop/mobile visual inspection, and twelve-worker stress acceptance.
- Local full verification passes: 17 unit + 20 integration + 10 browser tests; domain line coverage 100%, branch coverage 98.48%, function coverage 98.25%.
- Live Codex acceptance: actual initial response and UI-submitted follow-up, browser reload, and generic attention passed with Node 24.22.1 / Codex 0.167.0-alpha.3.2 on Windows.
- CI caught a Linux shell remaining alive after its stop signal. Added bounded Unix termination, a worker that ignores SIGHUP, and five repetitions of twelve-shell teardown.
- Release gate passed: [Windows and Ubuntu CI](https://github.com/MAXGGG/relay-session-workspace/actions/runs/42328588043) passed for implementation commit `f253e2a`, including repeated concurrent teardown and the stubborn worker. Windows runs all 47 tests; Ubuntu runs 46 with the Windows-only shim test skipped. No paid inference runs in CI.
- Version 0.2 is published on GitHub and ready for local use. Real Claude and macOS checks remain outside the verified platform claims, and P2 knowledge extraction remains separate.
