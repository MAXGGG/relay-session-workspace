# Coordinator capabilities

The agent coordinator uses the selected Claude or Codex CLI account. Commands-only mode retains its small offline vocabulary. The coordinator manages Zyi, not the worker's coding tools. Worker approvals still belong in the original terminal.

## Available workflows

| Area | What to ask | Result |
| --- | --- | --- |
| Navigation | “Open the payments investigation”, “next task” | Selects the stable session/item ID; opening does not resolve it. |
| Sessions | Rename, group, pin/unpin, change priority, move up/down, start, stop, archive, restore | Uses the same session operations as the sidebar. Stop-and-archive and deletion show the existing confirmation. |
| New work | “Start a Claude task to investigate X in this project” | Starts a requested task with its initial prompt when the agent and directory are known. |
| Other launches | “Prepare a new session using my Review template”, “open a custom CLI session form” | Opens and prefills the launch form, including saved template and group defaults. Review and select Start. |
| Launch settings and notes | “Change Alpha's resume ID to …”, “prepare these launch flags” | Prefills the named session's edit form. Save applies edits; flags apply on the next launch. It does not type them into a worker. |
| Attention | Handle/review, defer, reopen, classify, add a manual card | State changes use existing domain rules. Adding a card opens its prefilled form. |
| History and search | “Show Handled page 2”, “show archived sessions”, “find Beta” | Changes queue view/page or sidebar search. All history remains stored. |
| Replies | “Reply to Alpha: …” | Prepares the existing reply dialog with a fixed target. User reviews and sends. |
| Templates | “Save a Claude review template”, “open the template to delete it” | Opens template management with requested values; user saves/deletes through the existing buttons. |
| Saved folders | “Set Work's default folder to …” | Prefills group/folder controls; user saves or forgets the mapping. |
| App settings | “Set retirement to 14 days”, “change coordinator model” | Prefills Settings for review and Save. Executable/configuration changes are never applied invisibly. |
| Terminal output | “Save Alpha's output” | Downloads that session's retained output, even if another session is selected. |
| Details | “Collapse this saved preview”, “show Claude connection details” | Expands/collapses the corresponding detail panel. |
| Layout | “Widen sessions to 300 pixels”, “reset layout” | Adjusts the same bounded/persisted panel sizes as the splitters. |
| Notifications | “Turn notifications on/off” | Updates the preference; the OS/browser still controls permission. |
| Desktop | Import saved workspace, open data folder, about, show/hide, reload, zoom, fullscreen, quit | Uses a fixed native menu operation. Import retains its picker/confirmation and empty-workspace rule; coordinator-requested Quit confirms stopping sessions. Browser mode explains unavailable native features. |

Form preparation is not a completed save. Forms retain normal validation and buttons. A delayed response never overwrites an already open form: finish/close it and select **Open requested app workflow**. Browser workflows go only to the window that submitted the request and are not replayed on reload or request retry. Clipboard editing and typing remain normal OS/terminal input; the coordinator cannot read your clipboard or answer permission prompts.

## Response failures

Claude must receive both `--output-format json` and `--json-schema`; the former alone only wraps a possibly plain-text answer in a JSON envelope. Zyi reads `structured_output` and validates the complete plan before applying actions. Invalid output produces a clear failure and no automatic retry or guessed action. See [Claude's structured output documentation](https://code.claude.com/docs/en/headless#get-structured-output).

Use a current native Claude executable on Windows. Batch `.cmd`/`.bat` shims cannot safely pass the schema's embedded quotes through Zyi's restricted shell launcher; choose `claude.exe` in Settings. Codex and Mac/Linux launchers retain their existing support. Automated tests simulate CLI inference and exercise real subprocess/PTY/browser/native paths; they do not prove every model will choose the correct workflow.

## Extending the coordinator

Add a semantic workflow to `src/server/coordinator-ui.ts` with a fixed target and field allowlist, its handler to `public/app.js`, and behavioral tests. The catalogue is included in the planner prompt and schema. Never expose arbitrary DOM selectors, API paths, scripts or terminal commands. Use the existing form/API implementation so validation and confirmations stay consistent. New actions that change persistence or process ownership need an architecture decision.
