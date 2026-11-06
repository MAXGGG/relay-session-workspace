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
    if (!["demo", "shell", "claude"].includes(input.mode)) throw new Error("Unknown session mode.");
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
        entry.title === input.title &&
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
    this.wake();
  }
}

export function validPriority(value: number): Priority {
  if (value !== 1 && value !== 2 && value !== 3) throw new Error("Priority must be P1, P2 or P3.");
  return value;
}
