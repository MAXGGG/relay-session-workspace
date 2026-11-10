// Pointer/keyboard panel splitters. Sizes are personal browser preferences.
(() => {
  const workspace = document.querySelector(".workspace");
  const workbench = document.querySelector(".workbench");
  const storageKey = "relay-layout-v1";
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
  } catch {
    /* Reset corrupt preferences. */
  }
  if (!saved || typeof saved !== "object") saved = {};
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const defaults = { sessions: 222, attention: 320, chat: 0.4 };
  const sizes = Object.fromEntries(
    Object.entries(defaults).map(([key, value]) => [
      key,
      typeof saved[key] === "number" && Number.isFinite(saved[key]) ? saved[key] : value,
    ]),
  );
  function paint() {
    const width = workspace.clientWidth;
    const sessions = clamp(sizes.sessions, 170, Math.max(170, width - 600));
    const attention = clamp(sizes.attention, 240, Math.max(240, width - sessions - 380));
    workspace.style.setProperty("--sessions-width", `${sessions}px`);
    workspace.style.setProperty("--attention-width", `${attention}px`);
    const ratio = clamp(sizes.chat, 0.2, 0.75);
    workbench.style.setProperty("--chat-flex", `${ratio}fr`);
    workbench.style.setProperty("--terminal-flex", `${1 - ratio}fr`);
    for (const [id, value, min, max] of [
      ["resize-sessions", sessions, 170, Math.max(170, width - 600)],
      ["resize-attention", attention, 240, Math.max(240, width - sessions - 380)],
      ["resize-workbench", Math.round(ratio * 100), 20, 75],
    ]) {
      const handle = document.getElementById(id);
      handle.setAttribute("aria-valuenow", String(Math.round(value)));
      handle.setAttribute("aria-valuemin", String(min));
      handle.setAttribute("aria-valuemax", String(max));
    }
  }
  const persist = () => localStorage.setItem(storageKey, JSON.stringify(sizes));
  for (const [id, key, panel, axis] of [
    ["resize-sessions", "sessions", ".sessions-panel", "x"],
    ["resize-attention", "attention", ".attention-panel", "x"],
    ["resize-workbench", "chat", ".coordinator-panel", "y"],
  ]) {
    const handle = document.getElementById(id);
    let drag;
    function resize(delta, initial) {
      if (axis === "x") sizes[key] = initial + delta;
      else
        sizes.chat = clamp((initial + delta) / Math.max(1, workbench.clientHeight - 32), 0.2, 0.75);
      paint();
    }
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      handle.focus();
      const bounds = document.querySelector(panel).getBoundingClientRect();
      drag = {
        start: axis === "x" ? event.clientX : event.clientY,
        size: axis === "x" ? bounds.width : bounds.height,
      };
      handle.setPointerCapture(event.pointerId);
      document.body.classList.add(axis === "x" ? "resizing-x" : "resizing-y");
    });
    handle.addEventListener("pointermove", (event) => {
      if (drag) resize((axis === "x" ? event.clientX : event.clientY) - drag.start, drag.size);
    });
    const finish = () => {
      if (!drag) return;
      drag = undefined;
      document.body.classList.remove("resizing-x", "resizing-y");
      persist();
    };
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
    handle.addEventListener("lostpointercapture", finish);
    handle.addEventListener("keydown", (event) => {
      const negative = axis === "x" ? "ArrowLeft" : "ArrowUp";
      const positive = axis === "x" ? "ArrowRight" : "ArrowDown";
      if (![negative, positive, "Home"].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "Home") {
        sizes[key] = defaults[key];
        paint();
      } else {
        const bounds = document.querySelector(panel).getBoundingClientRect();
        resize(
          (event.key === positive ? 1 : -1) * (event.shiftKey ? 40 : 12),
          axis === "x" ? bounds.width : bounds.height,
        );
      }
      persist();
    });
    handle.addEventListener("dblclick", () => {
      sizes[key] = defaults[key];
      paint();
      persist();
    });
  }
  window.addEventListener("relay-reset-layout", () => {
    Object.assign(sizes, defaults);
    paint();
    persist();
  });
  window.addEventListener("resize", paint);
  paint();
})();
