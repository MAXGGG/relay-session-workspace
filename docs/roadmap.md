# Development roadmap

## 0.4: Zyi desktop preview

Rename Relay to Zyi. Package the UI and terminal engine for Windows x64 and macOS Apple Silicon/Intel, with close-to-tray lifecycle, app-data storage, legacy import, durable preferences and tests of the actual packaged apps. See [acceptance](release-0.4.md) and [setup](desktop.md). Signed/notarized distribution and automatic updates are follow-up work.

## 0.3: daily session management and coordinator agent

Sidebar actions, pinning, named groups, drag ordering, explicit deletion, process-aware status dots, and resizable panes address the first real-use feedback. Codex/Claude coordinator inference supports semantic navigation, multi-turn clarification, and creation of requested worker tasks through validated actions. See [goals and validation](release-0.3.md).

## 0.2: working local attention workspace

Implemented agent-independent profiles, original terminals, priority inbox, explicit user replies, lifecycle/recovery, notes/search, and optional notifications. [Acceptance and iteration evidence](release-plan.md) defines the release gate. Measure manual terminal checks, missed attention, time to resume work, and review effort on real projects.

## Next: improve evidence from real usage

- Validate Claude hooks against the installed CLI on a Claude-equipped machine. Keep generic fallbacks truthful.
- Add optional structured integrations when they materially reduce false or missed attention; keep terminal ownership agent-independent.
- Improve coordinator intent handling from observed usage and evaluate ambiguous requests. Worker output and task notes remain untrusted data; natural-language plans must stay within typed application actions.
- Consider lifecycle independence from the launch terminal, saved-conversation discovery, and remote-host connections based on actual demand. Distinguish resuming history from adopting live processes.

## P2: knowledge before retirement

Schedule extraction before closing a live session. Propose reusable facts or procedures with source evidence, project scope, deduplication, and a reviewable diff. Temporary task status stays in task records. Start with review mode; later allow explicit opt-in auto-apply for trusted project paths.

Bound instruction-file growth, resolve contradictions, validate skill structure, retain undoable changes, and test failure/retry, concurrent proposals, stale evidence, secret exclusion, and rollback. Retire only after the selected extraction policy succeeds or the user skips it. This is persistent knowledge management, not model retraining.
