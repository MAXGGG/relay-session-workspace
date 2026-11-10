# Architecture

Browser (four panels + xterm) → authenticated loopback HTTP/WebSocket → workspace core and process adapter.

## Desktop host (0.4)

`desktop/main.ts` owns the Electron window, tray/menu bar, single-instance lock, import dialog and application lifecycle. It starts `desktop/server.ts` in a bundled ordinary Node 24 process using `desktop/host.ts`. The same server, native PTY modules and hook commands run in source and desktop modes; native dependencies are not loaded into Electron. Compiled code and production dependencies live in `resources/backend`, the Node executable and its license in `resources/runtime`. Builds run on each target OS/architecture and retain only that target's PTY prebuilds.

Close hides the window; Quit requests engine shutdown and waits for owned processes to stop. The engine also shuts down when its parent IPC channel disconnects. Crash recovery preserves records and pending work without claiming processes survived. Data is outside the installed app. Legacy import locks both workspaces, validates the source, refuses an occupied destination, copies bounded transcripts, and publishes the snapshot last. It never imports a live process handle or changes agent-owned history.

The renderer is sandboxed, with context isolation and no Node integration. Navigation and new windows cannot leave the owned loopback origin. The preload exposes only two bounded preference keys; the main process validates sender and origin. Persisting those preferences outside browser localStorage keeps panel sizes across the engine's random ports. Terminal access continues to use the per-run capability token. The desktop app remains a single-user tool with the same OS authority as its owner.

`src/core/workspace.ts` owns queue ordering, stable IDs, selection, resolution, snoozing, priority, archive, and retirement policy. `events.ts` normalizes Claude hooks. `attention.ts` handles generic events and explicit quiet-output suggestions. `coordinator.ts` interprets a supported vocabulary and prepares reply drafts. It never executes terminal text itself.

Version 0.3 adds `session-status.ts` for display states derived from live processes and attention. A running idle CLI is blue Running, not a grey stopped record. Sidebar groups/pins and array ordering persist in the workspace. Manual archive can retain pending items; automatic retirement still requires no pending work. Explicit deletion removes one stopped session and its dependent records/output after a matching-name confirmation. Project files and agent-owned history are outside that operation.

`public/layout.js` implements accessible pointer/keyboard splitters, bounded sizing and per-browser persistence. Grid changes resize xterm through the existing ResizeObserver.

`src/server/store.ts` validates and atomically writes snapshots plus a previous-version backup. `lock.ts` prevents multiple servers writing one workspace. `profiles.ts` constructs executable/argument launch profiles. `terminals.ts` owns PTYs, server-side xterm emulation, resize and exit events. `transcripts.ts` persists bounded raw output. `delivery.ts` binds reviewed user input to a process generation and maintains write-ahead receipts. `app.ts` validates HTTP/WebSocket input, authenticates clients, receives events, serves assets and broadcasts snapshots. `main.ts` owns startup/shutdown.

The UI renders state; it cannot decide an item is complete merely because someone opened its terminal. IDs and source request IDs keep session routing independent of mutable titles.

Each transmitted snapshot has a per-server instance ID and increasing revision. The browser ignores older revisions for the same instance so a delayed HTTP reply cannot overwrite a newer WebSocket update. The regression reproduces a stale Running/Stopping display after a real process exits.

## Data
A session has a stable Zyi ID, project directory, priority, profile (demo, shell, Claude, Codex, custom), status, notes, optional conversation ID and resume arguments. Attention has its own ID, provenance, confidence, kind, priority, state, and timestamps. Multiple items can belong to one session. Snapshot version 1 remains compatible with 0.1; new fields are optional. Process handles are never persisted. Recovery marks real sessions stopped and incomplete deliveries uncertain. Pending items remain.

## Local boundary
Bind to 127.0.0.1 only. A random per-run capability token protects state and terminal access. Browser origins/hosts are checked, bodies and buffers are bounded, and assets are allowlisted. Run Zyi alongside its processes; an external SSH tunnel may forward the same loopback port. Managed workers inherit bridge credentials and share the OS user's authority. This is not a multi-user sandbox or a boundary against a malicious local worker.

## Terminal protocol and delivery

Each live PTY has a random run ID and a headless xterm instance. Device/cursor queries are answered once on the server, even with no UI attached. Browser xterm suppresses responses to replayed queries. Input is disabled while switching until the selected terminal acknowledges attachment. Live output includes the run ID, preventing late data from an old process entering a new view.

Managed Codex launches include `--no-daemon` so a shared background service does not own the interactive session. Coordinator-created tasks pass their initial prompt as an argument after `--`; the launch timestamp prevents automatically resubmitting it on later starts. This does not discover an agent's conversation ID or turn a new conversation into a resumed one.

`POST /api/reply` accepts a client-generated delivery ID, session ID, current run ID, text, and optional attention-item ID. Repeating the same ID returns its receipt; changing its payload is rejected. Approvals selected from the queue must be handled in the terminal. A pending receipt is persisted before input is written. A crash leaves an uncertain receipt rather than automatically resending. Only the last 500 receipts are retained; deduplication is bounded to those retained IDs.

Claude/Codex replies use bracketed paste followed by a separate Enter after a short input-settling interval. The process generation is checked again before Enter. Generic line-oriented CLIs receive literal text and Enter. A sent receipt means PTY submission, not a semantic acknowledgment by the agent. Serializing replies to a terminal prevents concurrent paste operations from interleaving.

Explicit Stop on Unix sends SIGHUP, then SIGKILL after two seconds if that same process record remains. This handles agents that ignore hangup and shells that remain alive during resize/stop races. Exit clears the timer; it cannot target a replacement session process. Windows uses the native PTY termination path.

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

## Agent coordinator (0.3)

`POST /api/chat` records a user request with a stable ID before inference. `coordinator-agent.ts` runs Codex exec or Claude print using stdin, bounded output, cancellation and a three-minute timeout. It uses a fresh scratch working directory outside the project, separate temporary result files, and existing provider authentication. Codex ignores user configuration/rules and repository instructions, disables shell tools/plugins/multi-agent tools, and uses an ephemeral read-only run. Claude uses safe mode, no built-in tools and strict MCP configuration. CLI-managed account policy still applies. This is a configuration boundary, not a sandbox against a malicious installed executable.

The model receives session metadata, notes capped at 1,500 characters per session, up to 60 unresolved attention summaries, and the last 20 coordinator messages. It returns a structured plan with up to three typed actions. It cannot specify a shell command, arbitrary executable, or permanent deletion. Create actions use a known project or an absolute directory supplied in coordinator conversation, and an installed/configured Codex or Claude worker. The UI reports actual execution results; partial success is explicitly retained if a later action fails. Replies remain reviewed drafts. A request interrupted by cancellation/restart is not automatically replayed. The last 100 request IDs are retained for duplicate suppression.

`POST /api/command` remains deterministic for quick actions and Commands only mode. Tests inject a deterministic planner and also exercise actual subprocess transports without paid inference. `smoke:coordinator` is a separate real-model acceptance path. Provider flags follow [Codex non-interactive documentation](https://learn.chatgpt.com/docs/non-interactive-mode) and [Claude CLI reference](https://code.claude.com/docs/en/cli-reference); adapters require current CLIs and do not silently bypass unsupported flags.

## Windows terminal compatibility

`node-pty` is pinned to 1.2.0-beta.18 because the stable 1.1.0 crashed during concurrent terminal teardown in our Windows browser tests. The beta includes locking around the native process registry (see upstream [concurrency regression coverage](https://github.com/microsoft/node-pty/blob/main/src/windowsTerminal.test.ts)). This is a deliberate prerelease dependency, not a claim of stable upstream support.

Zyi selects bundled ConPTY to avoid the legacy asynchronous console-enumeration teardown race. The output worker can still remain alive when no final output chunk arrives. `windows-pty.ts` isolates a private-member compatibility shim that closes the input socket and disposes the output worker after the terminal exit event. No installed dependency files are modified. Subprocess lifecycle tests require natural host exit after normal shell exit, explicit stop, and concurrent teardown of twelve shells across five independent hosts. A leaked worker fails with a timeout. Reassess/remove the shim with any dependency upgrade. Native OS behavior and process descendants still require platform validation; Zyi is not a process sandbox.
