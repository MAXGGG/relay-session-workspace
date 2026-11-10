# Zyi 0.3: daily session management

User-reported goals: remove and organize sidebar sessions, use a real coordinator agent, show truthful status, and resize panels.

1. Sidebar: edit, pin, group, reorder, stop/archive, restore, and explicitly delete saved records. Pending items survive archiving. Deletion never touches project files or agent-owned history.
2. Coordinator: configurable Codex/Claude inference, natural-language lookup and task creation, multi-turn clarification, validated actions, honest execution results, cancellation/errors, and no autonomous worker approvals. New tasks launch in a user-specified or known project.
3. Status: distinguish live running processes from stopped records, activity, queued attention, errors, and stopping. Provide a text label and tooltip with each dot.
4. Layout: pointer and keyboard splitters for sidebar width, attention width, and chat/terminal height. Save sizes, support reset, retain narrow-screen usability.
5. Acceptance: regression tests at domain, HTTP/process, and browser boundaries; opt-in real coordinator check; Windows/Ubuntu CI; updated setup and limitations.

## Verification

- All four user-reported improvements are implemented, with updated setup and usage documentation.
- Local Windows verification: 20 unit + 26 integration + 14 browser tests passed. Core coverage: 100% lines, 98.41% branches, 97.06% functions.
- Live Codex acceptance passed: semantic session navigation without starting a stopped process, creation of a new worker through coordinator chat, initial task delivery, and an actual worker response. An additional real call verified the isolated scratch-directory runner.
- Desktop and mobile screenshots were inspected; drag, keyboard adjustment, persistence, reset, and narrow-screen behavior are covered by browser tests.
- Release gate passed: [Windows and Ubuntu CI](https://github.com/MAXGGG/zyi/actions/runs/42729214830) passed for implementation commit `2b08629`. Windows runs all 60 tests; Ubuntu runs 59 with the Windows-only shim test skipped. Published on GitHub as version 0.3.0.
- Real Claude and macOS acceptance remain unverified. Automatic project-memory extraction remains a later release.
