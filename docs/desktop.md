# Zyi desktop

Download the matching installer from [GitHub Releases](https://github.com/MAXGGG/zyi/releases). The app includes its own terminal engine and Node runtime. Git and Node are not prerequisites for installing Zyi; individual agents may have their own requirements.

## Install

- **Windows x64:** run `Zyi-0.4.0-win-x64.exe`, choose the installation directory, then open Zyi from Start or its desktop shortcut. This preview has no publisher certificate; Windows may show an unknown-publisher/SmartScreen prompt. Verify the source and release checksum before proceeding.
- **Mac with Apple Silicon (M1 or newer):** download the `mac-arm64.dmg` file.
- **Intel Mac:** download the `mac-x64.dmg` file.
- **macOS:** open the DMG and drag Zyi into Applications. The preview uses an ad-hoc signature, not Apple Developer ID/notarization. macOS may block the first launch. After verifying the release, use the app-specific **System Settings → Privacy & Security → Open Anyway** option if offered. Do not disable Gatekeeper globally. A ZIP is also provided for each architecture.

Install and authenticate Claude, Codex or your preferred CLI normally. Open Zyi, select **New session**, choose a project folder and session type. Shell sessions work without an AI account. Coordinator requests use your selected CLI's account and allowance. Use **Commands only** for navigation without model calls.

On macOS, Zyi reads your login shell PATH so Homebrew/nvm installations can be found. You can also specify the full agent executable path in the session dialog and coordinator Settings.

## Window and process lifecycle

Closing the window keeps Zyi and its agents running. Use the tray icon (Windows) or menu-bar icon (Mac), or launch Zyi again, to bring it back. **Zyi → Quit Zyi (stop sessions)** or Ctrl/Cmd+Q stops managed terminals and saves their records. On the next launch, records are stopped until explicitly started; this does not preserve arbitrary process memory. Keep the computer awake for ongoing work.

## Storage, import and upgrades

Zyi's **Open data folder** menu shows the authoritative workspace location:

- Windows: `%APPDATA%\Zyi\workspace`
- macOS: `~/Library/Application Support/Zyi/workspace`

This is outside the installation directory. Panel sizes and notification preferences are stored beside it in `preferences.json`; window size is in `window.json`. Managed sessions, queue, task notes and output remain local. CLI/model requests follow the provider's normal data handling.

To import the old browser version:

1. Stop the old Relay/Zyi server so its workspace lock is released. Back up its `.relay` directory.
2. Start Zyi desktop with an empty workspace. Select **Zyi → Import saved workspace…** and choose that `.relay` directory, which contains `workspace.json`.
3. Confirm the import. Sessions, queue, notes and retained output are copied. The original directory is kept. Browser layout/preferences and live processes are not transferred.
4. Check the imported project paths, then Start the session you need. If moving data from another machine, edit paths and executable settings first. Agent conversation history must also exist on the target machine for its resume command to work.

For an upgrade, **Quit Zyi**, back up the workspace, then run the new installer or replace the Mac application. Reopen Zyi. No automatic updater is included in this preview. Uninstalling/removing the app keeps user data; delete it separately only when you intend to erase saved work.

Source-based use remains supported with `npm start`. It retains `.relay` as the default data directory and the existing `RELAY_*` hook variables for compatibility. `ZYI_PORT`, `ZYI_DATA_DIR`, and `ZYI_DEMO` are also supported for source startup. Desktop uses an available loopback port and its own user-data directory. It does not discover or adopt another server's live terminals.

## Development and release

Use **Node 24** on the target OS/architecture, then:

```sh
npm ci
npm run setup:browser
npm run verify
npm run desktop
```

`npm run build:desktop` compiles TypeScript, copies only production engine dependencies, bundles the current Node 24 executable and its license, and prepares the Electron app. It intentionally uses a separate Node process so native PTY modules and Claude hooks keep ordinary Node behavior. Build output is ignored in `build/`.

```sh
npm run package:desktop -- --win --x64
# On an Apple Silicon Mac:
npm run package:desktop -- --mac --arm64
# On an Intel Mac:
npm run package:desktop -- --mac --x64
```

Packages appear in `release/`. Build natively on each target: copying a Windows runtime/native dependency tree into a Mac package will not work. No development tools, `.relay`, tokens, transcripts, tests or `.tooling` files are included.

Run `npm run test:desktop` after a build to test the development bundle. To test an installed/packaged app, set `ZYI_DESKTOP_EXECUTABLE` to its executable before running that command. Tests use a temporary user-data directory and synthetic workers; they do not read your real workspace or invoke a model. `ZYI_USER_DATA_DIR` can also select a separate desktop profile for manual testing.

The desktop workflow builds and tests Windows x64 and both Mac architectures on every main-branch change. A `v*` tag additionally publishes a preview release only when every package passes. Existing browser CI remains on Windows and Ubuntu. Icons are committed; only regenerating them requires Pillow and `python scripts/generate-icons.py`.

Architecture references: [Electron security](https://www.electronjs.org/docs/latest/tutorial/security), [application lifecycle](https://www.electronjs.org/docs/latest/api/app), [electron-builder packaging](https://www.electron.build/v26/docs/configuration/).
