import { randomUUID } from "node:crypto";
import type { AttentionItem, Priority, Session, WorkspaceState } from "./types.ts";

export function emptyState(): WorkspaceState {
  return {
    version: 1,
    sessions: [],
    items: [],
    messages: [],
    selectedSessionId: null,
    selectedItemId: null,
    processedEvents: [],
  };
}

export class Workspace {
  state: WorkspaceState;
  now: () => number;

  constructor(state: WorkspaceState = emptyState(), now: () => number = Date.now) {
    this.state = structuredClone(state);
    this.now = now;
  }

  snapshot(): WorkspaceState {
    return structuredClone(this.state);
  }

  session(id: string): Session {
    const session = this.state.sessions.find((entry) => entry.id === id);
    if (!session) throw new Error("Session not found.");
    return session;
  }

  item(id: string): AttentionItem {
    const item = this.state.items.find((entry) => entry.id === id);
    if (!item) throw new Error("Attention item not found.");
    return item;
  }

  addSession(
    input: Pick<Session, "name" | "project" | "cwd" | "mode"> & Partial<Session>,
  ): Session {
    if (!input.name.trim() || input.name.length > 100)
      throw new Error("Use a session name of 1–100 characters.");
    if (!["demo", "shell", "claude", "codex", "custom"].includes(input.mode))
      throw new Error("Unknown session mode.");
    const priority = validPriority(input.priority ?? 2);
    const session: Session = {
      id: `session-${randomUUID().slice(0, 8)}`,
      status: "idle",
      createdAt: this.now(),
      lastActivityAt: this.now(),
      ...input,
      name: input.name.trim(),
      priority,
    };
    if (this.state.sessions.some((entry) => entry.id === session.id))
      throw new Error("Duplicate session ID.");
    this.state.sessions.push(session);
    this.state.selectedSessionId ??= session.id;
    return session;
  }

  enqueue(
    sessionId: string,
    input: Pick<AttentionItem, "kind" | "title" | "detail" | "source"> & Partial<AttentionItem>,
  ): AttentionItem {
    const session = this.session(sessionId);
    const existing = this.state.items.find(
      (entry) =>
        entry.sessionId === sessionId &&
        entry.status !== "resolved" &&
        entry.kind === input.kind &&
        (input.requestKey ? entry.requestKey === input.requestKey : entry.title === input.title) &&
        entry.source === input.source,
    );
    if (existing) return existing;
    const item: AttentionItem = {
      id: `task-${randomUUID().slice(0, 8)}`,
      sessionId,
      priority: session.priority,
      status: "pending",
      confidence: "detected",
      createdAt: this.now(),
      ...input,
    };
    this.state.items.push(item);
    return item;
  }

  queue(): AttentionItem[] {
    this.wake();
    return this.state.items
      .filter((item) => item.status === "pending")
      .sort(
        (a, b) => a.priority - b.priority || a.createdAt - b.createdAt || a.id.localeCompare(b.id),
      );
  }

  wake(): boolean {
    let changed = false;
    for (const item of this.state.items) {
      if (item.status === "snoozed" && (item.snoozedUntil ?? 0) <= this.now()) {
        item.status = "pending";
        delete item.snoozedUntil;
        changed = true;
      }
    }
    return changed;
  }

  selectSession(id: string): void {
    this.session(id);
    this.state.selectedSessionId = id;
    this.state.selectedItemId = null;
  }

  selectItem(id: string): AttentionItem {
    const item = this.item(id);
    delete this.session(item.sessionId).archivedAt;
    this.state.selectedSessionId = item.sessionId;
    this.state.selectedItemId = item.id;
    return item;
  }

  next(): AttentionItem | null {
    const queue = this.queue();
    const item = queue.find((entry) => entry.id !== this.state.selectedItemId) ?? queue[0];
    return item ? this.selectItem(item.id) : null;
  }

  resolve(id: string): void {
    const item = this.item(id);
    item.status = "resolved";
    item.resolvedAt = this.now();
    delete item.snoozedUntil;
  }

  snooze(id: string, minutes = 30): void {
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 10080)
      throw new Error("Defer for 1–10080 minutes.");
    const item = this.item(id);
    if (item.status === "resolved") throw new Error("This item is already resolved.");
    item.status = "snoozed";
    item.snoozedUntil = this.now() + minutes * 60000;
  }

  priority(sessionId: string, priority: number): void {
    const value = validPriority(priority);
    this.session(sessionId).priority = value;
    for (const item of this.state.items) {
      if (item.sessionId === sessionId && item.status !== "resolved") item.priority = value;
    }
  }

  updateSession(
    id: string,
    changes: Partial<
      Pick<
        Session,
        | "name"
        | "notes"
        | "conversationId"
        | "executable"
        | "args"
        | "resumeArgs"
        | "attentionMode"
        | "quietSeconds"
        | "group"
        | "pinned"
      >
    >,
  ): void {
    const session = this.session(id);
    if (changes.name !== undefined && (!changes.name.trim() || changes.name.length > 100))
      throw new Error("Use a session name of 1–100 characters.");
    if (changes.notes !== undefined && changes.notes.length > 20000)
      throw new Error("Notes are too long.");
    if (changes.group !== undefined && changes.group.length > 60)
      throw new Error("Use a group name of up to 60 characters.");
    if (changes.pinned !== undefined && typeof changes.pinned !== "boolean")
      throw new Error("Pinned must be true or false.");
    if (
      changes.attentionMode !== undefined &&
      !["events", "quiet", "manual"].includes(changes.attentionMode)
    )
      throw new Error("Choose events, quiet, or manual attention.");
    if (
      changes.quietSeconds !== undefined &&
      (!Number.isInteger(changes.quietSeconds) ||
        changes.quietSeconds < 3 ||
        changes.quietSeconds > 3600)
    )
      throw new Error("Quiet interval must be 3–3600 seconds.");
    Object.assign(session, changes);
    if (changes.name !== undefined) session.name = changes.name.trim();
    if (changes.group !== undefined) session.group = changes.group.trim();
  }

  move(id: string, beforeId: string | null): void {
    const session = this.session(id);
    if (beforeId === id) return;
    if (beforeId !== null) this.session(beforeId);
    const others = this.state.sessions.filter((entry) => entry.id !== id);
    const index = beforeId === null ? others.length : others.findIndex((s) => s.id === beforeId);
    others.splice(index, 0, session);
    this.state.sessions = others;
  }

  remove(id: string): void {
    const session = this.session(id);
    if (session.status !== "stopped" && session.status !== "error")
      throw new Error("Stop this session before deleting it.");
    this.state.sessions = this.state.sessions.filter((s) => s.id !== id);
    this.state.items = this.state.items.filter((item) => item.sessionId !== id);
    this.state.deliveries = this.state.deliveries?.filter((d) => d.sessionId !== id);
    this.state.processedEvents = this.state.processedEvents.filter(
      (key) => !key.startsWith(`${id}:`),
    );
    if (this.state.replyDraft?.sessionId === id) delete this.state.replyDraft;
    if (this.state.selectedSessionId === id) {
      this.state.selectedSessionId =
        this.state.sessions.find((s) => s.archivedAt === undefined)?.id ?? null;
      this.state.selectedItemId = null;
    }
  }

  archive(id: string, keepPending = false): void {
    const session = this.session(id);
    if (session.status !== "stopped" && session.status !== "error")
      throw new Error("Stop this session before archiving it.");
    if (
      !keepPending &&
      this.state.items.some((item) => item.sessionId === id && item.status !== "resolved")
    )
      throw new Error("Handle this session's pending and deferred items before archiving it.");
    session.archivedAt = this.now();
    if (this.state.selectedSessionId === id) {
      this.state.selectedSessionId =
        this.state.sessions.find((entry) => entry.archivedAt === undefined)?.id ?? null;
      this.state.selectedItemId = null;
    }
  }

  restore(id: string): void {
    delete this.session(id).archivedAt;
    this.selectSession(id);
  }

  retirement(days: number): void {
    if (!Number.isInteger(days) || days < 0 || days > 365)
      throw new Error("Retirement must be 0 (off) or 1–365 days.");
    this.state.settings = { ...this.state.settings, retireAfterDays: days };
  }

  retireInactive(): boolean {
    const days = this.state.settings?.retireAfterDays ?? 0;
    if (!days) return false;
    let changed = false;
    for (const session of this.state.sessions) {
      if (
        session.archivedAt === undefined &&
        session.status === "stopped" &&
        this.now() - session.lastActivityAt >= days * 86400000 &&
        !this.state.items.some(
          (item) => item.sessionId === session.id && item.status !== "resolved",
        )
      ) {
        this.archive(session.id);
        changed = true;
      }
    }
    return changed;
  }

  reopen(id: string): void {
    const item = this.item(id);
    delete this.session(item.sessionId).archivedAt;
    item.status = "pending";
    item.priority = this.session(item.sessionId).priority;
    delete item.resolvedAt;
    delete item.snoozedUntil;
  }

  classify(id: string, kind: AttentionItem["kind"]): void {
    if (!["question", "approval", "review", "error", "activity"].includes(kind))
      throw new Error("Unknown attention kind.");
    const item = this.item(id);
    item.kind = kind;
    item.confidence = "manual";
  }

  recordEvent(id: string): boolean {
    if (this.state.processedEvents.includes(id)) return false;
    this.state.processedEvents.push(id);
    this.state.processedEvents = this.state.processedEvents.slice(-2000);
    return true;
  }

  message(role: "user" | "assistant", text: string): void {
    this.state.messages.push({ role, text, at: this.now() });
    this.state.messages = this.state.messages.slice(-100);
  }

  recover(): void {
    for (const session of this.state.sessions) {
      if (session.mode !== "demo") session.status = "stopped";
    }
    for (const delivery of this.state.deliveries ?? []) {
      if (delivery.status === "pending") delivery.status = "uncertain";
    }
    for (const request of this.state.coordinatorRequests ?? []) {
      if (request.status === "running") {
        request.status = "failed";
        this.message(
          "assistant",
          "The coordinator was interrupted by a server restart. Check your sessions before requesting the action again.",
        );
      }
    }
    this.wake();
  }
}

export function validPriority(value: number): Priority {
  if (value !== 1 && value !== 2 && value !== 3) throw new Error("Priority must be P1, P2 or P3.");
  return value;
}
