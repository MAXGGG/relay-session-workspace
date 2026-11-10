import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import type { WorkspaceState } from "../core/types.ts";

export class Store {
  file: string;
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true });
    this.file = path.join(directory, "workspace.json");
  }
  load(): WorkspaceState | undefined {
    if (!existsSync(this.file)) return undefined;
    let state: unknown;
    try {
      state = JSON.parse(readFileSync(this.file, "utf8"));
    } catch {
      throw new Error(`Invalid saved workspace. Original file preserved: ${this.file}`);
    }
    if (!validState(state)) {
      throw new Error(`Invalid saved workspace. Original file preserved: ${this.file}`);
    }
    return state;
  }
  save(state: WorkspaceState): void {
    const temporary = `${this.file}.tmp`;
    const fd = openSync(temporary, "w", 0o600);
    try {
      writeFileSync(fd, JSON.stringify(state, null, 2));
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    if (existsSync(this.file)) {
      copyFileSync(this.file, `${this.file}.bak.tmp`);
      renameSync(`${this.file}.bak.tmp`, `${this.file}.bak`);
    }
    renameSync(temporary, this.file);
  }
}

function validState(value: unknown): value is WorkspaceState {
  if (!value || typeof value !== "object") return false;
  const state = value as WorkspaceState;
  if (
    state.version !== 1 ||
    !Array.isArray(state.sessions) ||
    !Array.isArray(state.items) ||
    !Array.isArray(state.messages) ||
    !Array.isArray(state.processedEvents)
  )
    return false;
  const id = (value: unknown) => typeof value === "string" && /^[\w-]{1,100}$/.test(value);
  const text = (value: unknown) => typeof value === "string";
  const time = (value: unknown) => typeof value === "number" && Number.isFinite(value);
  const args = (value: unknown) =>
    value === undefined ||
    (Array.isArray(value) &&
      value.length <= 100 &&
      value.every((entry) => text(entry) && !/[\0\r\n]/.test(entry)));
  if (
    state.sessions.some(
      (s) =>
        !s ||
        !id(s.id) ||
        !text(s.name) ||
        !s.name.trim() ||
        !text(s.cwd) ||
        !text(s.project) ||
        !["demo", "shell", "claude", "codex", "custom"].includes(s.mode) ||
        ![1, 2, 3].includes(s.priority) ||
        !["idle", "working", "waiting", "stopped", "error"].includes(s.status) ||
        !time(s.createdAt) ||
        !time(s.lastActivityAt) ||
        !args(s.args) ||
        !args(s.resumeArgs) ||
        (s.notes !== undefined && !text(s.notes)) ||
        (s.group !== undefined && (!text(s.group) || s.group.length > 60)) ||
        (s.pinned !== undefined && typeof s.pinned !== "boolean") ||
        (s.initialPrompt !== undefined && !text(s.initialPrompt)) ||
        (s.initialPromptStartedAt !== undefined && !time(s.initialPromptStartedAt)),
    )
  )
    return false;
  const sessions = new Set(state.sessions.map((s) => s.id));
  if (sessions.size !== state.sessions.length) return false;
  if (
    state.items.some(
      (i) =>
        !i ||
        !id(i.id) ||
        !sessions.has(i.sessionId) ||
        !["question", "approval", "review", "error", "activity"].includes(i.kind) ||
        !["pending", "snoozed", "resolved"].includes(i.status) ||
        ![1, 2, 3].includes(i.priority) ||
        !text(i.title) ||
        !text(i.detail) ||
        !text(i.source) ||
        !time(i.createdAt) ||
        !["detected", "suggested", "manual"].includes(i.confidence),
    )
  )
    return false;
  const items = new Set(state.items.map((i) => i.id));
  if (
    items.size !== state.items.length ||
    (state.selectedSessionId !== null && !sessions.has(state.selectedSessionId)) ||
    (state.selectedItemId !== null && !items.has(state.selectedItemId))
  )
    return false;
  if (
    state.messages.some(
      (m) => !m || !["user", "assistant"].includes(m.role) || !text(m.text) || !time(m.at),
    ) ||
    state.processedEvents.some((event) => !text(event))
  )
    return false;
  if (
    state.deliveries !== undefined &&
    (!Array.isArray(state.deliveries) ||
      state.deliveries.some(
        (d) =>
          !d ||
          !id(d.id) ||
          !sessions.has(d.sessionId) ||
          !text(d.runId) ||
          !text(d.text) ||
          !["pending", "sent", "uncertain", "failed"].includes(d.status) ||
          !time(d.at),
      ))
  )
    return false;
  if (
    state.settings !== undefined &&
    (!state.settings ||
      !Number.isInteger(state.settings.retireAfterDays) ||
      state.settings.retireAfterDays < 0 ||
      state.settings.retireAfterDays > 365)
  )
    return false;
  const coordinator = state.settings?.coordinator;
  if (
    coordinator !== undefined &&
    (!coordinator ||
      !["auto", "commands", "codex", "claude"].includes(coordinator.provider) ||
      [coordinator.model, coordinator.executable, coordinator.defaultCwd].some(
        (value) => value !== undefined && !text(value),
      ) ||
      (coordinator.defaultMode !== undefined &&
        !["codex", "claude"].includes(coordinator.defaultMode)))
  )
    return false;
  if (
    state.coordinatorRequests !== undefined &&
    (!Array.isArray(state.coordinatorRequests) ||
      state.coordinatorRequests.some(
        (r) =>
          !r || !id(r.id) || !text(r.text) || !["running", "done", "failed"].includes(r.status),
      ))
  )
    return false;
  if (
    state.replyDraft &&
    (!id(state.replyDraft.id) ||
      !sessions.has(state.replyDraft.sessionId) ||
      !text(state.replyDraft.text))
  )
    return false;
  return true;
}
