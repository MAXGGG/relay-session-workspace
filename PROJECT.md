# Zyi

Zyi helps one person handle many independent CLI sessions: Claude, Codex, shells, and custom agents. It presents a priority-ordered attention inbox and opens each item's original terminal. The coordinator navigates, organizes, and prepares replies for explicit sending; it does not make decisions or approve work for the user.

## Working release acceptance

The [feature catalogue](docs/features.md) is the current/planned capability inventory; the [roadmap](docs/roadmap.md) defines next milestones. [Maintenance](docs/maintenance.md) defines ownership and stable-release readiness.

- Four areas: sessions, attention queue, coordinator, original terminal.
- Separate questions, approvals, review results, errors, and uncertain activity suggestions. One session can produce several items.
- User priority first, then oldest first. Opening an item never resolves it.
- Next, open, defer, review/done, and priority commands have visible, deterministic effects.
- Any installed interactive CLI can run through an executable/argument profile. Agent integration is optional.
- Explicit reply routing binds to a session ID and current process instance. Retrying the same delivery does not duplicate it.
- Search, editing, notes, archive/restore, retained terminal output, and configured conversation resume survive server restarts.
- Browser closure keeps processes running. Server restart restores stopped records and pending work, not live process handles.
- The server handles terminal device responses. Browser replay cannot inject old responses into worker input.
- Claude hooks stay local to managed sessions and never modify global Claude settings or auto-answer approvals.
- Automated verification uses real PTYs and browser flows without paid AI calls. Live agent acceptance is opt-in.
- Version 0.3 adds sidebar grouping, pinning, reordering and explicit deletion; process-aware status; adjustable panels; and a Codex/Claude coordinator that maps natural-language requests to validated actions and starts explicitly requested tasks.
- Version 0.4 renames the product to Zyi and packages it as a desktop app with a bundled engine, background lifecycle, app-data storage and legacy import. See [desktop acceptance](docs/release-0.4.md).
- Version 0.5 adds reusable launch templates, saved group folders, Claude naming and hook diagnostics, completion-delivery regressions, readable priorities and current-screen terminal restoration. See [0.5 acceptance](docs/release-0.5.md).

See [0.3 acceptance](docs/release-0.3.md) and [0.2 release history](docs/release-plan.md) for development cycles and evidence.

## P2: knowledge before retirement

Future extraction should propose reusable project facts or skills with provenance, deduplication, scoped diffs, review/auto-apply policy, and rollback. Temporary task status belongs in task records. Extraction should finish before retiring a live session; a process-ending hook cannot reliably run a long model job. Version 0.2 retains notes and transcripts but does not implement automatic knowledge extraction.

## Current assumptions

Run Zyi on the machine hosting its terminal processes. The local release is tested with Codex CLI on Windows; Windows and Ubuntu CI cover deterministic behavior. Real Claude and macOS acceptance remain separate. Terminal silence is only an attention suggestion. The coordinator can use Codex or Claude inference with existing CLI authentication, or Commands only without inference. Automatic learning remains future work.
