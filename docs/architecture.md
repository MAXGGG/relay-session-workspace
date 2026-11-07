# Architecture

Browser (four panels + xterm) → authenticated loopback HTTP/WebSocket → workspace core and process adapter.

`src/core/workspace.ts` owns queue ordering, stable IDs, selection, resolution, snoozing, priority, archive, and retirement policy. `events.ts` normalizes Claude hooks. `attention.ts` handles generic events and explicit quiet-output suggestions. `coordinator.ts` interprets a supported vocabulary and prepares reply drafts. It never executes terminal text itself.

`src/server/store.ts` validates and atomically writes snapshots plus a previous-version backup. `lock.ts` prevents multiple servers writing one workspace. `profiles.ts` constructs executable/argument launch profiles. `terminals.ts` owns PTYs, server-side xterm emulation, resize and exit events. `transcripts.ts` persists bounded raw output. `delivery.ts` binds reviewed user input to a process generation and maintains write-ahead receipts. `app.ts` validates HTTP/WebSocket input, authenticates clients, receives events, serves assets and broadcasts snapshots. `main.ts` owns startup/shutdown.

The UI renders state; it cannot decide an item is complete merely because someone opened its terminal. IDs and source request IDs keep session routing independent of mutable titles.

## Data
A session has a stable Relay ID, project directory, priority, profile (demo, shell, Claude, Codex, custom), status, notes, optional conversation ID and resume arguments. Attention has its own ID, provenance, confidence, kind, priority, state, and timestamps. Multiple items can belong to one session. Snapshot version 1 remains compatible with 0.1; new fields are optional. Process handles are never persisted. Recovery marks real sessions stopped and incomplete deliveries uncertain. Pending items remain.

## Local boundary
Bind to 127.0.0.1 only. A random per-run capability token protects state and terminal access. Browser origins/hosts are checked, bodies and buffers are bounded, and assets are allowlisted. Run Relay alongside its processes; an external SSH tunnel may forward the same loopback port. Managed workers inherit bridge credentials and share the OS user's authority. This is not a multi-user sandbox or a boundary against a malicious local worker.

## Terminal protocol and delivery

Each live PTY has a random run ID and a headless xterm instance. Device/cursor queries are answered once on the server, even with no UI attached. Browser xterm suppresses responses to replayed queries. Input is disabled while switching until the selected terminal acknowledges attachment. Live output includes the run ID, preventing late data from an old process entering a new view.

`POST /api/reply` accepts a client-generated delivery ID, session ID, current run ID, text, and optional attention-item ID. Repeating the same ID returns its receipt; changing its payload is rejected. Approvals selected from the queue must be handled in the terminal. A pending receipt is persisted before input is written. A crash leaves an uncertain receipt rather than automatically resending. Only the last 500 receipts are retained; deduplication is bounded to those retained IDs.

Claude/Codex replies use bracketed paste followed by a separate Enter after a short input-settling interval. The process generation is checked again before Enter. Generic line-oriented CLIs receive literal text and Enter. A sent receipt means PTY submission, not a semantic acknowledgment by the agent. Serializing replies to a terminal prevents concurrent paste operations from interleaving.

## Generic event contract

`POST /api/events`, authenticated with the per-run bearer token:

```json
{
  "sessionId": "session-…",
  "runId": "current-process-run-id",
  "event": {
    "eventId": "unique-event-id",
    "type": "question",
    "text": "Which region?",
    "conversationId": "optional-agent-conversation-id"
  }
}
```

Types are working, question, approval, review, error, idle. Event identity is scoped to the session. Working events retire prior generic question/approval/activity items but do not accept review results. Unknown or replaced run IDs are refused. The bridge's documented environment variables are the supported integration surface; inference from arbitrary terminal text stays explicitly uncertain.

Quiet mode records recent printable activity and enqueues one suggested activity item after a configured interval. It does not repeat unchanged output, supersede outstanding real requests, or wake snoozed items early. A manual classification turns a suggestion into a user-owned item that later output does not silently resolve.

## P2 seam
Automatic retirement in 0.2 archives only already-stopped sessions with no unresolved items. Future managed retirement can enqueue knowledge extraction before process closure. That job must propose scoped, reviewable changes and retain provenance. It is not implemented in 0.2.

## Windows terminal compatibility

`node-pty` is pinned to 1.2.0-beta.18 because the stable 1.1.0 crashed during concurrent terminal teardown in our Windows browser tests. The beta includes locking around the native process registry (see upstream [concurrency regression coverage](https://github.com/microsoft/node-pty/blob/main/src/windowsTerminal.test.ts)). This is a deliberate prerelease dependency, not a claim of stable upstream support.

Relay selects bundled ConPTY to avoid the legacy asynchronous console-enumeration teardown race. The output worker can still remain alive when no final output chunk arrives. `windows-pty.ts` isolates a private-member compatibility shim that closes the input socket and disposes the output worker after the terminal exit event. No installed dependency files are modified. Subprocess lifecycle tests require natural host exit after normal shell exit, explicit stop, and concurrent teardown of twelve shells. A leaked worker fails with a timeout. Reassess/remove the shim with any dependency upgrade. Native OS behavior and process descendants still require platform validation; the prototype is not a process sandbox.
