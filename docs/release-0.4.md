# Zyi 0.4: desktop preview

Relay is now **Zyi**, inspired by 注意 (attention). The desktop product keeps the original four-panel workflow and agent-independent terminals.

## Milestones and acceptance

1. **Rename.** Update the app, notifications, package metadata, documentation and desktop identity. Keep existing saved data and hook integration compatible.
2. **Desktop runtime.** Launch the UI and authenticated local terminal engine together, without requiring Node/npm installation. Package the engine with a Node 24 runtime and native modules built on the target OS/architecture. Keep the renderer sandboxed and Node-free.
3. **Lifecycle and storage.** Close hides to tray/menu bar; Open returns to the same processes; Quit stops owned processes. A second launch focuses the existing instance. App data, window size and panel preferences survive upgrades/restarts. Import a stopped legacy workspace only into an empty desktop workspace.
4. **Distribution.** Produce a Windows x64 installer and macOS Apple Silicon/Intel DMG/ZIP packages. Verify the actual packaged applications, then publish a GitHub preview release with checksums. Document first-launch signing limitations.

## Validation

- Existing unit, HTTP/WebSocket/PTY, browser and coverage gates remain required.
- Import integration tests preserve IDs, pending work and transcripts, reject a live source/invalid source/occupied destination, and keep the original snapshot intact.
- Desktop acceptance launches the built application, checks renderer isolation, launches a worker through the bundled Node runtime, sends a reviewed reply, closes/reopens the window while the worker lives, quits and verifies process cleanup, then restarts and checks saved sessions and panel sizes across a new local port.
- A second launch must focus the original window and engine. Losing the desktop parent must stop workers and release the workspace lock. Packaged tests copy the app outside the repository to prove its dependencies are self-contained.
- Windows installer acceptance covers installation into a path with spaces, the installed app, reinstall, and uninstall that retains user data.
- `.github/workflows/desktop.yml` runs verification, native packaging and packaged acceptance on Windows x64, macOS arm64 and macOS x64. A tag publishes only after all three succeed. No paid model calls run in these checks.

Local Windows validation passed with Node 24.22.1 and Electron 45.2.3: 20 unit, 29 integration, 15 browser and 2 desktop tests, plus install/reinstall/uninstall acceptance. Core coverage remains 100% lines, 98.41% branches and 97.06% functions. Release CI provides the exact-commit evidence for native packages.

## Scope

This is a testing release. Windows code signing and Apple Developer ID/notarization are not configured; macOS builds use an ad-hoc signature. There is no automatic update service: quit, install the newer release, and reopen. Uninstall retains workspace data. CLI installation/authentication, agent accuracy, Claude live acceptance and P2 knowledge extraction remain separate from desktop packaging. Live sessions cannot move between computers or survive reboot. Persisted records can be resumed using the agent's conversation ID.
