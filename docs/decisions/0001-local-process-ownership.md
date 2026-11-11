# 0001: Local process ownership and explicit decisions

Status: accepted; records existing 0.5.1 architecture on 2026-11-10.

## Context and decision

One person coordinates independent CLI agents. Worker text/model plans are untrusted; sessions can restart during navigation. The local backend owns processes, terminal emulation and queue state. The isolated renderer displays state and sends requests. Agent adapters add structured signals. Stable session/run IDs bind input. The coordinator cannot approve permissions or silently answer workers.

## Alternatives and consequences

Renderer-owned workers couple work to windows. Text scraping confuses silence and completion. An autonomous manager removes user decision boundaries. Our design needs health diagnostics, durable receipts and generation checks; a backend restart cannot preserve process memory.

## Evidence

Real PTY/routing/lifecycle tests, browser target-switch regressions and packaged lifecycle checks cover these boundaries. Provider/OS behavior still needs live acceptance. See [architecture](../architecture.md) and [testing](../testing.md).
