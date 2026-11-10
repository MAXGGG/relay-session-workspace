# Patterns studied before implementation

Reviewed 2026-11-06. These are architectural influences, not copied implementations or adopted instructions from other repositories. Linked branches can evolve.

| Project | Evidence | Pattern applied to Zyi |
| --- | --- | --- |
| OpenCode | [Agent instructions](https://github.com/anomalyco/opencode/blob/dev/AGENTS.md) | Concise project commands, explicit ownership rules, tests of real behavior, and separate domain/UI validation. |
| Cline | [SDK architecture](https://github.com/cline/cline/blob/main/sdk/ARCHITECTURE.md), [contribution guide](https://github.com/cline/cline/blob/main/CONTRIBUTING.md) | Core state separated from host adapters and UI; unit/integration tests plus Playwright user flows with isolated fixtures. |
| Aider | [Contribution guide](https://github.com/Aider-AI/aider/blob/main/CONTRIBUTING.md), [Windows CI](https://github.com/Aider-AI/aider/blob/main/.github/workflows/windows-tests.yml) | Documented reproducible setup, committed dependency lockfile, automated checks, and native Windows coverage. |

Zyi uses one package. Boundary discipline is useful here; a large monorepo would add overhead. TypeScript and runtime validation protect local API contracts. A real PTY smoke test is separate from model-dependent Claude validation.

Integration references: [Claude hooks](https://code.claude.com/docs/en/hooks), [node-pty](https://github.com/microsoft/node-pty), [xterm.js](https://xtermjs.org/docs/). Claude emits turn, tool, notification and session events; a stopped response is not evidence that a whole task is complete. SessionEnd cannot block termination, so P2 extraction must precede managed closure or run as a separate job.
