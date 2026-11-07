# Relay

**One attention inbox for your CLI sessions.** Run Claude Code, Codex, a shell, or another interactive CLI. See what needs a decision, handle it, and move to the next item without hunting through terminal windows.

Relay is a local application with four areas: sessions, a priority queue, a coordinator, and the selected session's original terminal. It uses no model or paid API itself. Agents you launch use their own accounts and billing.

**Release: 0.2.0.** A working local release for testing with your real projects. The coordinator understands documented commands and prepares explicit reply drafts; it is not an autonomous LLM manager. Automatic project-memory/skill extraction is planned separately. See [release acceptance](docs/release-plan.md) and [validation details](docs/testing.md).

## What works

- Saved launch profiles for **Claude, Codex, Shell, and Custom CLI**; executable paths and argument arrays.
- Original interactive PTYs, terminal resize, browser reconnect, and bounded output replay after server restart.
- Separate **questions, approvals, results, errors, and uncertain activity suggestions**.
- User-controlled P1/P2/P3 priority, oldest first within a priority; defer, bring back, classify, resolve, reopen.
- `next task`, session/task lookup, queue summaries, priority commands, and reviewed reply drafts.
- Replies bound to an explicit session and process instance. A retried request does not resend the same prompt.
- Search names, project paths, IDs and notes; rename; archive/restore; optional retirement of inactive stopped sessions.
- Optional browser notifications when the page is hidden, and a queue count in the tab title.
- Atomic workspace snapshots, a previous-snapshot backup, exclusive data-directory ownership, and guarded recovery.

## Install on the computer hosting your agents

Relay manages processes it launches **on the same machine and OS environment**. If your agents run in WSL, install Node and Relay in that WSL distribution. If they run on a server, use the SSH instructions below.

Prerequisites:

1. **Node.js 24+ and npm**, from [Node.js](https://nodejs.org/en/download).
2. **Git**, from [git-scm.com](https://git-scm.com/downloads).
3. A current browser. Playwright is needed only for development tests.
4. Your desired CLI, installed and authenticated normally. For example, check `codex --version` and `codex login status`, or `claude --version` and `claude auth status --text`.

```sh
git clone https://github.com/MAXGGG/relay-session-workspace.git relay
cd relay
npm ci
npm start
```

These commands work in PowerShell, Command Prompt, Bash, and Zsh. Run them in the folder containing `package.json`. Install dependencies on each machine; do not copy `node_modules` between platforms.

Open the **complete URL printed by your server**, including its token:

```text
Relay is ready: http://127.0.0.1:8123/#token=...
```

The token grants access to your terminals. Keep the launch link private. Each server start generates a new token; use its new link after a server restart. Your queue and session records persist.

The first normal launch is empty. Click **New session** to begin. Keep the server running. Closing the browser leaves agents running; stopping the server stops its managed processes.

### Try a separate demo first

Sample workers are visibly simulated and make no AI calls. Use a separate data directory so the demo does not alter your real workspace.

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
5. Mark an item handled when you have dealt with it, or defer it. Opening it does not resolve it; sending a reply does not automatically approve the result.

Relay does not create isolated Git worktrees for you. Concurrent agents editing the same repository should use separate worktrees/directories when their changes could interfere.

### Launch settings

| Profile | Launch and recovery |
| --- | --- |
| Shell | Your system shell. You can run any installed CLI inside it. Restarting returns to a fresh shell. |
| Codex CLI | Detects `codex`; uses `--no-alt-screen`. An explicit saved conversation ID/name adds `resume <id>`. |
| Claude Code | Detects `claude`; adds Relay's per-launch hooks. A captured or provided conversation ID adds `--resume <id>`. Global Claude settings are unchanged. |
| Custom CLI | Your executable with the arguments you specify. Optional custom resume arguments replace initial arguments when a conversation ID is set. |

Use **Executable** if auto-detection fails. Enter only the executable path there; put options in **Arguments**, as a JSON array. Example: `["--model", "your-model"]`. A Node worker could use executable `node` and arguments `["/absolute/path/worker.js"]`. Paths with spaces remain single arguments. Windows npm `.cmd` and `.bat` shims are supported with quoted arguments; arguments containing embedded double quotes or `%` require the native executable and are rejected for shims.

Custom resume example: `["resume", "{conversationId}"]`. Relay substitutes the saved ID into each argument. **Edit** updates names/notes immediately; launch changes take effect on the next start.

## How attention detection works

| Mode | What it knows | Good default |
| --- | --- | --- |
| Structured events | The worker explicitly reports a question, approval, result, error, working, or idle state. | Claude hooks and CLIs wired to the bridge. |
| Quiet suggestions | Output stopped for a configured interval. The worker may still be busy. | Codex and unfamiliar interactive CLIs. |
| Manual / exit only | You add items yourself; nonzero process exits produce errors. | Ordinary shells or noisy processes. |

Quiet mode defaults to 15 seconds and produces **Check activity**, not a claim that the task finished. Change the interval or turn it off in **Edit**. It does not repeatedly enqueue unchanged output, and deferred work stays deferred.

Claude hooks identify explicit permission and question-tool events. Classification of a plain-language final response is still a suggestion; you can correct it using **Classify as**. A completed response is not proof the entire project is done. Review approvals in the original terminal; Relay never answers or grants them autonomously.

### Agent-independent event bridge

Every managed process inherits `RELAY_SESSION_ID`, `RELAY_RUN_ID`, `RELAY_EVENT_URL`, and `RELAY_TOKEN`. Integrate a CLI's hooks or a task script with:

```sh
node /absolute/path/to/relay/scripts/relay-event.mjs working
node /absolute/path/to/relay/scripts/relay-event.mjs question "Which region should I use?"
node /absolute/path/to/relay/scripts/relay-event.mjs review "Implementation is ready for review."
```

Supported events: `working`, `question`, `approval`, `review`, `error`, `idle`. The HTTP contract is documented in [architecture](docs/architecture.md). Unknown or stale process IDs are rejected. Worker output is displayed as data and never interpreted as coordinator commands.

## Coordinator commands

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

- Add goal/findings/next-step notes in **Edit**. Search includes notes and project paths.
- **Save output** downloads the retained terminal output; each session retains up to 250,000 characters, including terminal escape sequences.
- Stop a session when appropriate. Its launch profile, notes, output and pending attention remain.
- Archive stopped sessions after handling their pending/deferred items. **Show archived sessions** lets you find and restore them.
- **Settings** can archive inactive, stopped sessions after 1–365 days. Zero disables it. It does not interrupt running processes or discard pending items.

Relay cannot adopt arbitrary already-open terminal windows. Move existing work by supplying the agent's saved conversation ID/name in a new managed session. Shell state and unsaved process memory cannot be restored by reopening a transcript. Automatic knowledge extraction into `CLAUDE.md`, `AGENTS.md`, and skills is not included in 0.2.

## Remote server setup

Install Relay alongside the agents on the server. Start it there, then forward its port:

```sh
ssh -N -L 8123:127.0.0.1:8123 your-user@your-server
```

Open the server's printed launch link in your local browser, using the same forwarded port. If the port is occupied, set `RELAY_PORT` on the server and forward that same port. Relay deliberately binds to `127.0.0.1`; do not expose it publicly. SSH handles remote access. Relay is not a remote SSH-session discovery tool.

## Storage, upgrades, and recovery

Default state lives in `.relay/`, excluded from Git. `RELAY_DATA_DIR` selects another directory; `RELAY_PORT` selects the port.

- `workspace.json`: session records, attention, notes, coordinator messages and delivery receipts.
- `workspace.json.bak`: previous snapshot, replaced on each successful save.
- `terminals/`: bounded terminal output, flushed approximately every second and on orderly shutdown.
- `workspace.lock`: exclusive server ownership; a dead owner's lock is recovered automatically.
- `runtime.json`: current local URL and server PID. Treat it as private.
- `claude-hooks.json`: generated hooks used only by managed Claude sessions.

Output and notes can contain sensitive project material. Storage is local plaintext, not encrypted. All managed processes run as your OS user, with the same capabilities as launching them yourself. Relay is not a sandbox or multi-user security boundary.

Before upgrading, stop Relay and back up the data directory. Then:

```sh
git pull --ff-only
npm ci
npm start
```

Version 0.2 reads 0.1 workspace files. Formerly running processes become stopped records on startup, while unresolved attention survives. A corrupt snapshot causes startup to stop without replacing the original. Preserve that file, inspect the backup, and restore a valid copy while the server is stopped. A crash may lose the final second of terminal output; it does not imply the agent's underlying conversation store was lost.

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

Complete Codex login and initial repository trust first. Alternatively, after reviewing this repository, `npm run smoke:codex -- --trust-project` allows that check to accept Codex's initial trust prompt for this repository. It runs with a read-only sandbox, asks for fixed responses without tool use, tests a reply through Relay's UI, and saves a screenshot/log under ignored `test-artifacts/`. It is excluded from CI and normal verification.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Node/npm not found | Install Node 24+, then open a new terminal. |
| Native terminal dependency fails to install | Use Node 24 and a supported architecture. Source builds may need Python and C++ tools; see [node-pty dependencies](https://github.com/microsoft/node-pty#dependencies). |
| Port already in use | Use the existing instance, or choose another `RELAY_PORT` **and data directory** for a separate workspace. |
| Workspace already open | Use its current launch link. A second server cannot safely write the same workspace. |
| Launch link required / reconnecting after restart | Open the new complete URL printed by the current server. |
| Executable not found | Verify the CLI in the server's terminal, restart Relay after PATH changes, or enter its full executable path. |
| Agent is asking for login/trust | Complete that agent's setup in its original terminal. Relay does not bypass agent permissions. |
| Too many quiet suggestions | Increase the quiet interval, use manual mode, or wire structured events. |
| Start opens a new conversation | Supply an explicit conversation ID or custom resume template; a retained transcript alone is not agent memory. |
| Reply says terminal changed | Close the draft, open the current session and prepare a new one. This prevents delivery into a replacement process. |

The Windows PTY dependency is deliberately pinned to `node-pty@1.2.0-beta.18`, with an isolated compatibility shim and lifecycle regression tests. See [architecture](docs/architecture.md) before upgrading it.

## Project layout

`src/core` owns queue and coordinator behavior. `src/server` owns local transport, PTYs, profiles, persistence and delivery. `public` contains the UI. `scripts` contains event bridges and optional smoke checks. `test` contains unit, integration and browser coverage.

MIT licensed. Contributions should follow [AGENTS.md](AGENTS.md), [PROJECT.md](PROJECT.md), and [the development roadmap](docs/roadmap.md).
