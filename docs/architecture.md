# Architecture

Browser (four panels + xterm) → authenticated loopback HTTP/WebSocket → workspace core and process adapter.

`src/core/workspace.ts` owns queue ordering, stable IDs, selection, resolution, snoozing and priority changes. `events.ts` normalizes worker events. `coordinator.ts` interprets a small supported vocabulary and calls the same state operations as buttons. It is command-based in this prototype, not an LLM.

`src/server/store.ts` writes atomic snapshots. `terminals.ts` owns real PTYs, bounded scrollback, resize and exit events. `app.ts` validates API input, authenticates clients, receives hook events, serves assets and broadcasts snapshots. `main.ts` owns startup/shutdown.

The UI renders state; it cannot decide an item is complete merely because someone opened its terminal. IDs and source request IDs keep session routing independent of mutable titles.

## Data
A session has a stable Relay ID, project directory, priority, mode (demo, shell, Claude), process status, and optional Claude conversation ID. An attention item has its own ID, source, kind, summary, priority, state and timestamps. Multiple items can belong to a session. Snapshots live in `.relay/`, excluded from Git. Process handles are never persisted. On restart formerly running sessions become stopped, while pending attention remains.

## Local boundary
Bind to 127.0.0.1 only. A random per-run capability token protects mutations and terminal access. Browser origins/hosts are checked, bodies and terminal buffers are bounded, and static paths cannot escape the asset directory. No cloud backend or remote access is enabled. Run Relay on the same machine as the Claude processes it manages. SSH transport and adoption of arbitrary external terminals are future adapters.

## P2 seam
Managed retirement can enqueue a knowledge extraction job before process closure. That job proposes scoped, reviewable file changes and records provenance. P1 does not implement extraction or auto-approval.

## Windows terminal compatibility

`node-pty` is pinned to 1.2.0-beta.18 because the stable 1.1.0 crashed during concurrent terminal teardown in our Windows browser tests. The beta includes locking around the native process registry (see upstream [concurrency regression coverage](https://github.com/microsoft/node-pty/blob/main/src/windowsTerminal.test.ts)). This is a deliberate prerelease dependency, not a claim of stable upstream support.

Relay selects bundled ConPTY to avoid the legacy asynchronous console-enumeration teardown race. The output worker can still remain alive when no final output chunk arrives. `windows-pty.ts` isolates a private-member compatibility shim that closes the input socket and disposes the output worker after the terminal exit event. No installed dependency files are modified. Subprocess lifecycle tests require natural host exit after normal shell exit, explicit stop, and concurrent teardown of twelve shells. A leaked worker fails with a timeout. Reassess/remove the shim with any dependency upgrade. Native OS behavior and process descendants still require platform validation; the prototype is not a process sandbox.
