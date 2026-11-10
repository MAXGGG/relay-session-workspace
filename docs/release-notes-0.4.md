Relay is now **Zyi** — one attention inbox for your CLI agents.

This desktop preview includes:

- A desktop window with an automatically started, bundled terminal engine. No separate Node installation or launch terminal is required for Zyi itself.
- Close-to-tray/menu-bar operation; reopening returns to the same running agents. Explicit Quit stops managed processes.
- Persistent session records, window/panel preferences, and import of a stopped legacy `.relay` workspace into an empty desktop workspace.
- The existing priority inbox, real Codex/Claude coordinator, agent-independent terminals, sidebar organization and adjustable panels.

Choose `win-x64.exe` for Windows, `mac-arm64.dmg` for Apple Silicon, or `mac-x64.dmg` for Intel Macs. Mac ZIP alternatives and `SHA256SUMS.txt` are included. Install/authenticate your desired agent separately.

**Testing release:** Windows binaries have no publisher certificate; macOS uses ad-hoc signing and is not notarized. First-launch OS warnings are expected. Read [desktop setup and import instructions](https://github.com/MAXGGG/zyi/blob/main/docs/desktop.md). Quit Zyi before upgrading; saved data lives outside the app directory.

Publishing is gated by native Windows/macOS builds, existing automated verification and packaged desktop acceptance. These tests use synthetic workers, not paid inference. Automatic knowledge extraction, cross-machine live-session sharing and automatic app updates are not included.
