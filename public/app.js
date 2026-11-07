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
let filter = "pending",
  lastMessages = "",
  lastFocus = "",
  lastDraft,
  toastTimer,
  closed = false;
let editingId,
  replyTarget,
  manualTarget,
  notified = new Set(),
  notificationReady = false;
let notifications = localStorage.getItem("relay-notifications") === "on";
const kinds = {
  question: "? Question",
  approval: "! Approval needed",
  review: "✓ Ready to review",
  error: "! Needs attention",
  activity: "◷ Check activity",
};
const rendered = new Map();
function setMarkup(selector, markup) {
  const element = $(selector);
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
  if (attachedId && socket?.readyState === WebSocket.OPEN)
    socket.send(JSON.stringify({ type: "resize", sessionId: attachedId, cols, rows }));
});
new ResizeObserver(() => {
  try {
    fit.fit();
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
  terminal.reset();
  socket.send(JSON.stringify({ type: "attach", sessionId: session.id }));
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
      `Relay · ${fresh.length} new attention item${fresh.length === 1 ? "" : "s"}`,
      { body: `P${item.priority} · ${session.name} · ${kinds[item.kind]}`, tag: "relay-attention" },
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
  snapshot = data;
  const state = data.state;
  announce(data);
  document.title = `${data.queue.length ? `(${data.queue.length}) ` : ""}Relay · Your attention, in order`;
  const query = $("#session-search").value.toLowerCase(),
    archived = $("#show-archived").checked;
  const sessions = state.sessions.filter(
    (s) =>
      (archived || s.archivedAt === undefined) &&
      `${s.name} ${s.project} ${s.id} ${s.cwd} ${s.notes ?? ""}`.toLowerCase().includes(query),
  );
  $("#session-count").textContent = state.sessions.filter((s) => s.archivedAt === undefined).length;
  const sessionsMarkup = sessions.length
    ? sessions
        .map((s) => {
          const count = data.queue.filter((i) => i.sessionId === s.id).length;
          return `<button type="button" class="session-card ${state.selectedSessionId === s.id ? "active" : ""}" data-session="${esc(s.id)}" aria-label="Open ${esc(s.name)}" aria-pressed="${state.selectedSessionId === s.id}"><span class="session-card-top"><span class="status-dot ${s.status}"></span><span class="session-card-name">${esc(s.name)}</span>${count ? `<span class="attention-count">${count}</span>` : ""}</span><span class="session-card-project">${esc(s.project)}</span><span class="session-card-bottom"><span>${s.archivedAt !== undefined ? "archived" : s.status} · P${s.priority}</span><span class="sample-tag">${s.mode === "demo" ? "SAMPLE" : s.mode.toUpperCase()}</span></span></button>`;
        })
        .join("")
    : `<p class="empty-sessions">${state.sessions.length ? "No matching sessions." : "Start your first CLI session below. Existing conversations can be resumed by ID."}</p>`;
  setMarkup("#sessions", sessionsMarkup);
  $("#pending-count").textContent = data.queue.length;
  $("#pending-tab-count").textContent = data.queue.length;
  const items =
    filter === "pending"
      ? data.queue
      : state.items.filter((i) => i.status === filter).sort((a, b) => b.createdAt - a.createdAt);
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
          return `<article class="queue-card ${state.selectedItemId === item.id ? "selected" : ""}" data-item-card="${esc(item.id)}"><div class="queue-card-top"><span class="kind ${item.kind}">${kinds[item.kind]}</span><select class="priority-select" aria-label="Priority for ${esc(session.name)}" data-priority="${esc(session.id)}">${[1, 2, 3].map((p) => `<option value="${p}" ${p === item.priority ? "selected" : ""}>P${p}</option>`).join("")}</select></div><button type="button" class="queue-open" data-item="${esc(item.id)}"><strong>${esc(item.title)}</strong><span class="queue-project">${esc(session.name)} <span>↗</span></span></button><div class="queue-card-meta"><span>${source}</span><span>${age(item.createdAt)}</span></div><div class="queue-card-actions">${item.status !== "resolved" ? `<button type="button" data-resolve="${item.id}">${item.kind === "review" ? "Mark reviewed" : "Mark handled"}</button>${item.status === "snoozed" ? `<button type="button" data-reopen="${item.id}">Bring back</button>` : `<button type="button" data-defer="${item.id}">Defer 30m</button>`}` : `<button type="button" data-reopen="${item.id}">Reopen</button>`}</div></article>`;
        })
        .join("")
    : `<div class="empty-queue"><strong>${filter === "pending" ? "All clear." : "Nothing here yet."}</strong>${filter === "pending" ? "New questions, results, and activity suggestions will appear here." : filter === "snoozed" ? "Deferred items return automatically." : "Handled items stay available here."}</div>`;
  setMarkup("#queue", queueMarkup);
  const key = JSON.stringify(state.messages);
  if (key !== lastMessages) {
    lastMessages = key;
    $("#messages").innerHTML = state.messages.length
      ? state.messages.map((m) => `<div class="message ${m.role}">${esc(m.text)}</div>`).join("")
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
  $("#terminal-status").textContent = live?.stopping ? "stopping" : (session?.status ?? "");
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
      `<details open><summary>${focused.status === "resolved" ? "Handled" : `P${focused.priority} · ${focused.kind}`} — ${esc(focused.title)}</summary><pre>${esc(focused.detail)}</pre><label>Classify as <select id="classify-item" data-id="${focused.id}">${Object.entries(
        kinds,
      )
        .map(
          ([value, label]) =>
            `<option value="${value}" ${focused.kind === value ? "selected" : ""}>${label}</option>`,
        )
        .join("")}</select></label></details>`;
  lastFocus = focusKey;
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
    else if (message.type === "attached" && message.sessionId === requestedId) {
      attachedId = message.sessionId;
      attachedRunId = message.runId;
      requestedRunId = message.runId;
      terminal.reset();
      terminal.write(message.data);
      terminal.options.disableStdin = !message.running;
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
    } else if (
      message.type === "output" &&
      message.sessionId === attachedId &&
      message.runId === attachedRunId
    )
      terminal.write(message.data);
    else if (message.type === "exit" && message.sessionId === attachedId) {
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
  const button = event.target.closest("[data-session]");
  if (button) action("/api/select", { sessionId: button.dataset.session });
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
$("#chat-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = $("#chat-input").value.trim();
  if (!text) return;
  try {
    await api("/api/command", { text });
    $("#chat-input").value = "";
  } catch (error) {
    toast(error.message);
  }
});
function openSessionDialog(session) {
  editingId = session?.id;
  const form = $("#session-form");
  form.reset();
  $("#dialog-error").textContent = "";
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
      "conversationId",
      "quietSeconds",
      "attentionMode",
    ])
      form.elements[name].value =
        session[name] ?? (name === "quietSeconds" ? 15 : name === "attentionMode" ? "manual" : "");
    form.elements.args.value = JSON.stringify(session.args ?? []);
    form.elements.resumeArgs.value = JSON.stringify(session.resumeArgs ?? []);
  }
  $("#session-dialog").showModal();
}
$("#new-session").addEventListener("click", () => openSessionDialog());
$("#edit-session").addEventListener("click", () => openSessionDialog(currentSession()));
$("#close-dialog").addEventListener("click", () => $("#session-dialog").close());
$("#session-form [name=mode]").addEventListener("change", (event) => {
  const mode = event.target.value;
  $("#session-form [name=attentionMode]").value =
    mode === "claude" ? "events" : mode === "shell" ? "manual" : "quiet";
  $("#session-form [name=executable]").placeholder =
    snapshot?.executables?.[mode] || "Auto-detect, or enter the executable path";
});
$("#session-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(event.target));
  $("#session-submit").disabled = true;
  try {
    body.args = JSON.parse(body.args || "[]");
    body.resumeArgs = JSON.parse(body.resumeArgs || "[]");
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
$("#add-attention").addEventListener("click", () => {
  const s = currentSession();
  if (!s) return;
  manualTarget = s.id;
  $("#attention-target").textContent = `${s.name} · ${s.id}`;
  $("#attention-form").reset();
  $("#attention-error").textContent = "";
  $("#attention-dialog").showModal();
});
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
$("#export-output").addEventListener("click", async () => {
  const s = currentSession();
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
});
$("#settings").addEventListener("click", () => {
  $("#settings-form [name=retireAfterDays]").value = snapshot?.state.settings?.retireAfterDays ?? 0;
  $("#settings-error").textContent = "";
  $("#settings-dialog").showModal();
});
$("#settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/settings", {
      retireAfterDays: Number(new FormData(event.target).get("retireAfterDays")),
    });
    $("#settings-dialog").close();
  } catch (error) {
    $("#settings-error").textContent = error.message;
  }
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
  notificationLabel();
  if (!notifications && Notification.permission === "denied")
    toast("Notifications are blocked in browser settings.");
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
