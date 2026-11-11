# Roadmap

The [feature catalogue](features.md) owns status. This file defines order and exit criteria, not delivery promises. @MAXGGG owns prioritization. Each implementation issue needs its feature ID, owner, acceptance criteria and evidence.

## Next: 0.6 reliability milestone

Improve daily reliability before broader orchestration:
- F12/F13: diagnose Mac folder denial and establish stable signing. A successful build does not prove permission retention.
- F14/F15: make detection capability visible and safely convert existing Shell records.
- F17/F20: redacted diagnostics, recoverable state and migration acceptance.
- F18: enforce the maintenance foundation.

Exit criteria: required CI checks pass; real Claude on Mac completes work while another session is selected and produces the correct item; stop/resume preserves the conversation; folder access survives restart and upgrade. Record exact versions and remaining limits. Signing credentials are a dependency; keep releases previews until stable-release gates are met.

## Later: knowledge and continuity

F16/F19 improve naming and project knowledge. Start extraction with reviewed proposals and rollback, before auto-apply. Failures leave sessions recoverable. This is knowledge maintenance, not model retraining.

## Explore after reliability

F21–F23 cover remote access, adapters and updates. Require an architecture decision and trust-boundary review.

## Released history

- [0.5](release-0.5.md): templates, folders, naming/hooks, priorities and screen restoration; 0.5.1 adds permission UI and argument errors.
- [0.4](release-0.4.md): desktop lifecycle and packaging.
- [0.3](release-0.3.md): organization and coordinator.
- [0.2](release-plan.md): agent-independent attention workspace.

Retain reproduction evidence. Distinguish configuration errors, unresolved reports and confirmed implementation defects. Synthetic tests alone cannot close a real-platform compatibility claim.
