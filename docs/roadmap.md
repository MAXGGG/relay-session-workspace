# Next development slices

## 1. Validate the attention workflow on real Claude

Run three managed sessions on the user's Claude computer. Confirm tool permissions and structured/free-text questions reach the queue; routing and priorities work under concurrent activity; stop/resume continues the correct conversation. Measure missed/duplicate items and unnecessary terminal switches. Keep model-independent CI green.

## 2. Make onboarding existing work easier

Add explicit import of selected saved conversations, with readable names and project matching. Add an SSH adapter if the actual workflow needs a local UI for a remote host. Treat live-terminal adoption separately from resuming saved conversations. Add lifecycle states and reconnect tests before claiming session recovery.

## 3. Add the LLM secretary behind the existing command boundary

Translate natural language into typed navigation/queue actions. Reuse core operations and require target IDs. Show ambiguity and preserve user priorities. Keep replies to workers and permission approvals outside this scope. Evaluate intent routing against a labeled test set, including ambiguous and adversarial worker text.

## 4. P2: knowledge before retirement

An inactivity policy should first schedule extraction; do not kill a session and expect a SessionEnd hook to finish a long model job. Propose reusable project facts or procedures, with source evidence, scope, deduplication and a diff. Temporary task status belongs in task history, not CLAUDE.md.

Provide review mode first, then explicit auto-apply configuration for trusted project paths. Bound instruction-file growth, consolidate contradictions, validate skill structure, and record undoable changes. Retire only when the selected extraction policy succeeds or the user explicitly skips it. Test failure/retry, concurrent proposals, stale evidence, secret exclusion and rollback.

Success means fewer interruptions and better repeated-task performance, not an ever-growing collection of Markdown files. This is persistent knowledge management; it does not retrain the underlying model.
