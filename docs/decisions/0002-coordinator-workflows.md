# 0002: Typed coordinator workflows reuse application controls

Status: Accepted for the 0.5.3 preview, 2026-11-11.

## Context

The coordinator's small action enum could not reach templates, folder defaults, configuration or view controls. Claude's JSON envelope could contain prose rather than the expected plan, producing an exposed JSON parser error. Expanding access must preserve stable routing and existing review boundaries.

## Decision

Keep immediate session/queue actions on the server. Add an allowlisted UI-workflow catalogue with fixed session/item targets and permitted fields. Validate the entire plan before execution, allow at most one UI workflow as the final action, and return its prepared request only in the originating HTTP response. Do not persist/broadcast/replay browser side effects. The client reuses its existing forms and operations; unsaved forms take precedence over delayed requests. Changes to launch configuration, settings, templates and manual cards are prepared visibly for user submission. Replies and destructive confirmations retain their existing flows.

The sandboxed desktop preload exposes only fixed menu operations and the existing import flow; main-process handlers check sender/frame origin. There are no arbitrary paths, shell commands, DOM selectors or executable code in the protocol. Native Quit asks before stopping sessions.

Claude receives its JSON schema as a CLI argument. Both providers' responses undergo parsing and validation before any application action. Invalid output fails clearly, without guessed extraction or automatic paid retries. Current native Claude is required on Windows because batch-shim quoting remains deliberately restricted.

## Alternatives

Giving the planner DOM control or arbitrary HTTP/command execution would bypass application boundaries. Duplicating all forms inside the model action executor would drift from UI validation. A fully persistent UI-effect queue would add multi-window ownership/replay ambiguity without helping this local request/response workflow.

## Consequences and validation

Natural language reaches the application's workflows; preparing a form is explicitly distinct from saving it. If the initiating window disconnects before receiving a prepared workflow, the user can ask again; no hidden mutation is replayed. Existing server actions may already have completed and their durable coordinator message remains authoritative. Native OS permissions and worker approvals stay interactive. Tests cover invalid plans/fields, request deduplication, stable targets, form preservation, real template launches, deletion cancellation, history/layout/export, schema transport and native menu validation.

Extends [0001](0001-local-process-ownership.md); does not supersede its ownership or explicit-decision rules.
