# Security policy

Zyi runs local shells/agents with the OS user's authority. Loopback tokens, renderer isolation and typed actions reduce unintended access; they are not a sandbox against malicious local workers.

## Reporting and support

Use [private vulnerability reporting](https://github.com/MAXGGG/zyi/security/advisories/new). Include version/platform, minimal reproduction, impact and mitigation if known. Do not publish exploit details, tokens, source or private transcripts in issues. @MAXGGG owns triage/disclosure; this volunteer project has no guaranteed response SLA.

Only the latest preview receives fixes; there is no LTS branch. High/critical findings block releases until fixed or explicitly excepted with scope, justification, mitigation and expiry. Never disable a whole scan for one advisory.

Sensitive surfaces: terminal routing, HTTP/WebSocket tokens/origins, coordinator prompt injection, import/migration, native IPC, hooks and dependencies.

## Build integrity

CI audits the complete dependency tree, including Electron/build tools, runs CodeQL, pins actions by commit and gives PR jobs read-only permissions without signing secrets. Scheduled scans catch new advisories. Runtime/PTY upgrades need native packaged acceptance.

On 2026-11-10 npm audit reports six moderate tree findings from minimatch (GHSA-g3hv-75wg-m249) in electron-builder tooling, zero high/critical. Owner: @MAXGGG; review by 2026-12-10. Test a compatible upstream update on all native targets; do not blindly accept the suggested forced packager downgrade. This is tracked exposure, not suppression. Production-only dependencies report no findings, but that excludes Electron, a dev dependency used at runtime.

Mac previews are ad-hoc signed, not notarized; Windows previews are unsigned. Stable signing/permission retention remains F13. Never expose signing credentials to PR code.

## Data

No automatic telemetry/crash upload. State stays local unless the user sends data to a provider or shares diagnostics. Exports must default to excluding prompts, output, tokens, auth headers and environment values, with user review before sharing.

See [architecture](docs/architecture.md) for boundaries and [recovery](docs/releases.md) for preserving user data.
