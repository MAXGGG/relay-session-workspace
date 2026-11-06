# Relay prototype

Relay helps one person handle many independent Claude Code sessions. It presents a priority-ordered attention queue and opens each item's original terminal. The coordinator navigates and organizes; it does not answer workers or authorize their work.

## P1 acceptance
- Four areas: sessions, attention queue, coordinator conversation, original terminal.
- Separate questions, review results, and errors; one session can produce several attention items.
- User priority first, then oldest first. Opening an item never resolves it.
- Next, open, defer, review/done, and change-priority commands have visible, deterministic effects.
- Persist sessions and queue across app restarts; restart does not imply a live process survived.
- Real terminals for locally launched sessions; clearly labeled simulated sessions for evaluation without Claude installed.
- Claude CLI hooks emit events without modifying global Claude settings or auto-answering approvals.

## P2 (later)
Before retiring an inactive session, extract reusable learnings and propose edits to CLAUDE.md or skills. Support review and auto-apply modes, project scope, deduplication, source evidence, and reversible changes. A session-ending hook is not a reliable place to wait for extraction. This prototype does not claim to implement P2.

## Current assumptions
Claude Code runs on the user's other computer. This prototype can be developed here; actual Claude integration must also be tested on that computer. The initial coordinator uses a documented command vocabulary, not an always-running LLM. Run the app on the machine hosting its terminal processes.
