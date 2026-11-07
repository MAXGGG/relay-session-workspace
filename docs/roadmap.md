# Development roadmap

## 0.2: working local attention workspace

Implemented agent-independent profiles, original terminals, priority inbox, explicit user replies, lifecycle/recovery, notes/search, and optional notifications. [Acceptance and iteration evidence](release-plan.md) defines the release gate. Measure manual terminal checks, missed attention, time to resume work, and review effort on real projects.

## Next: improve evidence from real usage

- Validate Claude hooks against the installed CLI on a Claude-equipped machine. Keep generic fallbacks truthful.
- Add optional structured integrations when they materially reduce false or missed attention; keep terminal ownership agent-independent.
- Improve navigation from observed usage. A natural-language coordinator should map into typed, reviewed actions; worker output must remain untrusted data.
- Consider lifecycle independence from the launch terminal, saved-conversation discovery, and remote-host connections based on actual demand. Distinguish resuming history from adopting live processes.

## P2: knowledge before retirement

Schedule extraction before closing a live session. Propose reusable facts or procedures with source evidence, project scope, deduplication, and a reviewable diff. Temporary task status stays in task records. Start with review mode; later allow explicit opt-in auto-apply for trusted project paths.

Bound instruction-file growth, resolve contradictions, validate skill structure, retain undoable changes, and test failure/retry, concurrent proposals, stale evidence, secret exclusion, and rollback. Retire only after the selected extraction policy succeeds or the user skips it. This is persistent knowledge management, not model retraining.
