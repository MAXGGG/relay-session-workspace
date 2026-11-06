# Relay

A lightweight local workspace for many Claude Code sessions and one human's attention.

Sessions on the left, a prioritized attention queue, a coordinator, and the selected session's real terminal. Ask for **next task**, handle that decision, and move on. Opening an item never silently marks it complete.

**Status:** working exploration prototype. The coordinator uses a small command vocabulary; an LLM secretary and automatic knowledge consolidation are future work. Sample sessions are explicitly simulated and make no AI calls.

## Choose where to run Relay

| Your situation | Setup |
| --- | --- |
| Try the interface without Claude | Run Relay locally and use sample workers or real shells. |
| Claude runs on another laptop/desktop | Clone and run Relay **on that machine**, as the same OS user who uses Claude. Open the printed URL in a browser there. |
| Claude runs on a server | Run Relay on the server and forward its loopback port through SSH. See [remote server setup](#remote-server-setup). |
| Claude runs inside WSL | Run Node, Relay and Claude in the same WSL environment, using Linux project paths. |

This prototype manages terminals it launches. It does not discover or attach to already-open external terminal windows. A saved Claude conversation can be requested by ID when creating a managed session.

## 1. Install prerequisites on your other machine

- **Node.js 24.x and npm:** use [the official Node download page](https://nodejs.org/en/download), choosing 24.x to match our validation/CI runtime. The application requires at least Node 24.
- **Git:** install from [Git downloads](https://git-scm.com/downloads) if needed.
- A current desktop browser. You do not need Playwright's browser just to use the app.
- **Claude Code, only for real Claude sessions:** follow [Anthropic's setup instructions](https://code.claude.com/docs/en/setup). Prefer the native installer; on Windows the executable field expects `claude.exe`, not an npm `.cmd` launcher.

Open a new terminal after installing prerequisites, then verify:

```sh
node --version
npm --version
git --version
```

Node should report `v24.x` or newer. For real Claude sessions, also check:

```sh
claude --version
claude auth status --text
```

If Claude is not signed in, run `claude auth login` and complete its normal sign-in. Relay uses the Claude installation and account of its launching OS user. It has no separate API-key field; real Claude work follows your existing Claude billing arrangement. See the [official CLI reference](https://code.claude.com/docs/en/cli-reference).

**Validation status:** the automated suite has passed on both Windows and Ubuntu in [GitHub Actions](https://github.com/MAXGGG/relay-session-workspace/actions/runs/42300200534). macOS has not been validated in this project yet. Real Claude behavior still requires the [manual acceptance check](docs/testing.md#manual-claude-acceptance).

## 2. Clone and install

Run these commands on the machine where you want Relay to manage your sessions:

```sh
git clone https://github.com/MAXGGG/relay-session-workspace.git relay
cd relay
npm ci
```

These commands work in PowerShell, Command Prompt, Bash and Zsh. A private repository requires GitHub access on the target machine. Run npm commands in the folder containing `package.json`.

`npm ci` installs the locked dependency versions. Install them fresh on each machine; do not copy `node_modules` between operating systems. No build step, database, Docker, Claude login or model/API calls are required for the sample workspace.

The terminal dependency includes binaries for common platforms. If a source build is needed, follow [node-pty's platform requirements](https://github.com/microsoft/node-pty#dependencies): typically Python and C++ build tools, or Xcode command-line tools on macOS. Newer npm versions use the exact-version install-script allowance already present in package.json.

## 3. Start and open the app

```sh
npm start
```

The terminal prints a line like:

```text
Relay is ready: http://127.0.0.1:8123/#token=...
```

**Open the full URL from your own running instance**, including `#token=...`. The example above is not a usable login link. Each server start generates a new token; a bare localhost URL in a new tab may ask for the current launch link. Keep the launch URL private because it grants terminal access.

Keep the server terminal running. Relay binds to `127.0.0.1` only and does not publish a website. The first launch seeds three clearly labeled sample sessions: Payments API (P1 question), Website navigation (P2 review), and Search research (P3 simulated work).

## 4. Five-minute demo check

1. Click **Next task** or type `next task` in the coordinator. Payments should open in the terminal; its question remains pending until answered or explicitly handled.
2. Click the terminal, type an answer and press Enter. The simulated worker should acknowledge it and create a result for review. No AI calls or project-file edits occur.
3. Click **Mark reviewed**, then ask for `next task` again.
4. Change an item's P1/P2/P3 selector. Priority orders pending work; age breaks ties.
5. Select an item and type `defer 1` to defer it for one minute. Check **Deferred**, then verify it returns automatically. The **Defer 30m** button uses 30 minutes.
6. Refresh the page and confirm queue decisions persist.
7. Try `open payments` and `status`. Unknown or ambiguous names should not silently select a different session.

“Next” skips the currently selected item when alternatives exist. Viewing or skipping an item never resolves it.

## Connect your Claude sessions

Run Relay **on the computer/server where Claude Code runs**. Relay launches and owns its terminals. This prototype does not attach to already-open external terminals, discover sessions on another computer, or provide an SSH connection UI.

First confirm Claude works in a regular terminal under the same OS user/environment that starts Relay. If you installed it after launching Relay, restart Relay to inherit the updated PATH.

Click **New session** and fill in:

| Field | What to enter |
| --- | --- |
| Name | A recognizable label, such as `API bug fix`. |
| Project directory | An existing absolute directory **on the Relay host**, such as `C:\work\my-api` or `/home/alex/work/my-api`. This is the project Claude will work in, not necessarily Relay's folder. |
| Session type | `Claude Code`, or `Shell` to test terminals without Claude. |
| Priority | P1 high, P2 normal, P3 low. |
| Claude executable | Usually leave blank; otherwise enter the full native executable path, without extra arguments. |
| Claude conversation ID | Leave blank for a new conversation, or supply a saved conversation ID to request `claude --resume`. |

Click **Start session** and complete any normal login, project-trust or permission prompts in the terminal. Enter the actual work request there. The coordinator currently navigates and organizes; it does not forward arbitrary work requests.

To find the executable on Windows PowerShell, use `(Get-Command claude.exe).Source`. On macOS/Linux/WSL, use `command -v claude`.

To resume an existing conversation, use the same project directory and OS user that own its saved history. Avoid concurrently continuing it in another terminal. This resumes saved history; it does not import a running external terminal or transfer history between machines. IDs reported by Claude hooks are saved for subsequent resumes.

Relay supplies a session-specific `--settings` hook file. It does not edit your global Claude configuration. The hook bridge feeds permission requests, questions, stopped responses and errors into the queue. A stopped response means **needs attention**, not **project complete**. Free-text question/result classification is deliberately simple and marked as suggested; always inspect the terminal.

Closing the browser leaves sessions running while the Relay server remains running. **Stopping Relay stops its managed terminals.** Session metadata, pending/deferred/handled items and coordinator messages persist in `.relay/`; live process handles and terminal scrollback do not survive server restarts. Claude maintains its own conversation history. Use **Start** to resume a stopped Claude session.

### Test three real sessions

Use disposable projects or read-only prompts initially:

1. Create `Clarification`, P1. Ask Claude to ask you one clarifying question before doing work, then wait for your answer.
2. Create `README review`, P2. Ask it to summarize three improvements to a README without editing any files.
3. Create `Project overview`, P3. Ask it to describe the top-level files without editing anything.
4. Let their turns finish. Confirm the queue shows questions/results and `next task` opens the right terminal in priority order.
5. Reply in the selected terminal and explicitly mark results reviewed. Confirm routing never sends your input to another session.
6. Stop one session, wait for it to stop, then click **Start**. Confirm the same conversation resumes when its ID was captured.

Synthetic tests exercise the hook bridge and routing; they cannot prove your installed Claude CLI's behavior. Follow the fuller [manual checklist](docs/testing.md#manual-claude-acceptance) for permission prompts and server restart.

## Start with an empty workspace

Samples are seeded only for a new data directory. `RELAY_DEMO=0` does not delete already-saved samples. To preserve the demo and create a separate empty workspace, stop Relay with Ctrl+C, then start with a new data directory:

**PowerShell:**

```powershell
$env:RELAY_DEMO = '0'
$env:RELAY_DATA_DIR = Join-Path $env:USERPROFILE '.relay-workspaces\main'
npm start
```

**macOS/Linux/WSL:**

```sh
RELAY_DEMO=0 RELAY_DATA_DIR="$HOME/.relay-workspaces/main" npm start
```

Use the same data-directory setting on later launches. PowerShell environment settings last for that terminal; Bash/Zsh's inline settings above apply to that command only.

## Remote server setup

Relay and Claude run on the server; the browser can run on your laptop. Project directories entered in the UI must exist on the server.

1. SSH to the server. Install the prerequisites, clone this repository there, run `npm ci`, then `npm start`.
2. Keep Relay running and copy the full launch URL printed on the server.
3. In a separate terminal on your browser computer, replace `user@server` with your SSH destination and run:

   ```sh
   ssh -N -L 127.0.0.1:8123:127.0.0.1:8123 user@server
   ```

4. Keep that tunnel open. Open the server's full launch URL in your local browser, using `127.0.0.1` and its printed port/token.

The local and remote ports must match because Relay checks Host and Origin. If 8123 is occupied locally, choose another `RELAY_PORT` on the server and forward **that same port** on both ends. Do not expose Relay directly through a public firewall port.

For a Linux server where work should continue after disconnecting SSH, run Relay in a terminal multiplexer such as tmux. After tmux is installed:

```sh
tmux new -s relay
# Inside tmux, change to the cloned Relay directory, then:
npm start
```

Detach with Ctrl+B, then D; reconnect later with `tmux attach -t relay`. This keeps the process alive across SSH disconnects, not server reboots. Relay has no built-in SSH manager or service installer.

## Stop, resume, update and back up

| Action | Behavior |
| --- | --- |
| Close/refresh the browser | Managed processes continue while the Relay server runs. Reopen its current launch link. |
| Click **Stop** for a session | Stops that terminal; retains its record and pending items. |
| Click **Start** for a stopped Claude session | Requests its captured conversation ID via `--resume`, when available. |
| Ctrl+C in the Relay server terminal | Stops managed terminals and saves state. |
| Restart Relay | Restores metadata/queue; real terminals are stopped until explicitly started. |

A shell's in-memory state and terminal scrollback are not restored. Stopping a session does not trigger automatic knowledge extraction.

To update, finish or stop active work, stop Relay, then run from its repository:

```sh
git pull --ff-only
npm ci
npm start
```

Retain your `RELAY_DATA_DIR` setting if you use one. Back up that directory while Relay is stopped. By default it is `.relay/` in this repository: `workspace.json` stores sessions, queue and coordinator history; generated files include hook settings and `runtime.json` with the launch URL. This does **not** back up Claude history or project files. Restored project paths must exist on the target machine.

## Coordinator commands

| Command | Effect |
| --- | --- |
| `next task` | Focus the next pending item, priority first, then age; skip the current item when alternatives exist. |
| `open payments` | Focus an unambiguous session name or project match. |
| `open task-…` | Focus an exact attention item ID and its terminal. |
| `make payments P1` | Set user priority: P1 high, P2 normal, P3 low. |
| `defer 30` | Defer the selected item for 30 minutes. |
| `reviewed` or `done` | Mark the selected item handled. |
| `status` | Summarize pending items. |

The coordinator neither answers workers nor grants tool permissions. Ambiguous targets request a more specific name. Unsupported text is not executed or forwarded.

## Develop

```sh
npm ci
npm run setup:browser
npm run verify
npm run dev
```

On Linux, `npm run setup:browser -- --with-deps` can also install Chromium's OS dependencies. `verify` runs type/syntax/lint checks, unit and real integration tests, core coverage gates, and Playwright acceptance tests. No Claude login or paid API calls are used. GitHub Actions is configured for Windows and Ubuntu; those jobs execute after the repository is pushed to GitHub.

The current suite contains 12 unit tests, 10 integration tests and 5 browser tests. Lifecycle regression checks include twelve concurrent shells and require the host to exit naturally. Coverage gates enforce 90% core lines/functions and 85% branches. Browser failures retain traces/screenshots. Check the repository's **Actions** tab for actual CI results; workflow configuration alone does not establish a passing platform.

`npm run dev` restarts the server on source changes, which stops its managed terminals. Use disposable sessions during development. Browser installation is only needed for browser tests, not normal app use.

See [CONTRIBUTING.md](CONTRIBUTING.md), [test strategy](docs/testing.md), [architecture](docs/architecture.md), and [research notes](docs/research.md). AI contributors start with [AGENTS.md](AGENTS.md); `CLAUDE.md` imports the same instructions.

```text
src/core/          Queue rules, session state, event interpretation, commands
src/server/        Local HTTP/WebSocket, persistence, terminal ownership
public/            Four-panel browser UI and xterm.js
scripts/           Claude hook bridge, simulated worker, browser installer
test/unit/         Core behavior and edge cases
test/integration/  Persistence, HTTP, WebSocket, hooks, real PTY lifecycle
test/e2e/          Browser workflows
docs/              Decisions, research, testing and roadmap
```

## Configuration and boundaries

| Environment variable | Default |
| --- | --- |
| `RELAY_PORT` | `8123` |
| `RELAY_DATA_DIR` | `.relay` under this project |
| `RELAY_DEMO` | Samples enabled on first launch; set `0` for an empty new workspace. |

For an alternate port in PowerShell:

```powershell
$env:RELAY_PORT = '8124'
npm start
```

On macOS/Linux/WSL:

```sh
RELAY_PORT=8124 npm start
```

Relay does not load `.env` automatically; set variables in its launching terminal. If deliberately starting two instances, give them different ports **and different data directories**.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| `node`, `npm` or `git` not found | Install the prerequisite, reopen your terminal to refresh PATH, then check versions. |
| PowerShell blocks `npm.ps1` | Use `npm.cmd ci`, `npm.cmd start`, or `npm.cmd run …`, or use Command Prompt. No execution-policy change is needed. |
| `ENOENT` for package.json | Run npm from the cloned Relay directory. |
| TypeScript runtime/syntax errors | Verify Node is 24 or newer. Relay uses Node's built-in erasable TypeScript support. |
| PTY module installation/loading fails | Install the native build prerequisites linked above if needed, check architecture, and rerun `npm ci` on this machine. Do not reuse another OS's dependency folder. |
| Port already in use (`EADDRINUSE`) | Stop the old instance or choose another port and data directory. |
| Page requests a launch link or reconnects after restart | Open the full URL from the current server output. In remote mode check the SSH tunnel and matching `127.0.0.1` ports. Tokens change on restart. |
| Claude is missing or exits immediately | Verify it in a normal terminal, use the native executable path, check the project directory and inspect the original terminal/queued error. On Windows, `.cmd` launchers and arguments in the executable field are not supported. |
| Project directory is missing | Enter an absolute path on the Relay host; use Linux paths inside WSL or on a Linux server. |
| Claude works but no queue events arrive | Launch it through Relay, complete project-trust prompts, and check whether Claude settings/policy disables hooks. Existing external sessions do not have Relay's hook settings. |
| A question/result is mislabeled | Free-text classification is heuristic. Inspect the terminal, handle explicitly and report a sanitized example. |
| Samples remain with `RELAY_DEMO=0` | They were previously saved. Use a new data directory; the flag does not erase data. |
| Browser tests cannot find Chromium | Run `npm run setup:browser`; on Linux add `-- --with-deps` when OS libraries are needed. |
| Saved state is corrupt | Stop Relay and back up the original data directory. Restore a known-good backup or use a separate empty directory; do not overwrite your only copy. |

To check the server without a token, use `Invoke-RestMethod http://127.0.0.1:8123/health` in PowerShell or `curl http://127.0.0.1:8123/health` on macOS/Linux. Expect `{"ok":true}`. This checks the server, not Claude connectivity.

For an issue report, include OS, Node/npm/Claude versions, reproduction steps and sanitized errors. Exclude launch tokens and private transcripts.

Use one Relay process per data directory. Bindings are loopback only; do not expose this prototype directly to a public network. The launch token grants terminal control. Session metadata can contain project paths and worker summaries and is excluded from Git. Windows shells use `cmd.exe`; Unix shells use `$SHELL` or `/bin/bash`.

Actual Claude behavior still needs the [manual acceptance check](docs/testing.md#manual-claude-acceptance) on your Claude machine. Automatic retirement, shared memory/skill proposals, a natural-language LLM coordinator, remote connection management, and adoption of existing terminal windows are not implemented. See the [roadmap](docs/roadmap.md).

The terminal adapter currently pins a prerelease of `node-pty` for a Windows concurrency fix and includes a tested cleanup workaround. Details and upgrade requirements are in [architecture](docs/architecture.md#windows-terminal-compatibility).

[MIT licensed](LICENSE).
