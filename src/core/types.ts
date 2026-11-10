export type Priority = 1 | 2 | 3;
export type SessionMode = "demo" | "shell" | "claude" | "codex" | "custom";
export type SessionStatus = "idle" | "working" | "waiting" | "stopped" | "error";
export type ItemKind = "question" | "approval" | "review" | "error" | "activity";

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
  args?: string[];
  resumeArgs?: string[];
  conversationId?: string;
  notes?: string;
  group?: string;
  pinned?: boolean;
  initialPrompt?: string;
  initialPromptStartedAt?: number;
  archivedAt?: number;
  attentionMode?: "events" | "quiet" | "manual";
  quietSeconds?: number;
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
  deliveries?: Delivery[];
  settings?: { retireAfterDays: number; coordinator?: CoordinatorSettings };
  replyDraft?: { id: string; sessionId: string; text: string };
  coordinatorRequests?: { id: string; text: string; status: "running" | "done" | "failed" }[];
}

export interface CoordinatorSettings {
  provider: "auto" | "commands" | "codex" | "claude";
  model?: string;
  executable?: string;
  defaultCwd?: string;
  defaultMode?: "codex" | "claude";
}

export interface Delivery {
  id: string;
  sessionId: string;
  runId: string;
  text: string;
  status: "pending" | "sent" | "uncertain" | "failed";
  at: number;
}

export interface SessionEvent {
  eventId: string;
  type: "working" | "question" | "approval" | "review" | "error" | "idle";
  text?: string;
  conversationId?: string;
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
