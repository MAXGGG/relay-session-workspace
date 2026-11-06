import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import { coordinate } from "../core/coordinator.ts";
import { seedDemo } from "../core/demo.ts";
import { ingestEvent } from "../core/events.ts";
import type { SessionMode, WorkerEvent } from "../core/types.ts";
import { Workspace } from "../core/workspace.ts";
import { Store } from "./store.ts";
import { findClaude, Terminals } from "./terminals.ts";

export const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

export async function createApp(
  options: { port?: number; stateDir?: string; demo?: boolean; token?: string } = {},
) {
  const directory = options.stateDir ?? path.join(projectRoot, ".relay");
  const store = new Store(directory);
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
  const state = () => {
    const queue = workspace.queue();
    return { state: workspace.snapshot(), queue, claudeAvailable: Boolean(detectedClaude) };
  };
  const intentionalStops = new Set<string>();
  const send = (ws: WebSocket, value: unknown) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value));
  };
  const broadcast = () => {
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
      for (const [ws, current] of selected)
        if (current === sessionId) send(ws, { type: "output", sessionId, data });
    },
    onExit: (sessionId, code) => {
      const session = workspace.session(sessionId);
      const intentional = intentionalStops.delete(sessionId);
      session.status = code === 0 || intentional ? "stopped" : "error";
      if (code !== 0 && !intentional)
        workspace.enqueue(sessionId, {
          kind: "error",
          title: `Terminal exited (${code})`,
          detail: "The terminal process stopped. Pending items and session history are preserved.",
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
    try {
      const started = terminals.start(session);
      if (started && session.mode !== "demo") session.status = "idle";
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
  const server = http.createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'",
    );
    try {
      if (request.headers.host !== new URL(address).host || !allowedOrigin(request.headers.origin))
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
        if (request.method !== "POST")
          return respond(response, 405, { error: "Use POST for this action." });
        const body = await readBody(request);
        switch (url.pathname) {
          case "/api/command":
            coordinate(workspace, string(body.text, 2000));
            break;
          case "/api/select":
            if (body.itemId) workspace.selectItem(string(body.itemId));
            else workspace.selectSession(string(body.sessionId));
            break;
          case "/api/item":
            if (body.action === "resolve") workspace.resolve(string(body.id));
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
            if (mode !== "shell" && mode !== "claude")
              throw new Error("Choose Shell or Claude Code.");
            const executable =
              typeof body.executable === "string" ? body.executable.trim() : undefined;
            const claudeId =
              mode === "claude" && body.claudeId ? string(body.claudeId).trim() : undefined;
            const session = workspace.addSession({
              name: string(body.name, 100),
              project: path.basename(cwd),
              cwd,
              mode,
              priority: Number(body.priority ?? 2) as 1 | 2 | 3,
              executable,
              ...(claudeId ? { claudeId } : {}),
            });
            workspace.selectSession(session.id);
            startTerminal(session.id);
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
            ingestEvent(workspace, sessionId, event);
            break;
          }
          default:
            return respond(response, 404, { error: "Unknown action." });
        }
        broadcast();
        return respond(response, 200, state());
      }
      if (request.method !== "GET") return respond(response, 405, { error: "Method not allowed." });
      const assets: Record<string, string> = {
        "/": "public/index.html",
        "/app.js": "public/app.js",
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
      respond(response, 400, { error: error instanceof Error ? error.message : "Request failed." });
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
          if (session.mode === "demo" && !terminals.records.has(id)) startTerminal(id);
          send(ws, {
            type: "attached",
            sessionId: id,
            data: terminals.output(id),
            running: terminals.records.has(id),
          });
        } else {
          if (selected.get(ws) !== id)
            throw new Error("Attach to this terminal before interacting with it.");
          if (message.type === "input") terminals.write(id, message.data);
          else if (message.type === "resize") terminals.resize(id, message.cols, message.rows);
          else throw new Error("Unknown terminal action.");
        }
      } catch (error) {
        send(ws, { type: "error", message: String(error) });
      }
    });
  });

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
    if (workspace.wake()) broadcast();
  }, 1000);
  timer.unref();
  return {
    address,
    url,
    token,
    workspace,
    terminals,
    stateDir: directory,
    close: async () => {
      clearInterval(timer);
      await terminals.dispose();
      store.save(workspace.snapshot());
      for (const ws of sockets.clients) ws.terminate();
      sockets.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

function string(value: unknown, maximum = 200): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum)
    throw new Error("Missing or invalid text field.");
  return value;
}
