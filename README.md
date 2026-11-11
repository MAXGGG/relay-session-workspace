# Zyi

**One attention inbox for your CLI sessions.** Run Claude Code, Codex, a shell, or another interactive CLI. See what needs a decision, handle it, and move to the next item without hunting through terminal windows.

Zyi is a local application with four areas: sessions, a priority queue, an agent-backed coordinator, and the selected session's original terminal. Session management and quick actions run locally. Coordinator agent requests and workers use their respective CLI accounts and usage allowances; Zyi has no separate service fee.

**Release: 0.5.3 desktop preview.** Claude follow-ups now move earlier response entries to Handled, avoiding accumulated review cards. Includes saved folders/templates, working/priority indicators and terminal screen restoration. Formerly Relay, now **Zyi**, inspired by 注意 (attention). Automatic project-memory/skill extraction remains planned separately. See [0.5 goals and acceptance](docs/release-0.5.md) and [validation details](docs/testing.md).

## Develop and maintain Zyi

Start with the [feature catalogue](docs/features.md) for current capabilities and limitations, the [roadmap](docs/roadmap.md) for planned work, and [CONTRIBUTING.md](CONTRIBUTING.md) for the PR process. [Maintenance](docs/maintenance.md) defines ownership and compatibility; the [release runbook](docs/releases.md) covers validation and recovery. See [CHANGELOG.md](CHANGELOG.md) and [SECURITY.md](SECURITY.md) for changes and private vulnerability reporting.

Required PR gates cover intake, repository/workflow policy, Windows/Ubuntu verification, security scans, and native Windows/Mac packaged acceptance. This engineering foundation does not remove the preview's signing and live-agent validation limitations.

## Desktop installation

Download the matching package from [GitHub Releases](https://github.com/MAXGGG/zyi/releases):

| Computer | Download |
| --- | --- |
| Windows x64 | `Zyi-0.5.3-win-x64.exe` installer |
| Mac with Apple Silicon (M1 or newer) | `Zyi-0.5.3-mac-arm64.dmg` |
| Intel Mac | `Zyi-0.5.3-mac-x64.dmg` |

Install and open **Zyi**. Zyi includes its own Node runtime; install and authenticate your desired agent separately. Windows builds are unsigned and macOS builds are ad-hoc signed, not notarized, so this preview may trigger first-launch OS warnings. Read the [full desktop setup guide](docs/desktop.md) for installation, importing existing sessions, storage locations, upgrades and troubleshooting.

Closing the window keeps agents running in the tray/menu bar. **Quit Zyi** stops managed processes. The desktop app stores its workspace outside the installation directory. Use **Zyi → Import saved workspace…** to copy a stopped legacy `.relay` workspace into an empty desktop workspace.

**macOS folder access:** projects under Documents, Desktop, Downloads or other protected locations may require permission for **Zyi**, even if Terminal already has access. Check **System Settings → Privacy & Security → Files & Folders**. If necessary, add `/Applications/Zyi.app` to **Full Disk Access**, enable it, then fully Quit and reopen Zyi. Full Disk Access is broader than a folder permission; it is not required for every project. See [setup and troubleshooting](docs/desktop.md#macos-project-folder-access).

## What works

- Saved launch profiles for **Claude, Codex, Shell, and Custom CLI**; executable paths and argument arrays.
- Reusable templates, saved folders assigned to groups, recent folders, and a native desktop folder picker. Each new session remains independent.
- Original interactive PTYs, terminal resize, browser reconnect, and bounded output replay after server restart.
- Separate **questions, approvals, results, errors, and uncertain activity suggestions**.
- User-controlled P1/P2/P3 priority, oldest first within a priority; defer, bring back, classify, resolve, reopen.
- `next task`, session/task lookup, queue summaries, priority commands, and reviewed reply drafts.
- Replies bound to an explicit session and process instance. A retried request does not resend the same prompt.
- Search names, project paths, IDs and notes; rename; archive/restore; optional retirement of inactive stopped sessions.
- Optional browser notifications when the page is hidden, and a queue count in the tab title.
- Atomic workspace snapshots, a previous-snapshot backup, exclusive data-directory ownership, and guarded recovery.
- Sidebar actions to rename, group, pin, reorder, stop/archive, restore, or delete one stopped saved session.
- Natural-language coordinator requests to find sessions, clarify a task, and create a worker with its initial task.
- Draggable/keyboard-accessible panel dividers, with saved sizes and a reset option.

## Run from source on the computer hosting your agents

Zyi manages processes it launches **on the same machine and OS environment**. If your agents run in WSL, install Node and Zyi in that WSL distribution. If they run on a server, use the SSH instructions below.

Prerequisites:

1. **Node.js 24+ and npm**, from [Node.js](https://nodejs.org/en/download).
2. **Git**, from [git-scm.com](https://git-scm.com/downloads).
3. A current browser. Playwright is needed only for development tests.
4. Your desired CLI, installed and authenticated normally. For example, check `codex --version` and `codex login status`, or `claude --version` and `claude auth status --text`.

Use a current CLI version. The Codex coordinator requires `exec --ignore-user-config --ignore-rules --ephemeral --output-schema`; managed Codex terminals require `--no-daemon`. Claude coordinator mode requires `--safe-mode`, `--tools`, and JSON print output. Older CLIs may need updating; Commands only remains available without inference.

```sh
git clone https://github.com/MAXGGG/zyi.git zyi
cd zyi
npm ci
npm start
```

These commands work in PowerShell, Command Prompt, Bash, and Zsh. Run them in the folder containing `package.json`. Install dependencies on each machine; do not copy `node_modules` between platforms.

Open the **complete URL printed by your server**, including its token:

```text
Zyi is ready: http://127.0.0.1:8123/#token=...
```

The token grants access to your terminals. Keep the launch link private. Each server start generates a new token; use its new link after a server restart. Your queue and session records persist.

The first normal launch is empty. Click **New session** to begin. Keep the server running. Closing the browser leaves agents running; stopping the server stops its managed processes.

### Try a separate demo first

Sample workers are visibly simulated and make no AI calls. Quick-action buttons also use no model. To keep typed coordinator messages offline, select **Settings → Coordinator agent → Commands only**. Use a separate data directory so the demo does not alter your real workspace.

PowerShell:

```powershell
$env:RELAY_DATA_DIR = Join-Path $PWD '.relay/demo'
$env:RELAY_PORT = '8124'
npm run demo
```

After stopping the demo, return to your normal workspace:

```powershell
Remove-Item Env:RELAY_DATA_DIR, Env:RELAY_PORT -ErrorAction SilentlyContinue
npm start
```

Bash/Zsh:

```sh
RELAY_DATA_DIR=.relay/demo RELAY_PORT=8124 npm run demo
```

Click **Next task**, answer the sample question in its terminal, then mark the resulting review handled. Try changing priorities, `defer 1`, and refreshing the browser. Demo seeding happens only when that data directory has no saved workspace.

## Start three real sessions

1. Click **New session**, choose **Codex CLI**, name it `API fix`, and enter the absolute path to its project. Set P1.
2. Create a Claude or custom CLI session named `Documentation`, in its own project or checkout. Set P2.
3. Create another session named `Investigation`, set P3, and give it a separate task.
4. Work in the original terminal as usual. Use `next task` to open queued attention and **Reply…** to compose a message to a fixed, visible target.
5. Mark an item handled when you have dealt with it, or defer it. Opening it does not resolve it. Submitting a Claude follow-up through Zyi with connected hooks moves earlier automatic response entries to Handled. This acknowledges the response; it does not approve permissions or certify the work.

Zyi does not create isolated Git worktrees for you. Concurrent agents editing the same repository should use separate worktrees/directories when their changes could interfere.

### Launch settings

For your usual Claude permission preference, select **Claude Code** and check **Skip Claude permission prompts**. Save the settings as a template to reuse the choice. This adds `--dangerously-skip-permissions` to the saved launch arguments; the checkbox is off by default and reflects existing profiles that already contain that flag. Editing a running profile applies to its next launch.

Advanced argument fields accept JSON arrays of strings, such as `["--model", "opus"]`. Leave **Custom resume arguments** empty or `[]` unless you are configuring a custom CLI's resume command. If validation fails, Zyi names and focuses the offending field. Replace the entire field contents when pasting an array; do not append it to the existing `[]`. Use straight double quotes and commas only between entries.

The creation dialog separates **Create from template**, **Project folder**, and collapsed **Advanced settings**. Expand **Group and folder defaults**, enter a group name and directory, then click **Save group folder**. The group's **＋** button starts a new session in that folder. Editing the saved folder changes future launches only; existing workers keep their directory. **Forget saved folder** removes the shortcut without deleting files or sessions.

Configure an agent once, expand **Save these settings as a template**, and save a name. The template retains mode, priority, executable, arguments, resume-argument pattern and attention settings. It excludes the actual conversation ID, session name, folder and notes. Select it under **Create from template** next time. You can update or delete the selected template without changing existing sessions.

| Profile | Launch and recovery |
| --- | --- |
| Shell | Your system shell. You can run any installed CLI inside it. Restarting returns to a fresh shell. |
| Codex CLI | Detects `codex`; uses `--no-daemon --no-alt-screen` so Zyi owns the process. An explicit saved conversation ID/name adds `resume <id>`. |
| Claude Code | Detects `claude`; adds local hooks and `--name <session-name>`. A captured or provided conversation ID adds `--resume <id>`. Requires a current CLI with `--name` support. Global Claude settings are unchanged. |
| Custom CLI | Your executable with the arguments you specify. Optional custom resume arguments replace initial arguments when a conversation ID is set. |

Use **Executable** if auto-detection fails. Enter only the executable path there; put options in **Arguments**, as a JSON array. Example: `["--model", "your-model"]`. A Node worker could use executable `node` and arguments `["/absolute/path/worker.js"]`. Paths with spaces remain single arguments. Windows npm `.cmd` and `.bat` shims are supported with quoted arguments; arguments containing embedded double quotes or `%` require the native executable and are rejected for shims.

Custom resume example: `["resume", "{conversationId}"]`. Zyi substitutes the saved ID into each argument. **Edit** updates names/notes immediately; launch changes take effect on the next start.

## How attention detection works

For Claude, select **Claude Code** as the session type. Typing `claude` inside a plain Shell does not install Zyi's hooks. The terminal's expandable **Claude hooks** indicator shows the last signal received and resume information. **Working** pulses while a turn is reported in progress; **Needs attention** and the queue count indicate a pending decision. A submitted terminal or Reply-dialog follow-up acknowledges earlier response cards when the same process reports its prompt event. Background events, unsent typing and viewing alone keep results pending. Errors, approvals and manually classified items still need explicit handling. High/Normal/Low badges and colored card edges make priority visible.

| Mode | What it knows | Good default |
| --- | --- | --- |
| Structured events | The worker explicitly reports a question, approval, result, error, working, or idle state. | Claude hooks and CLIs wired to the bridge. |
| Quiet suggestions | Output stopped for a configured interval. The worker may still be busy. | Codex and unfamiliar interactive CLIs. |
| Manual / exit only | You add items yourself; nonzero process exits produce errors. | Ordinary shells or noisy processes. |

Quiet mode defaults to 15 seconds and produces **Check activity**, not a claim that the task finished. Change the interval or turn it off in **Edit**. It does not repeatedly enqueue unchanged output, and deferred work stays deferred.

Claude hooks identify explicit permission and question-tool events. Classification of a plain-language final response is still a suggestion; you can correct it using **Classify as**. A completed response is not proof the entire project is done. Review approvals in the original terminal; Zyi never answers or grants them autonomously.

### Agent-independent event bridge

Every managed process inherits `RELAY_SESSION_ID`, `RELAY_RUN_ID`, `RELAY_EVENT_URL`, and `RELAY_TOKEN`. Integrate a CLI's hooks or a task script with:

```sh
node /absolute/path/to/zyi/scripts/relay-event.mjs working
node /absolute/path/to/zyi/scripts/relay-event.mjs question "Which region should I use?"
node /absolute/path/to/zyi/scripts/relay-event.mjs review "Implementation is ready for review."
```

Supported events: `working`, `question`, `approval`, `review`, `error`, `idle`. The HTTP contract is documented in [architecture](docs/architecture.md). Unknown or stale process IDs are rejected. Worker output is displayed as data and never interpreted as coordinator commands.

## Your coordinator agent

Zyi automatically chooses installed Codex, then Claude. Click the coordinator's provider button or **Settings** to choose the provider, optional model/executable, default project directory, and preferred worker agent. Sign in to the chosen CLI normally first. No extra API key is needed when that CLI already supports your account login.

Try:

- “Open the session investigating payment retries.”
- “Create a Codex session to investigate the failing login tests in `C:\projects\my-app`, priority P1.”
- “Put the documentation task in the Client A group and pin it.”
- “Which task needs my attention next?”
- “Draft a reply to the login investigation: focus on expired tokens.”

The coordinator receives session metadata, notes, queue summaries, and recent coordinator messages. It can ask follow-up questions, select existing sessions by meaning, and start a requested Claude/Codex worker with the task as its initial prompt. If the project is unknown, supply its existing absolute directory or configure a default. It does not invent folders or execute generated shell commands. Login/trust prompts still belong to the worker's original terminal.

The conversation is saved across browser/server restarts. Each inference receives the last 20 coordinator messages plus current workspace context; this is bounded context, not unlimited memory. Agent mode runs only when you send a chat request. Use **Cancel request** to stop an in-progress coordinator call. Actions already completed remain visible in its result. The server validates actions, refuses arbitrary executables/commands, and reports actual execution outcomes. Replies to existing workers are drafts for your review, and permission approvals remain in the terminal.

The Codex planner uses ephemeral, read-only inference with shell tools, plugins, multi-agent tools, and user/project configuration disabled for that invocation. Claude uses safe mode with built-in tools disabled. These settings apply to the coordinator; coding workers keep their normal CLI configuration. Model choice can be set separately in Settings.

Live coordinator navigation, worker creation, task delivery, and an actual worker response were verified with Codex on Windows. Claude's adapter is tested with a deterministic CLI fixture; real Claude acceptance is still needed on a Claude-equipped machine.

### Quick actions and commands-only mode

Quick-action buttons always use deterministic local commands. With **Commands only** selected, the chat accepts this vocabulary without model calls:

| Command | Effect |
| --- | --- |
| `next task` | Opens the next pending item by priority/age; skips the currently selected item if another exists. |
| `open API fix` | Finds a session by name/project or exact session ID. Ambiguous matches ask you to be specific. |
| `open task-…` | Opens an exact attention-item ID. |
| `status` | Summarizes pending attention. |
| `make API fix P1` | Updates that session and its unresolved items. |
| `defer 30` | Snoozes the selected item for 30 minutes. |
| `reviewed` or `done` | Marks the selected item handled. |
| `reply to API fix: Use option B` | Opens a reply draft. Review its target and click **Send to terminal**. |

The reply dialog keeps its original target even if the selected session changes. If that process was restarted, sending is refused until you open a fresh draft. A delivery receipt means input was written to the PTY; check the agent's output to confirm it accepted the message. Unsupported commands do not execute shell instructions.

## Keep work without keeping windows open

- Click **⋯** on a sidebar session for actions. Rename/edit lets you assign a group; pin keeps important sessions at the top. Drag a session above another to reorder it and adopt its group/pin section. Move up/down provides a keyboard-friendly alternative. Ordering, groups and pins persist.
- Add goal/findings/next-step notes in **Edit**. Search includes notes and project paths.
- **Save output** downloads the retained terminal output; each session retains up to 250,000 characters, including terminal escape sequences.
- Stop a session when appropriate. Its launch profile, notes, output and pending attention remain.
- **Stop & archive** stops a running session and hides its record. **Archive session** hides an already-stopped session. Manual archiving keeps pending/deferred attention in the queue. **Show archived sessions** lets you find and restore saved sessions.
- **Delete saved session…** is available after the process stops. Its confirmation names the session and unresolved-item count. It removes that session's Zyi record, notes, attention, delivery receipts, and retained output; project files and the agent's own conversation history remain. Zyi's previous-snapshot backup and coordinator chat may still contain earlier references.
- **Settings** can archive inactive, stopped sessions after 1–365 days. Zero disables it. It does not interrupt running processes or discard pending items.

Zyi cannot adopt arbitrary already-open terminal windows. Move existing work by supplying the agent's saved conversation ID/name in a new managed session. Shell state and unsaved process memory cannot be restored by reopening a transcript. Automatic knowledge extraction into `CLAUDE.md`, `AGENTS.md`, and skills is not included in 0.3.

## Status and panel sizes

Blue **Running** means the process is alive; green **Active/Working** means output activity or an explicit working event; amber **Needs attention** means a queued item; purple **Stopping** means shutdown is in progress; grey **Stopped** means no live process; red **Error** means a failure. Hover a dot for its explanation. A running process is not proof that an agent is thinking, and silence is not proof of completion.

Drag the dividers beside the session list and attention queue, or between the coordinator and terminal. Focus a divider and use arrow keys (Shift for larger steps); Home or double-click resets that divider. **Settings → Reset panel sizes** resets all. Sizes persist in this browser. Narrow screens stack panels and hide the vertical dividers.

## Remote server setup

Install Zyi alongside the agents on the server. Start it there, then forward its port:

```sh
ssh -N -L 8123:127.0.0.1:8123 your-user@your-server
```

Open the server's printed launch link in your local browser, using the same forwarded port. If the port is occupied, set `RELAY_PORT` on the server and forward that same port. Zyi deliberately binds to `127.0.0.1`; do not expose it publicly. SSH handles remote access. Zyi is not a remote SSH-session discovery tool.

## Storage, upgrades, and recovery

For source startup, default state still lives in `.relay/`, excluded from Git, so upgrades find existing sessions. `ZYI_DATA_DIR` selects another directory; `ZYI_PORT` selects the port. Legacy `RELAY_DATA_DIR`, `RELAY_PORT` and hook variables remain compatible. Desktop storage is described in [the desktop guide](docs/desktop.md).

- `workspace.json`: session records, attention, notes, coordinator messages and delivery receipts.
- `workspace.json.bak`: previous snapshot, replaced on each successful save.
- `terminals/`: bounded terminal output, flushed approximately every second and on orderly shutdown.
- `workspace.lock`: exclusive server ownership; a dead owner's lock is recovered automatically.
- `runtime.json`: current local URL and server PID. Treat it as private.
- `claude-hooks.json`: generated hooks used only by managed Claude sessions.

Output and notes can contain sensitive project material. Storage is local plaintext, not encrypted. All managed processes run as your OS user, with the same capabilities as launching them yourself. Zyi is not a sandbox or multi-user security boundary.

Before upgrading, stop Zyi and back up the data directory. Then:

```sh
git pull --ff-only
npm ci
npm start
```

Version 0.3 reads 0.1/0.2 workspace files. Formerly running processes become stopped records on startup, while unresolved attention survives. Interrupted coordinator requests are recorded as failed and never automatically replayed. A corrupt snapshot causes startup to stop without replacing the original. Preserve that file, inspect the backup, and restore a valid copy while the server is stopped. A crash may lose the final second of terminal output; it does not imply the agent's underlying conversation store was lost.

## Development and testing

```sh
npm ci
npm run setup:browser
npm run verify
```

On Linux development machines needing browser system packages:

```sh
npm run setup:browser -- --with-deps
```

`verify` runs type/syntax/lint checks, unit tests, real HTTP/WebSocket/PTY integration tests, domain coverage gates, and Chromium browser acceptance. It requires no agent login or paid inference. CI runs it on Windows and Ubuntu. See [testing](docs/testing.md) for exactly what is covered and what remains unverified.

An **optional live Codex check** uses your installed CLI/account and two small model turns:

```sh
npm run smoke:codex
```

Complete Codex login and initial repository trust first. Alternatively, after reviewing this repository, `npm run smoke:codex -- --trust-project` allows that check to accept Codex's initial trust prompt for this repository. It runs with a read-only sandbox, asks for fixed responses without tool use, tests a reply through Zyi's UI, and saves a screenshot/log under ignored `test-artifacts/`. It is excluded from CI and normal verification.

`npm run smoke:coordinator` is another opt-in live check. It makes two coordinator requests and starts one real Codex worker with a fixed-response task. It verifies semantic session lookup, creation, initial-task delivery and the worker's response, saving `test-artifacts/coordinator-live.png` and `.log`. It requires the Zyi repository to be trusted already. This worker uses normal CLI configuration and is instructed to use no tools or modify files. Neither live check runs in CI.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Node/npm not found | Install Node 24+, then open a new terminal. |
| Native terminal dependency fails to install | Use Node 24 and a supported architecture. Source builds may need Python and C++ tools; see [node-pty dependencies](https://github.com/microsoft/node-pty#dependencies). |
| Port already in use | Use the existing instance, or choose another `RELAY_PORT` **and data directory** for a separate workspace. |
| Workspace already open | Use its current launch link. A second server cannot safely write the same workspace. |
| Launch link required / reconnecting after restart | Open the new complete URL printed by the current server. |
| Executable not found | Verify the CLI in the server's terminal, restart Zyi after PATH changes, or enter its full executable path. |
| Agent is asking for login/trust | Complete that agent's setup in its original terminal. Zyi does not bypass agent permissions. |
| Too many quiet suggestions | Increase the quiet interval, use manual mode, or wire structured events. |
| Start opens a new conversation | Supply an explicit conversation ID or custom resume template; a retained transcript alone is not agent memory. |
| Reply says terminal changed | Close the draft, open the current session and prepare a new one. This prevents delivery into a replacement process. |
| Coordinator only understands commands | Select Codex or Claude in Settings and verify that CLI is installed and authenticated. |
| Coordinator rejects an unknown option | Update the chosen CLI; the adapter uses current documented non-interactive flags. |
| A stopped session still appears | Stop preserves its record. Use its sidebar **⋯ → Archive session** or **Delete saved session…**. |

The Windows PTY dependency is deliberately pinned to `node-pty@1.2.0-beta.18`, with an isolated compatibility shim and lifecycle regression tests. See [architecture](docs/architecture.md) before upgrading it.

## Project layout

`src/core` owns queue and coordinator behavior. `src/server` owns local transport, PTYs, profiles, persistence and delivery. `public` contains the UI. `scripts` contains event bridges and optional smoke checks. `test` contains unit, integration and browser coverage.

MIT licensed. Contributions should follow [AGENTS.md](AGENTS.md), [PROJECT.md](PROJECT.md), and [the development roadmap](docs/roadmap.md).
