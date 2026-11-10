import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { WebSocket, WebSocketServer } from "ws";
import { ingestSessionEvent, QuietMonitor } from "../core/attention.ts";
import { coordinate } from "../core/coordinator.ts";
import { seedDemo } from "../core/demo.ts";
import { ingestEvent } from "../core/events.ts";
import { sessionStatus } from "../core/session-status.ts";
import type { CoordinatorSettings, SessionEvent, SessionMode, WorkerEvent } from "../core/types.ts";
import { validPriority, Workspace } from "../core/workspace.ts";
import {
  type CoordinatorAction,
  type CoordinatorRunner,
  coordinatorPrompt,
  coordinatorProvider,
  parseCoordinatorPlan,
  runCoordinator,
} from "./coordinator-agent.ts";
import { deliverReply } from "./delivery.ts";
import { acquireWorkspace } from "./lock.ts";
import { argumentList, findExecutable } from "./profiles.ts";
import { Store } from "./store.ts";
import { findClaude, Terminals } from "./terminals.ts";
import { Transcripts } from "./transcripts.ts";

export const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

export async function createApp(
  options: {
    port?: number;
    stateDir?: string;
    demo?: boolean;
    token?: string;
    coordinatorRunner?: CoordinatorRunner;
  } = {},
) {
  const directory = options.stateDir ?? path.join(projectRoot, ".relay");
  const releaseLock = acquireWorkspace(directory);
  let startupCleanup = async () => {};
  try {
    const store = new Store(directory);
    const transcripts = new Transcripts(directory);
    const loaded = store.load();
    const workspace = new Workspace(loaded);
    workspace.recover();
    if (!loaded && options.demo !== false) seedDemo(workspace, projectRoot);
    store.save(workspace.snapshot());
    const token = options.token ?? randomBytes(32).toString("hex");
    const detectedClaude = findClaude();
    const sockets = new WebSocketServer({ noServer: true, maxPayload: 65536 });
    const selected = new Map<WebSocket, string>();
    let address = "";
    let coordinatorAbort: AbortController | undefined;
    let coordinatorTask: Promise<void> | undefined;
    const state = () => {
      const queue = workspace.queue();
      return {
        state: workspace.snapshot(),
        queue,
        claudeAvailable: Boolean(detectedClaude),
        executables: { claude: detectedClaude ?? null, codex: findExecutable("codex") ?? null },
        coordinator: {
          provider: coordinatorProvider(workspace.state.settings?.coordinator),
          busy: Boolean(coordinatorAbort),
        },
        sessionStatuses: Object.fromEntries(
          workspace.state.sessions.map((s) => [
            s.id,
            sessionStatus(s, terminals.records.get(s.id), workspace.state.items),
          ]),
        ),
        terminals: Object.fromEntries(
          [...terminals.records].map(([id, record]) => [
            id,
            { runId: record.runId, stopping: record.stopping },
          ]),
        ),
      };
    };
    const intentionalStops = new Set<string>();
    const monitor = new QuietMonitor();
    let activityDirty = false;
    const send = (ws: WebSocket, value: unknown) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value));
    };
    const broadcast = () => {
      transcripts.flush();
      store.save(workspace.snapshot());
      for (const ws of sockets.clients) send(ws, { type: "state", ...state() });
    };
    const hookConfig = path.join(directory, "claude-hooks.json");
    const terminals = new Terminals({
      root: projectRoot,
      hookConfig,
      endpoint: "",
      token,
      onData: (sessionId, data) => {
        transcripts.append(sessionId, data);
        monitor.observe(workspace, sessionId, stripVTControlCharacters(data));
        activityDirty = true;
        for (const [ws, current] of selected)
          if (current === sessionId)
            send(ws, {
              type: "output",
              sessionId,
              data,
              runId: terminals.records.get(sessionId)?.runId,
            });
      },
      onExit: (sessionId, code) => {
        const session = workspace.session(sessionId);
        const intentional = intentionalStops.delete(sessionId);
        session.status = code === 0 || intentional ? "stopped" : "error";
        if (code !== 0 && !intentional)
          workspace.enqueue(sessionId, {
            kind: "error",
            title: `Terminal exited (${code})`,
            detail:
              "The terminal process stopped. Pending items and session history are preserved.",
            source: "process",
          });
        for (const [ws, current] of selected)
          if (current === sessionId) send(ws, { type: "exit", sessionId, code });
        broadcast();
      },
    });

    const allowedOrigin = (origin: string | undefined) => !origin || origin === address;
    const authorized = (request: http.IncomingMessage, url: URL) => {
      const supplied =
        request.headers.authorization?.replace(/^Bearer /, "") ?? url.searchParams.get("token");
      return supplied === token;
    };
    const respond = (response: http.ServerResponse, code: number, body: unknown) => {
      response.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify(body));
    };
    const readBody = async (request: http.IncomingMessage) => {
      let text = "";
      for await (const chunk of request) {
        text += chunk;
        if (Buffer.byteLength(text) > 65536) throw new Error("Request body is too large.");
      }
      const body = JSON.parse(text || "{}");
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw new Error("Expected a JSON object.");
      return body;
    };
    const startTerminal = (sessionId: string) => {
      const session = workspace.session(sessionId);
      if (session.archivedAt !== undefined)
        throw new Error("Restore this session before starting it.");
      try {
        const started = terminals.start(session);
        if (started) {
          if (session.initialPrompt && session.initialPromptStartedAt === undefined)
            session.initialPromptStartedAt = workspace.now();
          monitor.observations.delete(sessionId);
          transcripts.append(
            sessionId,
            `\r\n--- Terminal started ${new Date().toISOString()} ---\r\n`,
          );
          session.lastActivityAt = workspace.now();
          if (session.mode !== "demo") session.status = "idle";
        }
      } catch (error) {
        session.status = "error";
        workspace.enqueue(sessionId, {
          kind: "error",
          title: "Could not start terminal",
          detail: String(error),
          source: "process",
        });
        broadcast();
        throw new Error(
          `Could not start ${session.name}. Check the executable and project directory.`,
        );
      }
    };
    const stopTerminal = async (id: string) => {
      const session = workspace.session(id);
      const record = terminals.records.get(id);
      if (record) {
        intentionalStops.add(id);
        terminals.stop(id);
        session.status = "stopped";
        broadcast();
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            record.finished,
            new Promise((_, reject) => {
              timeout = setTimeout(
                () => reject(new Error("Terminal is still stopping. Try again shortly.")),
                10000,
              );
            }),
          ]);
        } finally {
          clearTimeout(timeout);
        }
      }
      session.status = "stopped";
    };
    const workerExecutable = (mode: "codex" | "claude") => {
      const settings = workspace.state.settings?.coordinator;
      return (
        (coordinatorProvider(settings) === mode ? settings?.executable : undefined) ||
        workspace.state.sessions.find((s) => s.mode === mode && s.executable)?.executable ||
        findExecutable(mode)
      );
    };
    const applyCoordinatorAction = async (action: CoordinatorAction): Promise<string> => {
      if (action.kind === "next") {
        const item = workspace.next();
        return item
          ? `Opened ${workspace.session(item.sessionId).name}: ${item.title}`
          : "No pending attention items.";
      }
      if (action.kind === "create") {
        const cwd = singleLine(action.cwd, 4000);
        if (!path.isAbsolute(cwd) || !existsSync(cwd) || !statSync(cwd).isDirectory())
          throw new Error("Choose an existing absolute project directory.");
        const normalizeText = (value: string) => {
          const normalized = value.replaceAll("\\", "/");
          return process.platform === "win32" ? normalized.toLowerCase() : normalized;
        };
        const normalize = (value: string) => normalizeText(path.resolve(value));
        const known = [
          ...workspace.state.sessions.map((s) => s.cwd),
          workspace.state.settings?.coordinator?.defaultCwd,
        ].filter((v): v is string => Boolean(v));
        const mentioned = workspace.state.messages
          .filter((m) => m.role === "user")
          .slice(-20)
          .some((m) => normalizeText(m.text).includes(normalize(cwd)));
        if (!known.some((v) => normalize(v) === normalize(cwd)) && !mentioned)
          throw new Error(
            "Please supply the project directory in the coordinator chat or set a default in Settings.",
          );
        if (action.mode !== "codex" && action.mode !== "claude")
          throw new Error("Choose Claude or Codex for the new task.");
        const executable = workerExecutable(action.mode);
        if (!executable)
          throw new Error(`${action.mode} is not installed or configured on this computer.`);
        const session = workspace.addSession({
          name: string(action.name, 100),
          cwd: path.resolve(cwd),
          project: path.basename(cwd),
          mode: action.mode,
          priority: validPriority(action.priority ?? 2),
          executable,
          notes: action.task ?? "",
          initialPrompt: action.task || undefined,
          attentionMode: action.mode === "claude" ? "events" : "quiet",
          quietSeconds: 15,
        });
        workspace.selectSession(session.id);
        startTerminal(session.id);
        return `Created and started ${session.name} (${session.id}) in ${session.cwd}.${session.initialPrompt ? " Initial task passed to the agent; any login or trust prompt remains in its terminal." : ""}`;
      }
      if (action.kind === "resolve" || action.kind === "defer") {
        const id = string(action.itemId);
        if (action.kind === "resolve") workspace.resolve(id);
        else workspace.snooze(id, action.minutes ?? 30);
        return `${action.kind === "resolve" ? "Handled" : "Deferred"} ${id}.`;
      }
      if (action.kind === "open" && action.itemId) {
        const item = workspace.selectItem(action.itemId);
        return `Opened ${item.id} in ${workspace.session(item.sessionId).name}.`;
      }
      const session = workspace.session(string(action.sessionId));
      switch (action.kind) {
        case "open":
          workspace.restore(session.id);
          return `Opened ${session.name}.`;
        case "start":
          workspace.restore(session.id);
          startTerminal(session.id);
          return `Started ${session.name}.`;
        case "stop":
          await stopTerminal(session.id);
          return `Stopped ${session.name}; saved work retained.`;
        case "archive":
          if (terminals.records.has(session.id))
            throw new Error(`Stop ${session.name} before archiving it.`);
          if (session.status !== "error") session.status = "stopped";
          workspace.archive(session.id, true);
          return `Archived ${session.name}; pending attention and output retained.`;
        case "priority":
          workspace.priority(session.id, Number(action.priority));
          return `${session.name} is P${action.priority}.`;
        case "rename":
          workspace.updateSession(session.id, { name: string(action.name, 100) });
          return `Renamed session to ${session.name}.`;
        case "group":
          workspace.updateSession(session.id, { group: action.group ?? "" });
          return `Moved ${session.name} to ${session.group || "Ungrouped"}.`;
        case "pin":
          if (typeof action.pinned !== "boolean") throw new Error("Choose pin or unpin.");
          workspace.updateSession(session.id, { pinned: action.pinned });
          return `${action.pinned ? "Pinned" : "Unpinned"} ${session.name}.`;
        case "reply":
          if (!terminals.records.has(session.id))
            throw new Error("Start the session before drafting a reply.");
          workspace.state.replyDraft = {
            id: randomUUID(),
            sessionId: session.id,
            text: string(action.text, 8000),
          };
          workspace.selectSession(session.id);
          return `Reply drafted for ${session.name}. Review it and click Send to terminal.`;
        default:
          throw new Error("Unsupported coordinator action.");
      }
    };
    const server = http.createServer(async (request, response) => {
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.setHeader("Referrer-Policy", "no-referrer");
      response.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'",
      );
      try {
        if (
          request.headers.host !== new URL(address).host ||
          !allowedOrigin(request.headers.origin)
        )
          return respond(response, 403, { error: "Origin or host not allowed." });
        const url = new URL(request.url || "/", address);
        if (url.pathname === "/health" && request.method === "GET")
          return respond(response, 200, { ok: true });
        if (url.pathname.startsWith("/api/")) {
          if (!authorized(request, url))
            return respond(response, 401, {
              error: "Open Relay using the launch link printed in your terminal.",
            });
          if (url.pathname === "/api/state" && request.method === "GET")
            return respond(response, 200, state());
          if (url.pathname === "/api/transcript" && request.method === "GET") {
            const id = string(url.searchParams.get("sessionId"));
            workspace.session(id);
            return respond(response, 200, { text: transcripts.read(id) });
          }
          if (request.method !== "POST")
            return respond(response, 405, { error: "Use POST for this action." });
          const body = await readBody(request);
          switch (url.pathname) {
            case "/api/chat/cancel":
              coordinatorAbort?.abort();
              break;
            case "/api/chat": {
              const text = string(body.text, 8000),
                id = singleLine(body.id, 100);
              if (!/^[\w-]{1,100}$/.test(id)) throw new Error("Invalid coordinator request ID.");
              workspace.state.coordinatorRequests ??= [];
              const requests = workspace.state.coordinatorRequests;
              const previous = requests.find((r) => r.id === id);
              if (previous) {
                if (previous.text !== text)
                  throw new Error("This chat request ID has already been used.");
                return respond(response, previous.status === "running" ? 202 : 200, state());
              }
              if (coordinatorAbort)
                throw new Error("The coordinator is answering. Wait or cancel this request first.");
              const settings = workspace.state.settings?.coordinator ?? {
                provider: "auto" as const,
              };
              const provider = coordinatorProvider(settings);
              if (provider === "commands") {
                coordinate(workspace, text);
                break;
              }
              const request = { id, text, status: "running" as "running" | "done" | "failed" };
              requests.push(request);
              workspace.state.coordinatorRequests = requests.slice(-100);
              workspace.message("user", text);
              const controller = new AbortController();
              coordinatorAbort = controller;
              broadcast();
              coordinatorTask = (async () => {
                const results: string[] = [];
                try {
                  const raw = await (options.coordinatorRunner ?? runCoordinator)({
                    provider,
                    settings,
                    directory,
                    signal: controller.signal,
                    prompt: coordinatorPrompt(
                      workspace.snapshot(),
                      [...terminals.records.keys()],
                      ["codex", "claude"].filter((mode) =>
                        workerExecutable(mode as "codex" | "claude"),
                      ),
                    ),
                  });
                  if (controller.signal.aborted)
                    throw new Error("Coordinator request cancelled. No new actions were applied.");
                  const plan = parseCoordinatorPlan(raw);
                  for (const action of plan.actions) {
                    if (controller.signal.aborted)
                      throw new Error("Coordinator request cancelled.");
                    results.push(await applyCoordinatorAction(action));
                    broadcast();
                  }
                  workspace.message(
                    "assistant",
                    [plan.message, ...results.map((result) => `• ${result}`)]
                      .filter(Boolean)
                      .join("\n\n"),
                  );
                  request.status = "done";
                } catch (error) {
                  request.status = "failed";
                  workspace.message(
                    "assistant",
                    `${results.length ? `Completed before the error:\n${results.join("\n")}\n\n` : ""}${error instanceof Error ? error.message : "Coordinator request failed."}`,
                  );
                } finally {
                  coordinatorAbort = undefined;
                  broadcast();
                }
              })();
              await coordinatorTask;
              return respond(response, 200, state());
            }
            case "/api/reply": {
              const delivery = await deliverReply(workspace, terminals, store, {
                id: body.id,
                sessionId: body.sessionId,
                runId: body.runId,
                text: body.text,
                ...(body.itemId ? { itemId: string(body.itemId) } : {}),
              });
              broadcast();
              return respond(response, 200, { ...state(), delivery });
            }
            case "/api/command":
              coordinate(workspace, string(body.text, 2000));
              break;
            case "/api/select":
              if (body.itemId) workspace.selectItem(string(body.itemId));
              else workspace.selectSession(string(body.sessionId));
              break;
            case "/api/item":
              if (body.action === "resolve") workspace.resolve(string(body.id));
              else if (body.action === "reopen") workspace.reopen(string(body.id));
              else if (body.action === "classify") workspace.classify(string(body.id), body.kind);
              else if (body.action === "snooze")
                workspace.snooze(string(body.id), Number(body.minutes ?? 30));
              else throw new Error("Unknown item action.");
              break;
            case "/api/priority":
              workspace.priority(string(body.sessionId), Number(body.priority));
              break;
            case "/api/sessions": {
              const cwd = path.resolve(string(body.cwd, 4000));
              if (!existsSync(cwd) || !statSync(cwd).isDirectory())
                throw new Error("Project directory does not exist on this computer.");
              const mode = string(body.mode) as SessionMode;
              if (!["shell", "claude", "codex", "custom"].includes(mode))
                throw new Error("Choose Shell, Claude Code, Codex, or Custom CLI.");
              const executable = body.executable ? singleLine(body.executable, 4000) : undefined;
              if (mode === "custom" && !executable)
                throw new Error("Choose an executable for the custom session.");
              const claudeId =
                mode === "claude" && body.claudeId ? string(body.claudeId).trim() : undefined;
              const attentionMode =
                body.attentionMode ??
                (mode === "claude" ? "events" : mode === "shell" ? "manual" : "quiet");
              if (!["events", "quiet", "manual"].includes(attentionMode))
                throw new Error("Unknown attention mode.");
              const quietSeconds = Number(body.quietSeconds ?? 15);
              if (!Number.isInteger(quietSeconds) || quietSeconds < 3 || quietSeconds > 3600)
                throw new Error("Quiet interval must be 3–3600 seconds.");
              if (
                body.notes !== undefined &&
                (typeof body.notes !== "string" || body.notes.length > 20000)
              )
                throw new Error("Invalid task notes.");
              const session = workspace.addSession({
                name: string(body.name, 100),
                project: path.basename(cwd),
                cwd,
                mode,
                priority: Number(body.priority ?? 2) as 1 | 2 | 3,
                executable,
                args: argumentList(body.args),
                resumeArgs: argumentList(body.resumeArgs),
                conversationId: body.conversationId ? singleLine(body.conversationId) : undefined,
                attentionMode,
                quietSeconds,
                notes: body.notes ?? "",
                group: body.group ? singleLine(body.group, 60) : "",
                ...(claudeId ? { claudeId } : {}),
              });
              workspace.selectSession(session.id);
              startTerminal(session.id);
              break;
            }
            case "/api/session": {
              const id = string(body.sessionId);
              if (body.action === "archive") {
                if (terminals.records.has(id))
                  throw new Error("Wait for the terminal to stop before archiving.");
                if (workspace.session(id).status !== "error")
                  workspace.session(id).status = "stopped";
                workspace.archive(id, true);
              } else if (body.action === "stop-archive") {
                await stopTerminal(id);
                workspace.archive(id, true);
              } else if (body.action === "delete") {
                const session = workspace.session(id);
                if (body.confirmName !== session.name)
                  throw new Error("Confirm the session name before deleting.");
                if (terminals.records.has(id))
                  throw new Error("Stop the terminal before deleting its record.");
                if (session.status !== "stopped" && session.status !== "error")
                  session.status = "stopped";
                transcripts.remove(id);
                workspace.remove(id);
                monitor.observations.delete(id);
                for (const [ws, current] of selected) if (current === id) selected.delete(ws);
              } else if (body.action === "move") {
                workspace.move(id, body.beforeId === null ? null : string(body.beforeId));
              } else if (body.action === "restore") workspace.restore(id);
              else if (body.action === "update") {
                const changes: Record<string, unknown> = {};
                for (const field of [
                  "name",
                  "notes",
                  "conversationId",
                  "executable",
                  "attentionMode",
                  "quietSeconds",
                  "group",
                  "pinned",
                ])
                  if (body[field] !== undefined) changes[field] = body[field];
                for (const field of [
                  "name",
                  "notes",
                  "conversationId",
                  "executable",
                  "attentionMode",
                  "group",
                ])
                  if (changes[field] !== undefined && typeof changes[field] !== "string")
                    throw new Error(`Invalid ${field}.`);
                for (const field of ["conversationId", "executable"])
                  if (changes[field]) changes[field] = singleLine(changes[field], 4000);
                if (body.args !== undefined) changes.args = argumentList(body.args);
                if (body.resumeArgs !== undefined)
                  changes.resumeArgs = argumentList(body.resumeArgs);
                workspace.updateSession(id, changes);
              } else throw new Error("Unknown session action.");
              break;
            }
            case "/api/settings": {
              const days = Number(
                body.retireAfterDays ?? workspace.state.settings?.retireAfterDays ?? 0,
              );
              let coordinator: CoordinatorSettings | undefined;
              if (body.coordinator !== undefined) {
                if (
                  !body.coordinator ||
                  !["auto", "commands", "codex", "claude"].includes(body.coordinator.provider)
                )
                  throw new Error("Choose a coordinator provider.");
                coordinator = { provider: body.coordinator.provider };
                for (const field of ["model", "executable", "defaultCwd"] as const)
                  if (body.coordinator[field])
                    coordinator[field] = singleLine(
                      body.coordinator[field],
                      field === "model" ? 200 : 4000,
                    );
                if (
                  coordinator.defaultCwd &&
                  (!path.isAbsolute(coordinator.defaultCwd) ||
                    !existsSync(coordinator.defaultCwd) ||
                    !statSync(coordinator.defaultCwd).isDirectory())
                )
                  throw new Error("Default project directory must exist and be absolute.");
                if (body.coordinator.defaultMode) {
                  if (!["codex", "claude"].includes(body.coordinator.defaultMode))
                    throw new Error("Choose a default worker agent.");
                  coordinator.defaultMode = body.coordinator.defaultMode;
                }
              }
              workspace.retirement(days);
              if (coordinator && workspace.state.settings)
                workspace.state.settings.coordinator = coordinator;
              break;
            }
            case "/api/attention": {
              const sessionId = string(body.sessionId);
              const text = string(body.text, 20000);
              if (!["question", "approval", "review", "error", "activity"].includes(body.kind))
                throw new Error("Unknown attention kind.");
              workspace.enqueue(sessionId, {
                kind: body.kind,
                title: text.replace(/\s+/g, " ").slice(0, 120),
                detail: text,
                source: "manual",
                confidence: "manual",
              });
              delete workspace.session(sessionId).archivedAt;
              break;
            }
            case "/api/events": {
              const sessionId = string(body.sessionId);
              const live = terminals.records.get(sessionId);
              if (!live || live.stopping || body.runId !== live.runId)
                throw new Error("This event belongs to a stopped or replaced terminal.");
              const event = body.event;
              if (
                !event ||
                !["working", "question", "approval", "review", "error", "idle"].includes(event.type)
              )
                throw new Error("Invalid session event.");
              const validated: SessionEvent = { type: event.type, eventId: string(event.eventId) };
              if (event.text !== undefined && event.text !== "")
                validated.text = string(event.text, 20000);
              if (event.conversationId) validated.conversationId = singleLine(event.conversationId);
              ingestSessionEvent(workspace, sessionId, validated);
              break;
            }
            case "/api/start":
              startTerminal(string(body.sessionId));
              break;
            case "/api/stop": {
              const session = workspace.session(string(body.sessionId));
              if (terminals.records.has(session.id)) {
                intentionalStops.add(session.id);
                terminals.stop(session.id);
              }
              session.status = "stopped";
              break;
            }
            case "/api/hook": {
              const sessionId = string(body.relaySessionId);
              const event = body.event as WorkerEvent;
              if (!event || typeof event.hook_event_name !== "string")
                throw new Error("Invalid hook event.");
              if (body.runId && body.runId !== terminals.records.get(sessionId)?.runId)
                throw new Error("Stale terminal hook.");
              for (const field of [
                "session_id",
                "last_assistant_message",
                "message",
                "notification_type",
                "tool_name",
                "eventId",
              ]) {
                const value = (event as unknown as Record<string, unknown>)[field];
                if (value !== undefined && (typeof value !== "string" || value.length > 20000))
                  throw new Error("Invalid hook text.");
              }
              if (
                event.tool_input?.questions &&
                (!Array.isArray(event.tool_input.questions) ||
                  event.tool_input.questions.some(
                    (question) =>
                      !question ||
                      (question.question !== undefined && typeof question.question !== "string"),
                  ))
              )
                throw new Error("Invalid question data.");
              ingestEvent(workspace, sessionId, event);
              break;
            }
            default:
              return respond(response, 404, { error: "Unknown action." });
          }
          broadcast();
          return respond(response, 200, state());
        }
        if (request.method !== "GET")
          return respond(response, 405, { error: "Method not allowed." });
        const assets: Record<string, string> = {
          "/": "public/index.html",
          "/app.js": "public/app.js",
          "/layout.js": "public/layout.js",
          "/styles.css": "public/styles.css",
          "/vendor/xterm.js": "node_modules/@xterm/xterm/lib/xterm.js",
          "/vendor/xterm.css": "node_modules/@xterm/xterm/css/xterm.css",
          "/vendor/fit.js": "node_modules/@xterm/addon-fit/lib/addon-fit.js",
        };
        const asset = assets[url.pathname];
        if (!asset) return respond(response, 404, { error: "Not found." });
        const contentType: Record<string, string> = {
          ".html": "text/html",
          ".js": "text/javascript",
          ".css": "text/css",
        };
        response.writeHead(200, {
          "Content-Type": `${contentType[path.extname(asset)]}; charset=utf-8`,
          "Cache-Control": "no-cache",
        });
        response.end(readFileSync(path.join(projectRoot, asset)));
      } catch (error) {
        respond(response, 400, {
          error: error instanceof Error ? error.message : "Request failed.",
        });
      }
    });

    server.on("upgrade", (request, socket, head) => {
      const url = new URL(request.url || "/", address);
      if (
        url.pathname !== "/terminal" ||
        request.headers.host !== new URL(address).host ||
        !allowedOrigin(request.headers.origin) ||
        !authorized(request, url)
      ) {
        socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }
      sockets.handleUpgrade(request, socket, head, (ws) => sockets.emit("connection", ws));
    });
    sockets.on("connection", (ws) => {
      send(ws, { type: "state", ...state() });
      ws.on("close", () => selected.delete(ws));
      ws.on("error", () => selected.delete(ws));
      ws.on("message", (raw) => {
        try {
          const message = JSON.parse(raw.toString());
          const id = string(message.sessionId);
          const session = workspace.session(id);
          if (message.type === "attach") {
            selected.set(ws, id);
            // Sample workers are safe to launch on first view. Real stopped sessions require Start.
            if (
              session.mode === "demo" &&
              !terminals.records.has(id) &&
              session.status !== "stopped" &&
              session.status !== "error" &&
              session.archivedAt === undefined
            )
              startTerminal(id);
            send(ws, {
              type: "attached",
              sessionId: id,
              data: transcripts.read(id),
              running: terminals.records.has(id),
              runId: terminals.records.get(id)?.runId ?? null,
            });
          } else {
            if (selected.get(ws) !== id)
              throw new Error("Attach to this terminal before interacting with it.");
            if (message.type === "input") {
              if (message.runId && message.runId !== terminals.records.get(id)?.runId)
                throw new Error("Terminal changed. Reconnect before typing.");
              terminals.write(id, message.data);
              session.lastActivityAt = workspace.now();
            } else if (message.type === "resize") terminals.resize(id, message.cols, message.rows);
            else throw new Error("Unknown terminal action.");
          }
        } catch (error) {
          send(ws, { type: "error", message: String(error) });
        }
      });
    });

    startupCleanup = async () => {
      coordinatorAbort?.abort();
      await coordinatorTask;
      await terminals.dispose();
      for (const ws of sockets.clients) ws.terminate();
      sockets.close();
      server.closeAllConnections();
      if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    };
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(options.port ?? 0, "127.0.0.1", resolve);
    });
    const port = (server.address() as { port: number }).port;
    address = `http://127.0.0.1:${port}`;
    terminals.endpoint = `${address}/api/hook`;
    mkdirSync(directory, { recursive: true });
    const command = `"${process.execPath.replaceAll("\\", "/")}" "${path.join(projectRoot, "scripts/claude-hook.mjs").replaceAll("\\", "/")}"`;
    const hooks = Object.fromEntries(
      [
        "SessionStart",
        "UserPromptSubmit",
        "PreToolUse",
        "PostToolUse",
        "PermissionRequest",
        "Notification",
        "Stop",
        "StopFailure",
        "SessionEnd",
      ].map((event) => [event, [{ hooks: [{ type: "command", command, timeout: 3 }] }]]),
    );
    writeFileSync(hookConfig, JSON.stringify({ hooks }, null, 2));
    const url = `${address}/#token=${token}`;
    writeFileSync(
      path.join(directory, "runtime.json"),
      JSON.stringify({ url, address, pid: process.pid }),
      { mode: 0o600 },
    );
    const timer = setInterval(() => {
      const woke = workspace.wake();
      const quiet = monitor.tick(workspace, new Set(terminals.records.keys()));
      if (workspace.retireInactive() || woke || quiet || activityDirty) {
        activityDirty = false;
        broadcast();
      }
    }, 1000);
    timer.unref();
    let closing: Promise<void> | undefined;
    return {
      address,
      url,
      token,
      workspace,
      terminals,
      stateDir: directory,
      close: () =>
        (closing ??= (async () => {
          clearInterval(timer);
          try {
            await startupCleanup();
            workspace.recover();
            transcripts.flush();
            store.save(workspace.snapshot());
          } finally {
            releaseLock();
          }
        })()),
    };
  } catch (error) {
    await startupCleanup();
    releaseLock();
    throw error;
  }
}

function string(value: unknown, maximum = 200): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum)
    throw new Error("Missing or invalid text field.");
  return value;
}

function singleLine(value: unknown, maximum = 200): string {
  const text = string(value, maximum).trim();
  if (/[\0\r\n]/.test(text)) throw new Error("Use single-line text without control characters.");
  return text;
}
