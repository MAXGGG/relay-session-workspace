/* global Terminal, FitAddon */
const $ = (s) => document.querySelector(s);
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const fragment = new URLSearchParams(location.hash.slice(1));
const token = fragment.get("token") || sessionStorage.getItem("relay-token") || "";
if (token) sessionStorage.setItem("relay-token", token);
if (fragment.has("token")) history.replaceState(null, "", location.pathname);
let snapshot, socket, attachedId, attachedRunId, requestedId, requestedRunId;
let attachRequest = 0,
  terminalWrites = Promise.resolve(),
  restoringTerminal = false;
const writeTerminal = (data) => new Promise((resolve) => terminal.write(data, resolve));
function queueTerminal(operation) {
  terminalWrites = terminalWrites.then(operation).catch(() => {
    restoringTerminal = false;
    terminal.options.disableStdin = true;
    requestedId = null;
    toast("Terminal view needs to reconnect. Select the session again.");
  });
}
let filter = "pending",
  handledPage = 0,
  lastMessages = "",
  lastFocus = "",
  lastDraft,
  toastTimer,
  closed = false;
const handledPageSize = 20;
let editingId,
  replyTarget,
  manualTarget,
  notified = new Set(),
  notificationReady = false;
let notifications =
  (window.zyiDesktop?.preferences["relay-notifications"] ??
    localStorage.getItem("relay-notifications")) === "on";
const kinds = {
  question: "? Question",
  approval: "! Approval needed",
  review: "✓ Ready to review",
  error: "! Needs attention",
  activity: "◷ Check activity",
};
const priorities = { 1: "↑ High", 2: "● Normal", 3: "↓ Low" };
const rendered = new Map();
function setMarkup(selector, markup) {
  const element = $(selector);
  if (element.querySelector(".session-menu[open]") || element.querySelector(".dragging")) return;
  // Background activity must not replace a priority selector while it is open.
  if (element.contains(document.activeElement) && document.activeElement.tagName === "SELECT")
    return;
  if (rendered.get(selector) !== markup) {
    element.innerHTML = markup;
    rendered.set(selector, markup);
  }
}
const terminal = new Terminal({
  allowProposedApi: true,
  fontFamily: '"Cascadia Code", Consolas, monospace',
  fontSize: 12,
  lineHeight: 1.35,
  cursorBlink: true,
  screenReaderMode: true,
  scrollback: 3000,
  disableStdin: true,
  theme: {
    background: "#0e1218",
    foreground: "#bfcbd9",
    cursor: "#b8edb5",
    selectionBackground: "#37523d",
  },
});
const fit = new FitAddon.FitAddon();
terminal.loadAddon(fit);
terminal.open($("#terminal"));
// The server answers device/cursor queries once, including while this UI is closed.
for (const prefix of [undefined, "?", ">"]) {
  for (const final of ["c", "n"]) terminal.parser.registerCsiHandler({ prefix, final }, () => true);
}
for (const code of [4, 10, 11, 12]) {
  terminal.parser.registerOscHandler(code, (data) => data === "?" || data.includes(";?"));
}
for (const intermediates of ["$", "+"])
  terminal.parser.registerDcsHandler({ intermediates, final: "q" }, () => true);
terminal.parser.registerCsiHandler({ prefix: ">", final: "q" }, () => true);
terminal.onData((data) => {
  if (attachedId && attachedRunId && socket?.readyState === WebSocket.OPEN)
    socket.send(
      JSON.stringify({ type: "input", sessionId: attachedId, runId: attachedRunId, data }),
    );
});
terminal.onResize(({ cols, rows }) => {
  if (!restoringTerminal && attachedId && socket?.readyState === WebSocket.OPEN)
    socket.send(JSON.stringify({ type: "resize", sessionId: attachedId, cols, rows }));
});
new ResizeObserver(() => {
  try {
    if (!restoringTerminal) fit.fit();
  } catch {
    /* Panel temporarily hidden. */
  }
}).observe($("#terminal"));
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $("#toast").hidden = true;
  }, 6500);
}
async function api(route, body) {
  const response = await fetch(route, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (result.state) render(result);
  if (!response.ok) throw new Error(result.error || "Request failed.");
  return result;
}
function action(route, body) {
  return api(route, body).catch((error) => toast(error.message));
}
function age(time) {
  const m = Math.max(0, Math.floor((Date.now() - time) / 60000));
  return m < 1
    ? "Just now"
    : m < 60
      ? `${m}m ago`
      : m < 1440
        ? `${Math.floor(m / 60)}h ago`
        : `${Math.floor(m / 1440)}d ago`;
}
function currentSession() {
  return snapshot?.state.sessions.find((s) => s.id === snapshot.state.selectedSessionId);
}
const stateSymbols = {
  working: "↻",
  running: "○",
  ready: "Ⅱ",
  stopping: "…",
  stopped: "■",
  error: "!",
  waiting: "!",
  question: "?",
  approval: "!",
  review: "✓",
  activity: "◇",
  archived: "▤",
};
function sessionStateBadge(status, count, archived, sessionId) {
  const tone = archived ? "archived" : (status.attentionKind ?? status.code);
  const label = archived ? "Archived" : status.label;
  return `<span id="state-${esc(sessionId)}" class="session-state state-${esc(tone)}" data-status="${esc(status.code)}" title="${esc(status.detail)}"><span class="state-icon" aria-hidden="true">${esc(stateSymbols[tone] ?? "○")}</span><span class="state-label">${esc(label)}</span>${count ? `<span class="state-count" aria-label="${count} pending attention item${count === 1 ? "" : "s"}">${count}</span>` : ""}</span>`;
}
function attach(session, live) {
  if (
    socket?.readyState !== WebSocket.OPEN ||
    (requestedId === session.id && requestedRunId === (live?.runId ?? null))
  )
    return;
  requestedId = session.id;
  requestedRunId = live?.runId ?? null;
  attachedId = null;
  attachedRunId = null;
  terminal.options.disableStdin = true;
  socket.send(
    JSON.stringify({ type: "attach", sessionId: session.id, requestId: ++attachRequest }),
  );
}
function announce(data) {
  const fresh = data.queue.filter((item) => !notified.has(item.id));
  if (
    notificationReady &&
    fresh.length &&
    notifications &&
    "Notification" in window &&
    Notification.permission === "granted" &&
    document.visibilityState === "hidden"
  ) {
    const item = fresh[0],
      session = data.state.sessions.find((s) => s.id === item.sessionId);
    const notice = new Notification(
      `Zyi · ${fresh.length} new attention item${fresh.length === 1 ? "" : "s"}`,
      {
        body: `P${esc(item.priority)} · ${session.name} · ${esc(kinds[item.kind])}`,
        tag: "relay-attention",
      },
    );
    notice.onclick = () => {
      window.focus();
      action("/api/select", { itemId: item.id });
      notice.close();
    };
  }
  notified = new Set(data.queue.map((item) => item.id));
  notificationReady = true;
}
function render(data) {
  // HTTP replies and WebSocket events can arrive in a different order from
  // creation. An old reply must not undo an exit, selection, or queue update.
  if (snapshot?.instanceId === data.instanceId && data.revision < snapshot?.revision) return;
  snapshot = data;
  const state = data.state;
  announce(data);
  document.title = `${data.queue.length ? `(${data.queue.length}) ` : ""}Zyi · Your attention, in order`;
  const query = $("#session-search").value.toLowerCase(),
    archived = $("#show-archived").checked;
  const sessions = state.sessions.filter(
    (s) =>
      (archived || s.archivedAt === undefined) &&
      `${s.name} ${s.project} ${s.id} ${s.cwd} ${s.notes ?? ""}`.toLowerCase().includes(query),
  );
  $("#session-count").textContent = state.sessions.filter((s) => s.archivedAt === undefined).length;
  const groups = new Map();
  for (const s of sessions.toSorted((a, b) => Number(!!b.pinned) - Number(!!a.pinned))) {
    const group = s.pinned ? "★ Pinned" : s.group || "Ungrouped";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(s);
  }
  if (!query)
    for (const group of state.groups ?? []) if (!groups.has(group.name)) groups.set(group.name, []);
  const sessionsMarkup = groups.size
    ? [...groups]
        .map(
          ([group, members]) =>
            `<div class="session-group"><div class="group-heading"><h3>${esc(group)}</h3>${group !== "★ Pinned" ? `<button type="button" data-new-group="${esc(group === "Ungrouped" ? "" : group)}" aria-label="New session in ${esc(group)}" title="New session in this group">＋</button>` : ""}</div>${members
              .map((s) => {
                const count = data.queue.filter((i) => i.sessionId === s.id).length;
                const status = data.sessionStatuses?.[s.id] ?? {
                  code: s.status,
                  label: s.status,
                  detail: "",
                };
                const live = data.terminals?.[s.id];
                const menu = (action, text, disabled = false) =>
                  `<button type="button" data-session-action="${action}" ${disabled ? "disabled" : ""}>${text}</button>`;
                return `<article class="session-card priority-${esc(s.priority)} ${state.selectedSessionId === s.id ? "active" : ""}" data-session-id="${esc(s.id)}" data-state="${esc(s.archivedAt !== undefined ? "archived" : (status.attentionKind ?? status.code))}" draggable="true"><button type="button" class="session-open" data-session="${esc(s.id)}" aria-label="Open ${esc(s.name)}" aria-pressed="${state.selectedSessionId === s.id}" aria-describedby="state-${esc(s.id)}"><span class="session-card-top"><span class="session-card-name">${esc(s.name)}</span></span><span class="session-card-project">${esc(s.project)}</span>${sessionStateBadge(status, count, s.archivedAt !== undefined, s.id)}${count && status.code !== "waiting" ? `<span class="session-pending-note">${count} pending attention item${count === 1 ? "" : "s"}</span>` : ""}<span class="session-card-bottom"><span class="priority-badge priority-${esc(s.priority)}" title="Priority ${esc(s.priority)}">${esc(priorities[s.priority])}</span><span class="sample-tag">${s.mode === "demo" ? "SAMPLE" : esc(s.mode.toUpperCase())}</span></span></button><details class="session-menu"><summary aria-label="Actions for ${esc(s.name)}" title="Organize session">⋯</summary><div>${menu("edit", "Rename / edit group")}${menu("pin", s.pinned ? "Unpin" : "Pin to top")}${menu("up", "Move up")}${menu("down", "Move down")}${menu("stop", "Stop terminal", !live || live.stopping)}${menu(s.archivedAt !== undefined ? "restore" : live ? "stop-archive" : "archive", s.archivedAt !== undefined ? "restore" : live ? "Stop & archive" : "Archive session", live?.stopping)}${menu("delete", "Delete saved session…", !!live)}</div></details></article>`;
              })
              .join("")}</div>`,
        )
        .join("")
    : `<p class="empty-sessions">${state.sessions.length ? "No matching sessions." : "Start your first CLI session below. Existing conversations can be resumed by ID."}</p>`;
  setMarkup("#sessions", sessionsMarkup);
  $("#pending-count").textContent = data.queue.length;
  $("#pending-tab-count").textContent = data.queue.length;
  const matchingItems =
    filter === "pending"
      ? data.queue
      : state.items
          .filter((i) => i.status === filter)
          .sort((a, b) =>
            filter === "resolved"
              ? (b.resolvedAt ?? b.createdAt) - (a.resolvedAt ?? a.createdAt) ||
                a.id.localeCompare(b.id)
              : b.createdAt - a.createdAt,
          );
  const history = filter === "resolved";
  const lastPage = Math.max(0, Math.ceil(matchingItems.length / handledPageSize) - 1);
  if (history && handledPage > lastPage) {
    handledPage = lastPage;
    $("#queue").scrollTop = 0;
  }
  const offset = handledPage * handledPageSize;
  const items = history ? matchingItems.slice(offset, offset + handledPageSize) : matchingItems;
  $("#history-pagination").hidden = !history || !matchingItems.length;
  $("#history-range").textContent =
    history && matchingItems.length
      ? `${offset + 1}–${offset + items.length} of ${matchingItems.length}`
      : "";
  $("#history-previous").disabled = handledPage === 0;
  $("#history-next").disabled = handledPage >= lastPage;
  $("#queue-order").textContent = history ? "Recently handled first" : "↑ Priority first";
  $("#queue-retention").textContent = history ? "History is kept" : "Then oldest first";
  const queueMarkup = items.length
    ? items
        .map((item) => {
          const session = state.sessions.find((s) => s.id === item.sessionId);
          const source =
            item.confidence === "manual"
              ? "Added or classified by you"
              : item.confidence === "suggested"
                ? "Suggestion · verify in terminal"
                : "Session event";
          return `<article class="queue-card priority-${esc(item.priority)} ${state.selectedItemId === item.id ? "selected" : ""}" data-item-card="${esc(item.id)}"><div class="queue-card-top"><span class="kind ${esc(item.kind)}">${esc(kinds[item.kind])}</span><select class="priority-select priority-${esc(item.priority)}" aria-label="Priority for ${esc(session.name)}" data-priority="${esc(session.id)}">${[1, 2, 3].map((p) => `<option value="${p}" ${p === item.priority ? "selected" : ""}>${priorities[p]}</option>`).join("")}</select></div><button type="button" class="queue-open" data-item="${esc(item.id)}"><strong>${esc(item.title)}</strong><span class="queue-project">${esc(session.name)} <span>↗</span></span></button><div class="queue-card-meta"><span>${source}</span><span>${history ? `Handled ${age(item.resolvedAt ?? item.createdAt)}` : age(item.createdAt)}</span></div><div class="queue-card-actions">${item.status !== "resolved" ? `<button type="button" data-resolve="${esc(item.id)}">${item.kind === "review" ? "Mark reviewed" : "Mark handled"}</button>${item.status === "snoozed" ? `<button type="button" data-reopen="${esc(item.id)}">Bring back</button>` : `<button type="button" data-defer="${esc(item.id)}">Defer 30m</button>`}` : `<button type="button" data-reopen="${esc(item.id)}">Reopen</button>`}</div></article>`;
        })
        .join("")
    : `<div class="empty-queue"><strong>${filter === "pending" ? "All clear." : "Nothing here yet."}</strong>${filter === "pending" ? "New questions, results, and activity suggestions will appear here." : filter === "snoozed" ? "Deferred items return automatically." : "Handled items stay available here."}</div>`;
  setMarkup("#queue", queueMarkup);
  const key = JSON.stringify(state.messages);
  if (key !== lastMessages) {
    lastMessages = key;
    $("#messages").innerHTML = state.messages.length
      ? state.messages
          .map((m) => `<div class="message ${esc(m.role)}">${esc(m.text)}</div>`)
          .join("")
      : '<div class="message assistant">Start a session, then use “next task” to open the highest-priority item. I can find sessions, organize the queue, and prepare replies for you to send.</div>';
    $("#messages").scrollTop = $("#messages").scrollHeight;
  }
  const session = currentSession(),
    live = session && data.terminals?.[session.id];
  for (const selector of ["#edit-session", "#archive-session", "#add-attention", "#export-output"])
    $(selector).disabled = !session;
  $("#reply-selected").disabled = !live || live.stopping;
  $("#start-session").disabled = !session || !!live || session.archivedAt !== undefined;
  $("#stop-session").disabled = !live || live.stopping;
  $("#archive-session").textContent = session?.archivedAt !== undefined ? "Restore" : "Archive";
  $("#terminal-name").textContent = session?.name ?? "Select a session";
  $("#terminal-mode").textContent = session
    ? session.mode === "demo"
      ? "SIMULATED"
      : session.mode.toUpperCase()
    : "";
  $("#terminal-path").textContent = session
    ? `${session.project} / ${session.id}`
    : "Your original terminal appears here";
  $("#terminal-path").title = session?.cwd ?? "";
  const terminalStatus = data.sessionStatuses?.[session?.id];
  const terminalTone = terminalStatus?.attentionKind ?? terminalStatus?.code;
  $("#terminal-status").textContent = terminalStatus?.label ?? "";
  $("#terminal-status").className = terminalStatus ? `session-state state-${terminalTone}` : "";
  $("#terminal-status").dataset.symbol = stateSymbols[terminalTone] ?? "";
  $("#terminal-status").title = terminalStatus?.detail ?? "";
  $("#terminal-status").setAttribute("aria-label", terminalStatus?.label ?? "");
  $("#claude-details").hidden = session?.mode !== "claude";
  if (session?.mode === "claude") {
    $("#claude-connection").textContent = live
      ? live.lastHook
        ? `● Claude hooks connected · ${live.lastHook.event}`
        : "◌ Waiting for Claude hooks"
      : "Claude resume information";
    $("#claude-diagnostics").textContent = live?.lastHook
      ? `Last signal: ${new Date(live.lastHook.at).toLocaleString()}. Completion creates a review item; question classification from prose is a suggestion.`
      : "Complete Claude's startup and folder-trust prompts. If no signal appears, check /hooks in Claude, then restart the session. Choose Claude Code as the session type; running claude inside a plain Shell does not install Zyi hooks.";
    const conversation = session.conversationId || session.claudeId;
    $("#claude-resume").textContent =
      `${session.cwd}\n${conversation ? (/^[\w-]+$/.test(conversation) ? `claude --resume ${conversation}` : `Conversation: ${conversation}`) : "Conversation ID will appear after Claude sends SessionStart."}\nClaude config folder: ${data.claudeEnvironment?.configDirectory ?? "default"}\n${data.claudeEnvironment?.historyDisabled ? "History is disabled by CLAUDE_CODE_SKIP_PROMPT_HISTORY. Unset it and restart Zyi to save future conversations." : "/resume filters by project. Use the same OS account and Claude config folder outside Zyi."}`;
  }
  $("#terminal-caption").textContent =
    session?.mode === "demo"
      ? "Sample worker · no AI calls"
      : live
        ? "Your input goes directly to this process."
        : "Saved output. Start launches the saved profile.";
  $("#session-note").hidden = !session?.notes;
  $("#session-note").textContent = session?.notes ?? "";
  if (session) attach(session, live);
  else if (requestedId) {
    attachedId = null;
    attachedRunId = null;
    requestedId = null;
    requestedRunId = null;
    terminal.options.disableStdin = true;
    terminal.reset();
  }
  const focused = state.items.find((i) => i.id === state.selectedItemId),
    focusKey = JSON.stringify(focused);
  $("#focus-item").hidden = !focused;
  if (focused && focusKey !== lastFocus)
    $("#focus-item").innerHTML =
      `<details open><summary>${focused.status === "resolved" ? "Handled" : `P${esc(focused.priority)} · ${esc(focused.kind)}`} — ${esc(focused.title)}</summary><pre>${esc(focused.detail)}</pre><label>Classify as <select id="classify-item" data-id="${esc(focused.id)}">${Object.entries(
        kinds,
      )
        .map(
          ([value, label]) =>
            `<option value="${value}" ${focused.kind === value ? "selected" : ""}>${label}</option>`,
        )
        .join("")}</select></label></details>`;
  lastFocus = focusKey;
  const provider = data.coordinator?.provider ?? "commands",
    busy = data.coordinator?.busy;
  $("#coordinator-setup").textContent =
    provider === "commands"
      ? "Commands · set up agent"
      : `${provider === "codex" ? "Codex" : "Claude"} agent · settings`;
  $("#coordinator-status").textContent = busy ? "Thinking and managing your request…" : "";
  $("#coordinator-cancel").hidden = !busy;
  $("#chat-send").disabled = !!busy;
  $("#chat-input").disabled = !!busy;
  $("#coordinator-hint").textContent =
    provider === "commands"
      ? "Commands only. Choose an installed agent in Settings for natural-language requests."
      : "Ask me to find a session or start a task. Uses your signed-in CLI account.";
  if (state.replyDraft && lastDraft !== state.replyDraft.id) {
    lastDraft = state.replyDraft.id;
    openReply(state.replyDraft.sessionId, state.replyDraft.text);
  }
}
function connect() {
  socket = new WebSocket(
    `${location.origin.replace(/^http/, "ws")}/terminal?token=${encodeURIComponent(token)}`,
  );
  socket.addEventListener("open", () => {
    $("#connection").textContent = "● Connected";
    $("#connection").classList.remove("offline");
    requestedId = null;
  });
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.type === "state") render(message);
    else if (message.type === "attached") {
      queueTerminal(async () => {
        if (message.sessionId !== requestedId || message.requestId !== attachRequest) return;
        restoringTerminal = true;
        terminal.reset();
        if (message.cols && message.rows) terminal.resize(message.cols, message.rows);
        await writeTerminal(message.data);
        restoringTerminal = false;
        if (message.sessionId !== requestedId || message.requestId !== attachRequest) return;
        attachedId = message.sessionId;
        attachedRunId = message.runId;
        requestedRunId = message.runId;
        terminal.options.disableStdin = !message.running;
        if (!message.running)
          await writeTerminal("\r\nSession is stopped. Select Start to launch or resume it.\r\n");
        fit.fit();
        if (socket?.readyState !== WebSocket.OPEN || message.requestId !== attachRequest) return;
        socket.send(
          JSON.stringify({
            type: "resize",
            sessionId: attachedId,
            cols: terminal.cols,
            rows: terminal.rows,
          }),
        );
      });
    } else if (message.type === "output") {
      queueTerminal(() => {
        if (
          message.sessionId === requestedId &&
          message.sessionId === attachedId &&
          message.runId === attachedRunId
        )
          return writeTerminal(message.data);
      });
    } else if (message.type === "exit" && message.sessionId === attachedId) {
      terminal.options.disableStdin = true;
      terminal.writeln(`\r\n[Process exited: ${message.code}. Session record preserved.]`);
    } else if (message.type === "error") toast(message.message);
  });
  socket.addEventListener("close", () => {
    $("#connection").textContent = "Reconnecting…";
    $("#connection").classList.add("offline");
    attachedId = null;
    attachedRunId = null;
    requestedId = null;
    terminal.options.disableStdin = true;
    if (!closed) setTimeout(connect, 2000);
  });
}
$("#sessions").addEventListener("click", (event) => {
  const operation = event.target.closest("[data-session-action]");
  if (operation) {
    const id = operation.closest("[data-session-id]").dataset.sessionId;
    operation.closest("details").open = false;
    sessionAction(id, operation.dataset.sessionAction).catch((error) => toast(error.message));
    return;
  }
  const button = event.target.closest("[data-session]");
  if (button) action("/api/select", { sessionId: button.dataset.session });
});
async function sessionAction(id, operation) {
  const session = snapshot.state.sessions.find((s) => s.id === id);
  if (!session) return;
  if (operation === "edit") return openSessionDialog(session);
  if (operation === "pin")
    return api("/api/session", { sessionId: id, action: "update", pinned: !session.pinned });
  if (operation === "stop") return api("/api/stop", { sessionId: id });
  if (operation === "up" || operation === "down") {
    const siblings = snapshot.state.sessions.filter(
      (s) =>
        s.archivedAt === undefined &&
        !!s.pinned === !!session.pinned &&
        (s.pinned || (s.group || "") === (session.group || "")),
    );
    const index = siblings.findIndex((s) => s.id === id);
    if (
      (operation === "up" && index === 0) ||
      (operation === "down" && index === siblings.length - 1)
    )
      return;
    return api("/api/session", {
      sessionId: id,
      action: "move",
      beforeId: operation === "up" ? siblings[index - 1].id : (siblings[index + 2]?.id ?? null),
    });
  }
  if (operation === "delete") {
    const pending = snapshot.state.items.filter(
      (i) => i.sessionId === id && i.status !== "resolved",
    ).length;
    if (
      !confirm(
        `Delete saved session “${session.name}”? This removes its Zyi notes, saved output, and ${pending} unresolved attention item(s). Project files and the agent's own conversation history are kept.`,
      )
    )
      return;
    await api("/api/session", { sessionId: id, action: "delete", confirmName: session.name });
    return toast("Saved session deleted. Project files and agent history were kept.");
  }
  if (
    operation === "stop-archive" &&
    !confirm(
      `Stop and archive “${session.name}”? Notes, output, and pending attention will be kept.`,
    )
  )
    return;
  await api("/api/session", { sessionId: id, action: operation });
  if (operation.includes("archive"))
    toast("Session archived. Find it with Show archived sessions. Pending attention is kept.");
}
let draggingSession;
$("#sessions").addEventListener("dragstart", (event) => {
  const card = event.target.closest("[data-session-id]");
  if (!card || event.target.closest(".session-menu")) return event.preventDefault();
  draggingSession = card.dataset.sessionId;
  card.classList.add("dragging");
  event.dataTransfer.setData("text/plain", draggingSession);
  event.dataTransfer.effectAllowed = "move";
});
$("#sessions").addEventListener("click", (event) => {
  const button = event.target.closest("[data-new-group]");
  if (button) openSessionDialog(undefined, button.dataset.newGroup);
});
$("#sessions").addEventListener("dragover", (event) => {
  if (draggingSession && event.target.closest("[data-session-id]")) event.preventDefault();
});
$("#sessions").addEventListener("drop", async (event) => {
  const target = event.target.closest("[data-session-id]");
  if (!target || !draggingSession) return;
  event.preventDefault();
  const id = draggingSession,
    beforeId = target.dataset.sessionId;
  draggingSession = undefined;
  for (const card of document.querySelectorAll(".dragging")) card.classList.remove("dragging");
  if (id === beforeId) return;
  const other = snapshot.state.sessions.find((s) => s.id === beforeId);
  try {
    await api("/api/session", {
      sessionId: id,
      action: "update",
      group: other.group || "",
      pinned: !!other.pinned,
    });
    await api("/api/session", { sessionId: id, action: "move", beforeId });
  } catch (error) {
    toast(error.message);
  }
});
$("#sessions").addEventListener("dragend", () => {
  draggingSession = undefined;
  for (const card of document.querySelectorAll(".dragging")) card.classList.remove("dragging");
  if (snapshot) render(snapshot);
});
for (const selector of ["#session-search", "#show-archived"])
  $(selector).addEventListener("input", () => {
    if (snapshot) render(snapshot);
  });
$("#queue").addEventListener("click", (event) => {
  const open = event.target.closest("[data-item]");
  if (open) action("/api/select", { itemId: open.dataset.item });
  for (const [attribute, operation] of [
    ["resolve", "resolve"],
    ["defer", "snooze"],
    ["reopen", "reopen"],
  ]) {
    const button = event.target.closest(`[data-${attribute}]`);
    if (button)
      action("/api/item", { id: button.dataset[attribute], action: operation, minutes: 30 });
  }
});
$("#queue").addEventListener("change", (event) => {
  const select = event.target.closest("[data-priority]");
  if (select)
    action("/api/priority", { sessionId: select.dataset.priority, priority: Number(select.value) });
});
$("#focus-item").addEventListener("change", (event) => {
  if (event.target.id === "classify-item")
    action("/api/item", {
      id: event.target.dataset.id,
      action: "classify",
      kind: event.target.value,
    });
});
document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    filter = button.dataset.filter;
    handledPage = 0;
    document.querySelectorAll("[data-filter]").forEach((tab) => {
      tab.classList.toggle("active", tab === button);
    });
    if (snapshot) render(snapshot);
    $("#queue").scrollTop = 0;
  });
});
for (const [selector, delta] of [
  ["#history-previous", -1],
  ["#history-next", 1],
]) {
  $(selector).addEventListener("click", () => {
    handledPage = Math.max(0, handledPage + delta);
    if (snapshot) render(snapshot);
    $("#queue").scrollTop = 0;
  });
}
document.querySelectorAll("[data-command]").forEach((button) => {
  button.addEventListener("click", () => action("/api/command", { text: button.dataset.command }));
});
$("#next-top").addEventListener("click", () => action("/api/command", { text: "next task" }));
$("#chat-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = $("#chat-input").value.trim();
  if (!text) return;
  const id = crypto.randomUUID();
  $("#chat-input").value = "";
  $("#chat-send").disabled = true;
  try {
    const result = await api("/api/chat", { text, id });
    if (result.uiRequest)
      await runCoordinatorUi(result.uiRequest).catch((error) => toast(error.message));
  } catch (error) {
    toast(error.message);
    if (!$("#chat-input").value) $("#chat-input").value = text;
  } finally {
    $("#chat-send").disabled = !!snapshot?.coordinator?.busy;
  }
});
$("#coordinator-cancel").addEventListener("click", () => action("/api/chat/cancel", {}));
$("#coordinator-setup").addEventListener("click", () => $("#settings").click());
function refreshSessionLibrary() {
  const form = $("#session-form"),
    selected = $("#session-template").value;
  $("#session-template").innerHTML =
    '<option value="">Blank session</option>' +
    (snapshot?.state.templates ?? [])
      .map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`)
      .join("");
  $("#session-template").value = selected;
  const groups = snapshot?.state.groups ?? [];
  $("#saved-groups").innerHTML = groups
    .map((g) => `<option value="${esc(g.name)}"></option>`)
    .join("");
  const recents = [...new Set((snapshot?.state.sessions ?? []).map((s) => s.cwd))].filter(
    (cwd) => !groups.some((g) => g.cwd === cwd),
  );
  $("#saved-folder").innerHTML =
    '<option value="">Choose a saved or recent folder…</option>' +
    groups
      .map(
        (g) =>
          `<option value="${esc(g.cwd)}" data-group="${esc(g.name)}">${esc(g.name)} · ${esc(g.cwd)}</option>`,
      )
      .join("") +
    recents.map((cwd) => `<option value="${esc(cwd)}">${esc(cwd)}</option>`).join("");
  $("#forget-group").hidden = !groups.some((g) => g.name === form.elements.group.value);
  $("#delete-template").hidden = !$("#session-template").value;
}
function sessionModeHint() {
  const mode = $("#session-form").elements.mode.value;
  $("#agent-launch-hint").textContent =
    mode === "claude"
      ? "Claude receives this session name and reports work, questions and completed turns to Zyi. Requires a current Claude Code CLI with --name support."
      : mode === "shell"
        ? "A plain shell reports process exits. Choose an agent type above for its built-in attention detection."
        : "Quiet activity is a suggestion. Structured events can be configured in Advanced settings.";
  syncClaudePermission();
}
const claudeBypassFlag = "--dangerously-skip-permissions";
function clearLaunchError() {
  $("#dialog-error").textContent = "";
  for (const name of ["args", "resumeArgs"])
    $("#session-form").elements[name].removeAttribute("aria-invalid");
}
function readArguments(name) {
  const field = $("#session-form").elements[name];
  const label = name === "args" ? "Arguments (JSON array)" : "Custom resume arguments (JSON array)";
  const fail = (message) => {
    field.setAttribute("aria-invalid", "true");
    for (let parent = field.parentElement; parent; parent = parent.parentElement)
      if (parent.tagName === "DETAILS") parent.open = true;
    field.focus();
    throw new Error(`${label}: ${message}`);
  };
  let value;
  try {
    value = JSON.parse(field.value.trim() || "[]");
  } catch {
    return fail(
      'Invalid JSON. Use straight double quotes, commas only between items, and no trailing comma or code fences. Example: ["--model", "opus"]. Leave unused fields empty or enter [].',
    );
  }
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    value.some((arg) => typeof arg !== "string" || arg.length > 8000 || /[\0\r\n]/.test(arg))
  )
    return fail(
      'Expected an array of up to 100 single-line strings. Example: ["--model", "opus"].',
    );
  field.removeAttribute("aria-invalid");
  return value;
}
function syncClaudePermission() {
  const form = $("#session-form"),
    isClaude = form.elements.mode.value === "claude";
  $("#claude-permission-option").hidden = !isClaude;
  let args;
  try {
    args = JSON.parse(form.elements.args.value || "[]");
  } catch {
    args = [];
  }
  $("#claude-skip-permissions").checked =
    isClaude && Array.isArray(args) && args.includes(claudeBypassFlag);
}
$("#claude-skip-permissions").addEventListener("change", (event) => {
  clearLaunchError();
  try {
    const args = readArguments("args").filter((arg) => arg !== claudeBypassFlag);
    if (event.target.checked) args.push(claudeBypassFlag);
    $("#session-form").elements.args.value = JSON.stringify(args);
  } catch (error) {
    $("#dialog-error").textContent = error.message;
  }
  syncClaudePermission();
});
for (const name of ["args", "resumeArgs"])
  $("#session-form").elements[name].addEventListener("input", () => {
    clearLaunchError();
    syncClaudePermission();
  });
function openSessionDialog(session, group) {
  editingId = session?.id;
  const form = $("#session-form");
  form.reset();
  $("#advanced-settings").open = false;
  $("#template-save").open = false;
  $("#group-settings").open = !!session;
  $("#template-picker").hidden = !!session;
  for (const id of ["#saved-folder", "#browse-folder"]) $(id).disabled = !!session;
  $("#browse-folder").hidden = !window.zyiDesktop?.chooseDirectory;
  clearLaunchError();
  $("#session-dialog-title").textContent = session ? "Edit session" : "Start a session";
  $("#session-submit").textContent = session ? "Save session" : "Start session ↗";
  $("#session-dialog-hint").textContent = session
    ? "Names, priorities, and notes update now. Launch settings apply the next time you start this session."
    : "Run an installed CLI on this computer. The original terminal remains available.";
  for (const name of ["cwd", "mode"]) form.elements[name].disabled = !!session;
  if (session) {
    for (const name of [
      "name",
      "cwd",
      "mode",
      "priority",
      "executable",
      "notes",
      "group",
      "conversationId",
      "quietSeconds",
      "attentionMode",
    ])
      form.elements[name].value =
        session[name] ?? (name === "quietSeconds" ? 15 : name === "attentionMode" ? "manual" : "");
    form.elements.args.value = JSON.stringify(session.args ?? []);
    form.elements.resumeArgs.value = JSON.stringify(session.resumeArgs ?? []);
  }
  if (!session && snapshot?.state.settings?.coordinator?.defaultCwd)
    form.elements.cwd.value = snapshot.state.settings.coordinator.defaultCwd;
  if (!session) {
    const selected = currentSession();
    form.elements.group.value = group ?? selected?.group ?? "";
    const saved = snapshot?.state.groups?.find((g) => g.name === form.elements.group.value);
    const groupMember = snapshot?.state.sessions.find((s) => s.group === group);
    form.elements.cwd.value =
      saved?.cwd ||
      (group === undefined ? selected?.cwd : groupMember?.cwd) ||
      form.elements.cwd.value;
  }
  refreshSessionLibrary();
  sessionModeHint();
  $("#session-dialog").showModal();
}
$("#new-session").addEventListener("click", () => openSessionDialog());
$("#edit-session").addEventListener("click", () => openSessionDialog(currentSession()));
$("#close-dialog").addEventListener("click", () => $("#session-dialog").close());
$("#session-form [name=mode]").addEventListener("change", (event) => {
  const mode = event.target.value;
  if (mode !== "claude" && $("#claude-skip-permissions").checked) {
    try {
      $("#session-form").elements.args.value = JSON.stringify(
        readArguments("args").filter((arg) => arg !== claudeBypassFlag),
      );
    } catch (error) {
      $("#dialog-error").textContent = error.message;
    }
  }
  $("#session-form [name=attentionMode]").value =
    mode === "claude" ? "events" : mode === "shell" ? "manual" : "quiet";
  $("#session-form [name=executable]").placeholder =
    snapshot?.executables?.[mode] || "Auto-detect, or enter the executable path";
  if (mode === "custom") $("#advanced-settings").open = true;
  sessionModeHint();
});
$("#session-template").addEventListener("change", () => {
  clearLaunchError();
  const template = snapshot.state.templates?.find((t) => t.id === $("#session-template").value);
  if (template) {
    const form = $("#session-form");
    for (const field of ["mode", "priority", "executable", "attentionMode", "quietSeconds"])
      form.elements[field].value = template[field] ?? "";
    for (const field of ["args", "resumeArgs"])
      form.elements[field].value = JSON.stringify(template[field]);
    $("#template-name").value = template.name;
    $("#advanced-settings").open = template.mode === "custom";
  } else {
    const form = $("#session-form");
    for (const [field, value] of Object.entries({
      mode: "shell",
      priority: "2",
      executable: "",
      attentionMode: "manual",
      quietSeconds: "15",
      args: "[]",
      resumeArgs: "[]",
    }))
      form.elements[field].value = value;
    $("#template-name").value = "";
    $("#advanced-settings").open = false;
  }
  $("#delete-template").hidden = !template;
  sessionModeHint();
});
$("#saved-folder").addEventListener("change", (event) => {
  if (!event.target.value) return;
  const form = $("#session-form");
  form.elements.cwd.value = event.target.value;
  form.elements.group.value = event.target.selectedOptions[0].dataset.group ?? "";
  $("#forget-group").hidden = !form.elements.group.value;
});
$("#session-form [name=group]").addEventListener("change", (event) => {
  const group = snapshot?.state.groups?.find((g) => g.name === event.target.value);
  if (group && !editingId) $("#session-form").elements.cwd.value = group.cwd;
  $("#forget-group").hidden = !group;
});
$("#browse-folder").addEventListener("click", async () => {
  try {
    const directory = await window.zyiDesktop.chooseDirectory();
    if (directory) $("#session-form").elements.cwd.value = directory;
  } catch (error) {
    $("#dialog-error").textContent = error.message;
  }
});
for (const operation of ["save-group", "forget-group", "save-template", "delete-template"]) {
  $(`#${operation}`).addEventListener("click", async () => {
    const form = $("#session-form");
    clearLaunchError();
    try {
      let body;
      if (operation.includes("group"))
        body = {
          action: operation === "forget-group" ? "delete-group" : operation,
          name: form.elements.group.value,
          cwd: form.elements.cwd.value,
        };
      else if (operation === "delete-template")
        body = { action: operation, id: $("#session-template").value };
      else
        body = {
          ...Object.fromEntries(new FormData(form)),
          mode: form.elements.mode.value,
          action: operation,
          id: $("#session-template").value || undefined,
          name: $("#template-name").value,
          args: readArguments("args"),
          resumeArgs: readArguments("resumeArgs"),
        };
      await api("/api/library", body);
      refreshSessionLibrary();
      if (operation === "save-template") {
        const saved =
          snapshot.state.templates.find((t) => t.id === body.id) ?? snapshot.state.templates.at(-1);
        $("#session-template").value = saved.id;
        $("#delete-template").hidden = false;
      }
      $("#dialog-error").textContent = "";
      toast(
        operation.startsWith("save")
          ? "Saved for future sessions."
          : "Removed from saved choices. Existing sessions are kept.",
      );
    } catch (error) {
      $("#dialog-error").textContent = error.message;
    }
  });
}
$("#session-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(event.target));
  $("#session-submit").disabled = true;
  clearLaunchError();
  try {
    body.args = readArguments("args");
    body.resumeArgs = readArguments("resumeArgs");
    body.quietSeconds = Number(body.quietSeconds);
    if (editingId) {
      await api("/api/session", { ...body, sessionId: editingId, action: "update" });
      await api("/api/priority", { sessionId: editingId, priority: Number(body.priority) });
    } else await api("/api/sessions", body);
    $("#session-dialog").close();
  } catch (error) {
    $("#dialog-error").textContent = error.message;
  } finally {
    $("#session-submit").disabled = false;
  }
});
$("#start-session").addEventListener("click", () => {
  if (currentSession()) action("/api/start", { sessionId: currentSession().id });
});
$("#stop-session").addEventListener("click", () => {
  const s = currentSession();
  if (s && confirm(`Stop ${s.name}? Notes, saved output, and pending items will be kept.`))
    action("/api/stop", { sessionId: s.id });
});
$("#archive-session").addEventListener("click", () => {
  const s = currentSession();
  if (s)
    action("/api/session", {
      sessionId: s.id,
      action: s.archivedAt === undefined ? "archive" : "restore",
    });
});
function openReply(id, text = "") {
  const session = snapshot.state.sessions.find((s) => s.id === id),
    live = snapshot.terminals?.[id];
  const item = snapshot.state.items.find(
    (i) => i.id === snapshot.state.selectedItemId && i.sessionId === id,
  );
  if (!live || live.stopping) return toast("Start this session before replying.");
  if (item?.kind === "approval") {
    terminal.focus();
    return toast("Decide this approval in the original terminal.");
  }
  replyTarget = {
    id: crypto.randomUUID(),
    sessionId: id,
    runId: live.runId,
    ...(item ? { itemId: item.id } : {}),
  };
  $("#reply-target").textContent = `${session.name} · ${session.id}`;
  $("#reply-text").value = text;
  $("#reply-error").textContent = "";
  $("#reply-dialog").showModal();
}
$("#reply-selected").addEventListener("click", () => {
  if (currentSession()) openReply(currentSession().id);
});
$("#reply-text").addEventListener("input", () => {
  if (replyTarget) replyTarget.id = crypto.randomUUID();
});
$("#reply-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("#send-reply").disabled = true;
  try {
    const result = await api("/api/reply", { ...replyTarget, text: $("#reply-text").value });
    if (result.delivery.status !== "sent")
      throw new Error(
        `Delivery is ${result.delivery.status}. Inspect the terminal before preparing another reply.`,
      );
    $("#reply-dialog").close();
    toast("Reply sent. The attention item stays open until handled or the agent reports progress.");
  } catch (error) {
    $("#reply-error").textContent = error.message;
  } finally {
    $("#send-reply").disabled = false;
  }
});
document.querySelectorAll("[data-close]").forEach((button) => {
  button.addEventListener("click", () => $(`#${button.dataset.close}`).close());
});
function openAttention(sessionId) {
  const s = snapshot.state.sessions.find((session) => session.id === sessionId);
  if (!s) return;
  manualTarget = s.id;
  $("#attention-target").textContent = `${s.name} · ${s.id}`;
  $("#attention-form").reset();
  $("#attention-error").textContent = "";
  $("#attention-dialog").showModal();
}
$("#add-attention").addEventListener("click", () => openAttention(currentSession()?.id));
$("#attention-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/attention", {
      ...Object.fromEntries(new FormData(event.target)),
      sessionId: manualTarget,
    });
    $("#attention-dialog").close();
  } catch (error) {
    $("#attention-error").textContent = error.message;
  }
});
async function saveOutput(sessionId) {
  const s = snapshot.state.sessions.find((session) => session.id === sessionId);
  if (!s) return;
  try {
    const result = await api(`/api/transcript?sessionId=${encodeURIComponent(s.id)}`);
    const url = URL.createObjectURL(new Blob([result.text], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${s.id}.log`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    toast(error.message);
  }
}
$("#export-output").addEventListener("click", () => saveOutput(currentSession()?.id));
$("#settings").addEventListener("click", () => {
  $("#settings-form [name=retireAfterDays]").value = snapshot?.state.settings?.retireAfterDays ?? 0;
  $("#settings-error").textContent = "";
  const config = snapshot?.state.settings?.coordinator;
  const form = $("#settings-form");
  form.elements.coordinatorProvider.value = config?.provider ?? "auto";
  form.elements.coordinatorCwd.value = config?.defaultCwd ?? "";
  form.elements.coordinatorWorker.value = config?.defaultMode ?? "";
  form.elements.coordinatorExecutable.value = config?.executable ?? "";
  form.elements.coordinatorModel.value = config?.model ?? "";
  $("#settings-dialog").showModal();
});
$("#settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const values = new FormData(event.target);
    await api("/api/settings", {
      retireAfterDays: Number(values.get("retireAfterDays")),
      coordinator: {
        provider: values.get("coordinatorProvider"),
        defaultCwd: values.get("coordinatorCwd"),
        defaultMode: values.get("coordinatorWorker"),
        executable: values.get("coordinatorExecutable"),
        model: values.get("coordinatorModel"),
      },
    });
    $("#settings-dialog").close();
  } catch (error) {
    $("#settings-error").textContent = error.message;
  }
});
$("#reset-layout").addEventListener("click", () => {
  window.dispatchEvent(new Event("relay-reset-layout"));
  toast("Panel sizes reset.");
});
function notificationLabel() {
  $("#notifications").textContent = notifications ? "Notifications on" : "Notifications off";
}
notificationLabel();
$("#notifications").addEventListener("click", async () => {
  if (!("Notification" in window))
    return toast("This browser does not support desktop notifications.");
  notifications = notifications ? false : (await Notification.requestPermission()) === "granted";
  localStorage.setItem("relay-notifications", notifications ? "on" : "off");
  window.zyiDesktop?.setPreference("relay-notifications", notifications ? "on" : "off");
  notificationLabel();
  if (!notifications && Notification.permission === "denied")
    toast("Notifications are blocked in browser settings.");
});
function prefillField(field, value) {
  field.value = value;
  for (let parent = field.parentElement; parent; parent = parent.parentElement)
    if (parent.tagName === "DETAILS") parent.open = true;
}
function prepareSessionForm(request, editing = false) {
  const { values, sessionId } = request;
  const session = editing ? snapshot.state.sessions.find((s) => s.id === sessionId) : undefined;
  if (editing && !session) throw new Error("This session no longer exists.");
  openSessionDialog(session, values.group);
  if (values.templateId) {
    $("#session-template").value = values.templateId;
    $("#session-template").dispatchEvent(new Event("change"));
  }
  const form = $("#session-form");
  if (values.mode && !editing) {
    form.elements.mode.value = values.mode;
    form.elements.mode.dispatchEvent(new Event("change"));
  }
  for (const field of [
    "name",
    "cwd",
    "priority",
    "executable",
    "args",
    "resumeArgs",
    "conversationId",
    "attentionMode",
    "quietSeconds",
    "notes",
    "group",
  ]) {
    if (values[field] !== undefined && !form.elements[field].disabled)
      prefillField(form.elements[field], values[field]);
  }
  if (
    ["executable", "args", "resumeArgs", "conversationId", "attentionMode", "quietSeconds"].some(
      (field) => values[field] !== undefined,
    )
  )
    $("#advanced-settings").open = true;
  if (values.group !== undefined) $("#group-settings").open = true;
  refreshSessionLibrary();
  sessionModeHint();
}

const coordinatorUiHandlers = {
  "new-session": (request) => prepareSessionForm(request),
  "edit-session": (request) => prepareSessionForm(request, true),
  templates: (request) => {
    prepareSessionForm(request);
    if (request.values.templateName !== undefined)
      $("#template-name").value = request.values.templateName;
    $("#template-save").open = true;
    $("#template-name").focus();
  },
  "saved-folder": (request) => {
    prepareSessionForm(request);
    $("#group-settings").open = true;
    $("#session-form [name=group]").dispatchEvent(new Event("change"));
    if (request.values.cwd !== undefined)
      $("#session-form").elements.cwd.value = request.values.cwd;
  },
  "browse-folder": async (request) => {
    prepareSessionForm(request);
    if (!window.zyiDesktop?.chooseDirectory)
      return toast(
        "Enter the project path in the form. The folder picker is available in the desktop app.",
      );
    const directory = await window.zyiDesktop.chooseDirectory();
    if (directory) $("#session-form").elements.cwd.value = directory;
  },
  "delete-session": ({ sessionId }) => sessionAction(sessionId, "delete"),
  "stop-archive": ({ sessionId }) => sessionAction(sessionId, "stop-archive"),
  "session-up": ({ sessionId }) => sessionAction(sessionId, "up"),
  "session-down": ({ sessionId }) => sessionAction(sessionId, "down"),
  "save-output": ({ sessionId }) => saveOutput(sessionId),
  "search-sessions": ({ values }) => {
    if (values.query !== undefined) $("#session-search").value = values.query;
    if (values.showArchived !== undefined)
      $("#show-archived").checked = values.showArchived === "true";
    render(snapshot);
  },
  queue: ({ values }) => {
    if (values.filter) $(`[data-filter="${values.filter}"]`).click();
    if (values.page && filter === "resolved") {
      handledPage = Math.max(0, Number(values.page) - 1);
      render(snapshot);
      $("#queue").scrollTop = 0;
    }
  },
  "add-attention": ({ sessionId, values }) => {
    openAttention(sessionId);
    for (const field of ["kind", "text"])
      if (values[field] !== undefined) $("#attention-form").elements[field].value = values[field];
  },
  settings: ({ values }) => {
    $("#settings").click();
    for (const field of [
      "retireAfterDays",
      "coordinatorProvider",
      "coordinatorCwd",
      "coordinatorWorker",
      "coordinatorExecutable",
      "coordinatorModel",
    ])
      if (values[field] !== undefined)
        prefillField($("#settings-form").elements[field], values[field]);
  },
  notifications: async ({ values }) => {
    const enabled = values.enabled === undefined ? !notifications : values.enabled === "true";
    if (notifications !== enabled) $("#notifications").click();
  },
  layout: ({ values }) => {
    if (!Object.keys(values).length) $("#reset-layout").click();
    else
      window.dispatchEvent(
        new CustomEvent("relay-set-layout", {
          detail: Object.fromEntries(
            Object.entries(values).map(([key, value]) => [key, Number(value)]),
          ),
        }),
      );
  },
  "claude-details": async ({ sessionId, values }) => {
    await api("/api/select", { sessionId });
    if ($("#claude-details").hidden)
      throw new Error("This session has no Claude connection details.");
    $("#claude-details").open = values.expanded !== "false";
  },
  "attention-preview": async ({ itemId, values }) => {
    await api("/api/select", { itemId });
    const details = $("#focus-item details");
    if (details) details.open = values.expanded !== "false";
  },
  "import-workspace": async () => {
    if (!window.zyiDesktop?.importWorkspace)
      throw new Error("Workspace import is available in the desktop app.");
    await window.zyiDesktop.importWorkspace();
  },
  "desktop-menu": async ({ values }) => {
    if (!window.zyiDesktop?.menuAction)
      throw new Error("This menu action is available in the desktop app.");
    await window.zyiDesktop.menuAction(values.operation);
  },
};
let pendingWorkflow;
async function runCoordinatorUi(request) {
  if (!Object.hasOwn(coordinatorUiHandlers, request.flow))
    throw new Error("Unsupported app workflow. Update Zyi and try again.");
  if (document.querySelector("dialog[open]")) {
    pendingWorkflow = request;
    $("#coordinator-workflow").hidden = false;
    toast("Your open form was kept. Finish or close it, then select Open requested app workflow.");
    return;
  }
  if (request.sessionId && !snapshot.state.sessions.some((s) => s.id === request.sessionId))
    throw new Error("The requested session no longer exists.");
  pendingWorkflow = undefined;
  $("#coordinator-workflow").hidden = true;
  await coordinatorUiHandlers[request.flow](request);
}
$("#coordinator-workflow").addEventListener("click", () => {
  if (pendingWorkflow) runCoordinatorUi(pendingWorkflow).catch((error) => toast(error.message));
});
window.addEventListener("beforeunload", () => {
  closed = true;
  socket?.close();
});
if (!token) {
  $("#connection").textContent = "Launch link required";
  terminal.writeln("Open the URL printed by npm start. It includes a private local access token.");
  toast("Use the full launch link from your terminal to connect.");
} else
  api("/api/state")
    .then(connect)
    .catch((error) => {
      $("#connection").textContent = "Launch link required";
      toast(error.message);
    });
