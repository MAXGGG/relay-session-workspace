/* global Terminal, FitAddon */
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
  );
const fragment = new URLSearchParams(location.hash.slice(1));
const token = fragment.get("token") || sessionStorage.getItem("relay-token") || "";
if (token) sessionStorage.setItem("relay-token", token);
if (fragment.has("token")) history.replaceState(null, "", location.pathname);
let snapshot;
let socket;
let attachedId;
let filter = "pending";
let lastMessages = "";
let toastTimer;
let closed = false;
const terminal = new Terminal({
  fontFamily: '"Cascadia Code", Consolas, monospace',
  fontSize: 12,
  lineHeight: 1.35,
  cursorBlink: true,
  screenReaderMode: true,
  scrollback: 3000,
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
terminal.onData((data) => {
  if (attachedId && socket?.readyState === WebSocket.OPEN)
    socket.send(JSON.stringify({ type: "input", sessionId: attachedId, data }));
});
terminal.onResize(({ cols, rows }) => {
  if (attachedId && socket?.readyState === WebSocket.OPEN)
    socket.send(JSON.stringify({ type: "resize", sessionId: attachedId, cols, rows }));
});
new ResizeObserver(() => {
  try {
    fit.fit();
  } catch {
    /* The panel can briefly be hidden. */
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
  if (!response.ok) throw new Error(result.error || "Request failed.");
  if (result.state) render(result);
  return result;
}

function action(route, body) {
  return api(route, body).catch((error) => toast(error.message));
}
function age(time) {
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
  return minutes < 1
    ? "Just now"
    : minutes < 60
      ? `${minutes}m ago`
      : `${Math.floor(minutes / 60)}h ago`;
}

function render(data) {
  snapshot = data;
  const state = data.state;
  const query = $("#session-search").value.toLowerCase();
  $("#session-count").textContent = state.sessions.length;
  $("#sessions").innerHTML = state.sessions
    .filter((session) => `${session.name} ${session.project}`.toLowerCase().includes(query))
    .map(
      (session) =>
        `<button type="button" class="session-card ${state.selectedSessionId === session.id ? "active" : ""}" data-session="${escapeHtml(session.id)}" aria-label="Open ${escapeHtml(session.name)}" aria-pressed="${state.selectedSessionId === session.id}"><span class="session-card-top"><span class="status-dot ${session.status}"></span><span class="session-card-name">${escapeHtml(session.name)}</span></span><span class="session-card-project">${escapeHtml(session.project)}</span><span class="session-card-bottom"><span>${session.status} · P${session.priority}</span><span class="sample-tag">${session.mode === "demo" ? "SAMPLE" : session.mode.toUpperCase()}</span></span></button>`,
    )
    .join("");
  $("#pending-count").textContent = data.queue.length;
  $("#pending-tab-count").textContent = data.queue.length;
  const items =
    filter === "pending"
      ? data.queue
      : state.items
          .filter((item) => item.status === filter)
          .sort((a, b) => b.createdAt - a.createdAt);
  $("#queue").innerHTML = items.length
    ? items
        .map((item) => {
          const session = state.sessions.find((entry) => entry.id === item.sessionId);
          return `<article class="queue-card ${state.selectedItemId === item.id ? "selected" : ""}" data-item-card="${item.id}"><div class="queue-card-top"><span class="kind ${item.kind}">${item.kind === "question" ? "? Question" : item.kind === "review" ? "✓ Ready to review" : "! Needs attention"}</span><select class="priority-select" aria-label="Priority for ${escapeHtml(session.name)}" data-priority="${session.id}">${[1, 2, 3].map((priority) => `<option value="${priority}" ${priority === item.priority ? "selected" : ""}>P${priority}</option>`).join("")}</select></div><button type="button" class="queue-open" data-item="${item.id}"><strong>${escapeHtml(item.title)}</strong><span class="queue-project">${escapeHtml(session.name)} <span>↗</span></span></button><div class="queue-card-meta"><span>${item.confidence === "suggested" ? "Suggested from response" : "Session event"}</span><span>${age(item.createdAt)}</span></div>${item.status !== "resolved" ? `<div class="queue-card-actions"><button type="button" data-resolve="${item.id}">${item.kind === "review" ? "Mark reviewed" : "Mark handled"}</button><button type="button" data-defer="${item.id}">Defer 30m</button></div>` : ""}</article>`;
        })
        .join("")
    : `<div class="empty-queue"><strong>${filter === "pending" ? "All clear." : "Nothing here yet."}</strong>${filter === "pending" ? "New questions and results will appear here." : filter === "snoozed" ? "Deferred items return automatically." : "Handled items will stay available here."}</div>`;
  const messagesKey = JSON.stringify(state.messages);
  if (messagesKey !== lastMessages) {
    lastMessages = messagesKey;
    $("#messages").innerHTML = state.messages
      .map((message) => `<div class="message ${message.role}">${escapeHtml(message.text)}</div>`)
      .join("");
    $("#messages").scrollTop = $("#messages").scrollHeight;
  }
  const session = state.sessions.find((entry) => entry.id === state.selectedSessionId);
  if (session) {
    $("#terminal-name").textContent = session.name;
    $("#terminal-mode").textContent =
      session.mode === "demo" ? "SIMULATED" : session.mode.toUpperCase();
    $("#terminal-path").textContent = `${session.project} / ${session.id}`;
    $("#terminal-path").title = session.cwd;
    $("#terminal-status").textContent = session.status;
    $("#terminal-caption").textContent =
      session.mode === "demo"
        ? "Sample worker · no AI calls"
        : "Your input goes directly to this process.";
    $("#start-session").disabled =
      !["stopped", "error"].includes(session.status) && session.mode !== "demo";
    $("#stop-session").disabled = session.status === "stopped";
    if (socket?.readyState === WebSocket.OPEN && attachedId !== session.id) {
      attachedId = session.id;
      socket.send(JSON.stringify({ type: "attach", sessionId: session.id }));
    }
  }
  const focused = state.items.find((item) => item.id === state.selectedItemId);
  $("#focus-item").hidden = !focused;
  if (focused)
    $("#focus-item").textContent =
      `${focused.status === "resolved" ? "Handled" : `P${focused.priority} · ${focused.kind}`} — ${focused.title}`;
}

function connect() {
  socket = new WebSocket(
    `${location.origin.replace(/^http/, "ws")}/terminal?token=${encodeURIComponent(token)}`,
  );
  socket.addEventListener("open", () => {
    $("#connection").textContent = "● Connected";
    $("#connection").classList.remove("offline");
    attachedId = null;
  });
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.type === "state") render(message);
    else if (message.type === "attached" && message.sessionId === attachedId) {
      terminal.reset();
      terminal.write(message.data);
      if (!message.running)
        terminal.writeln("\r\nSession is stopped. Select Start to launch or resume it.");
      fit.fit();
      socket.send(
        JSON.stringify({
          type: "resize",
          sessionId: attachedId,
          cols: terminal.cols,
          rows: terminal.rows,
        }),
      );
    } else if (message.type === "output" && message.sessionId === attachedId)
      terminal.write(message.data);
    else if (message.type === "exit" && message.sessionId === attachedId)
      terminal.writeln(`\r\n[Process exited: ${message.code}. Session record preserved.]`);
    else if (message.type === "error") toast(message.message);
  });
  socket.addEventListener("close", () => {
    $("#connection").textContent = "Reconnecting…";
    $("#connection").classList.add("offline");
    attachedId = null;
    if (!closed) setTimeout(connect, 2000);
  });
}

$("#sessions").addEventListener("click", (event) => {
  const button = event.target.closest("[data-session]");
  if (button) action("/api/select", { sessionId: button.dataset.session });
});
$("#session-search").addEventListener("input", () => {
  if (snapshot) render(snapshot);
});
$("#queue").addEventListener("click", (event) => {
  const open = event.target.closest("[data-item]");
  const resolve = event.target.closest("[data-resolve]");
  const defer = event.target.closest("[data-defer]");
  if (open) action("/api/select", { itemId: open.dataset.item });
  if (resolve) action("/api/item", { id: resolve.dataset.resolve, action: "resolve" });
  if (defer) action("/api/item", { id: defer.dataset.defer, action: "snooze", minutes: 30 });
});
$("#queue").addEventListener("change", (event) => {
  const select = event.target.closest("[data-priority]");
  if (select)
    action("/api/priority", { sessionId: select.dataset.priority, priority: Number(select.value) });
});
document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    filter = button.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((tab) => {
      tab.classList.toggle("active", tab === button);
    });
    if (snapshot) render(snapshot);
  });
});
document.querySelectorAll("[data-command]").forEach((button) => {
  button.addEventListener("click", () => action("/api/command", { text: button.dataset.command }));
});
$("#next-top").addEventListener("click", () => action("/api/command", { text: "next task" }));
$("#chat-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const text = $("#chat-input").value.trim();
  if (!text) return;
  $("#chat-input").value = "";
  action("/api/command", { text });
});
$("#new-session").addEventListener("click", () => {
  $("#dialog-error").textContent = "";
  $("#session-dialog").showModal();
});
$("#close-dialog").addEventListener("click", () => $("#session-dialog").close());
$("#session-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(event.target));
  try {
    await api("/api/sessions", body);
    $("#session-dialog").close();
    event.target.reset();
  } catch (error) {
    $("#dialog-error").textContent = error.message;
  }
});
$("#start-session").addEventListener("click", async () => {
  const id = snapshot?.state.selectedSessionId;
  if (!id) return;
  attachedId = null;
  await action("/api/start", { sessionId: id });
});
$("#stop-session").addEventListener("click", () => {
  const id = snapshot?.state.selectedSessionId;
  if (
    id &&
    confirm("Stop this terminal process? Its session record and pending queue items will be kept.")
  )
    action("/api/stop", { sessionId: id });
});
window.addEventListener("beforeunload", () => {
  closed = true;
  socket?.close();
});

if (!token) {
  $("#connection").textContent = "Launch link required";
  terminal.writeln(
    "Open the URL printed by `npm start`. It includes a private local access token.",
  );
  toast("Use the full launch link from your terminal to connect.");
} else
  api("/api/state")
    .then(connect)
    .catch((error) => toast(error.message));
