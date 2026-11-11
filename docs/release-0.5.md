# Zyi 0.5: everyday session workflow

Patch 0.5.2 acknowledges earlier automatic Claude response cards when a submitted follow-up is paired with the current process's prompt hook. Terminal and Reply-dialog regressions retain Handled history without clearing approvals, errors, manually classified items or another session's work. Background hooks and viewing alone preserve results; see [release notes](release-notes-0.5.2.md).

Patch 0.5.1 adds a saved Claude permission checkbox and field-specific argument validation. Browser regressions reproduce an unexpected-comma error in the second JSON field while the first field is valid, verify invalid arrays never launch a worker, and exercise template reuse/editing of the permission choice without altering other arguments.

## Goals and acceptance

1. **Reusable creation:** separate templates, saved group folders and advanced options. A group can own a folder before it has sessions. New sessions inherit that folder; changing it never relocates an existing worker. Templates exclude conversation IDs, notes and directories. Provide a native desktop directory picker and retain browser path entry.
2. **Claude integration:** launch with the Zyi name through `--name`; display captured conversation ID, config directory and hook health. Preserve normal worker history. Document directory-scoped resume and macOS folder permissions.
3. **Attention reliability:** empty Stop events still create review items; large/Unicode messages fit the hook receiver; idle notifications provide a truthful fallback. Show reported working state even while an older result awaits review. Make priorities readable without relying on color alone.
4. **Terminal restoration:** reattach from the server's current screen and cursor at its original dimensions, then fit the view. Serialize client rendering and reject stale attachment responses. Retain one server-side owner for terminal query responses.
5. **Release:** pass domain, integration, browser and packaged desktop gates; build Windows x64 and macOS arm64/x64 natively; publish installers with checksums only after every target passes.

## Evidence and limits

Regression tests first reproduced lost empty completions, silently dropped large Unicode hook messages, and missing input borders when the drawing commands fell outside raw transcript retention. Tests now exercise the real bridge process, HTTP/WebSocket/PTY transport, screen restoration, browser switching/resizing, saved-folder/template persistence and independent new sessions. No paid inference or real Claude history is used by CI.

The user's installed Claude version and live `/resume` behavior still need verification on that machine. Official CLI naming and persistence contracts are documented in setup; deterministic bridge tests do not establish the cause of every missed event. Edited names sync to Claude on its next launch, not through unsolicited keystrokes into a running prompt. An original plain Shell session must be recreated as a Claude Code session for built-in hooks.

Existing data remains compatible. This preview retains the 0.4 signing limitations and manual upgrade process. Knowledge extraction remains P2.
