export type Priority = 1 | 2 | 3;
export type SessionMode = "demo" | "shell" | "claude";
export type SessionStatus = "idle" | "working" | "waiting" | "stopped" | "error";
export type ItemKind = "question" | "review" | "error";

export interface Session {
  id: string;
  name: string;
  project: string;
  cwd: string;
  mode: SessionMode;
  priority: Priority;
  status: SessionStatus;
  createdAt: number;
  lastActivityAt: number;
  claudeId?: string;
  executable?: string;
  demoScenario?: "question" | "review" | "working";
}

export interface AttentionItem {
  id: string;
  sessionId: string;
  kind: ItemKind;
  title: string;
  detail: string;
  priority: Priority;
  status: "pending" | "snoozed" | "resolved";
  source: string;
  requestKey?: string;
  confidence: "detected" | "suggested" | "manual";
  createdAt: number;
  resolvedAt?: number;
  snoozedUntil?: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  at: number;
}

export interface WorkspaceState {
  version: 1;
  sessions: Session[];
  items: AttentionItem[];
  messages: ChatMessage[];
  selectedSessionId: string | null;
  selectedItemId: string | null;
  processedEvents: string[];
}

export interface WorkerEvent {
  eventId?: string;
  hook_event_name: string;
  session_id?: string;
  last_assistant_message?: string;
  message?: string;
  notification_type?: string;
  tool_name?: string;
  tool_input?: { questions?: { question?: string; header?: string }[] };
  background_tasks?: unknown[];
  session_crons?: unknown[];
}
