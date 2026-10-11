(function () {
  const mainEl = document.getElementById("cv-main");
  const overlayEl = document.getElementById("cv-overlay");
  const pal = document.getElementById("cv-palette");
  const handle = document.getElementById("cv-handle");
  const textInput = document.getElementById("cv-text-input");
  const ghostFrame = document.getElementById("cv-page-ghost");
  const frameDoc = () => { try { return ghostFrame.contentDocument.documentElement; } catch (e) { return null; } };
  const view = new CanvasView(mainEl, {
    overlay: overlayEl,
    layoutWidth: () => { const d = frameDoc(); return d && d.clientWidth ? d.clientWidth : window.innerWidth; },
  });
  const token = canvasOwnerToken();
  const client = getSupabase();

  const SIZES = {
    pen: [4, 10, 22],
    erase: [18, 44, 96],
    shape: [4, 9, 16],
    stamp: [70, 130, 230],
    text: [36, 64, 110],
  };

  const state = { tool: "hand", color: CANVAS_COLORS[1], size: 1, shape: "rect", fill: true, stamp: "z", rot: 0 };
  const mine = [];

  // ---------- Palette-Aufbau ----------
  const colorsEl = document.getElementById("cv-colors");
  CANVAS_COLORS.forEach((c, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.style.setProperty("--c", c);
    b.title = CANVAS_COLOR_NAMES[i];
    b.setAttribute("aria-label", CANVAS_COLOR_NAMES[i]);
    if (c === state.color) b.classList.add("active");
    b.addEventListener("click", () => {
      state.color = c;
      colorsEl.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
      if (!textInput.classList.contains("d-none")) styleTextInput();
      refreshStampIcons();
    });
    colorsEl.appendChild(b);
  });

  const stampsEl = document.getElementById("cv-sub-stamp");
  Object.keys(CANVAS_STAMPS).forEach((name) => {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.stamp = name;
    b.title = CANVAS_STAMP_NAMES[name];
    if (name === state.stamp) b.classList.add("active");
    const c = document.createElement("canvas");
    c.width = c.height = 28;
    b.appendChild(c);
    b.addEventListener("click", () => {
      state.stamp = name;
      stampsEl.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
    });
    stampsEl.appendChild(b);
  });

  function refreshStampIcons() {
    stampsEl.querySelectorAll("button").forEach((b) => {
      const c = b.firstChild;
      const ctx = c.getContext("2d");
      ctx.clearRect(0, 0, 28, 28);
      const active = b.classList.contains("active");
      ctx.save();
      canvasDrawStamp(ctx, b.dataset.stamp, 14, 14, 24, active ? "#14414f" : state.color);
      ctx.restore();
    });
  }
  stampsEl.addEventListener("click", refreshStampIcons);
  refreshStampIcons();

  const subShape = document.getElementById("cv-sub-shape");
  const subStamp = document.getElementById("cv-sub-stamp");
  const fillBtn = document.getElementById("cv-fill");

  function syncUi() {
    document.querySelectorAll("#cv-tools button").forEach((b) => b.classList.toggle("active", b.dataset.tool === state.tool));
    pal.dataset.tool = state.tool;
    subShape.hidden = state.tool !== "shape";
    subStamp.hidden = state.tool !== "stamp";
    layoutPalette();
  }

  document.getElementById("cv-tools").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-tool]");
    if (!b) return;
    state.tool = b.dataset.tool;
    commitText();
    drawing = null;
    view.clearOverlay();
    syncUi();
  });
  document.getElementById("cv-sizes").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-size]");
    if (!b) return;
    state.size = Number(b.dataset.size);
    document.querySelectorAll("#cv-sizes button").forEach((x) => x.classList.toggle("active", x === b));
    if (!textInput.classList.contains("d-none")) styleTextInput();
  });
  subShape.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-shape]");
    if (!b) return;
    state.shape = b.dataset.shape;
    subShape.querySelectorAll("button[data-shape]").forEach((x) => x.classList.toggle("active", x === b));
  });
  fillBtn.addEventListener("click", () => {
    state.fill = !state.fill;
    fillBtn.setAttribute("aria-pressed", state.fill ? "true" : "false");
  });

  // ---------- Speichern / Rückgängig ----------
  function nonce() {
    const n = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    view.ownNonces.add(n);
    return n;
  }

  function commit(kind, data) {
    data.n = nonce();
    const item = { kind, data };
    view.addItem(item);
    mine.push(item);
    item.ready = client
      ? client.rpc("canvas_add", { p_kind: kind, p_data: data, p_token: token }).then(({ data: id, error }) => {
        if (error) {
          view.items = view.items.filter((i) => i !== item);
          const k = mine.indexOf(item);
          if (k >= 0) mine.splice(k, 1);
          view.redraw();
          console.warn("canvas_add fehlgeschlagen", error.message);
          return;
        }
        if (!item.id) item.id = id;
      })
      : Promise.resolve();
  }

  document.getElementById("cv-undo").addEventListener("click", async () => {
    const item = mine.pop();
    if (!item) return;
    view.items = view.items.filter((i) => i !== item);
    view.redraw();
    await item.ready;
    if (item.id && client) await client.rpc("canvas_undo", { p_id: item.id, p_token: token });
  });

  // ---------- Zeichnen ----------
  let drawing = null;
  const round = (v) => Math.round(v * 10) / 10;

  // ---------- Scrollen ----------
  const touches = new Map();
  let pan = null;
  let pinch = null;
  const touchInfo = () => {
    const pts = [...touches.values()];
    const dx = pts[0].x - pts[1].x;
    const dy = pts[0].y - pts[1].y;
    return { cx: (pts[0].x + pts[1].x) / 2, cy: (pts[0].y + pts[1].y) / 2, dist: Math.hypot(dx, dy) || 1 };
  };
  const pageH = () => { const d = frameDoc(); return d && d.scrollHeight ? d.scrollHeight : 3000; };
  const layoutW = () => { const d = frameDoc(); return d && d.clientWidth ? d.clientWidth : window.innerWidth; };
  const maxScroll = () => Math.max(0, pageH() - window.innerHeight / view.zoom);
  const maxPan = () => Math.max(0, layoutW() - window.innerWidth / view.zoom);
  const zoomLabel = document.getElementById("cv-zoom-reset");
  const thumb = document.querySelector("#cv-scrollbar i");
  function updateThumb() {
    const total = pageH();
    const vh = window.innerHeight;
    const frac = Math.min(1, vh / total);
    thumb.style.height = `${frac * 100}%`;
    thumb.style.top = `${(total > vh ? view.scrollPx / (total - vh) : 0) * (1 - frac) * 100}%`;
    document.getElementById("cv-scrollbar").style.display = total > vh + 4 ? "block" : "none";
  }
  // Ansicht setzen: Zoom (1–5), horizontale Verschiebung und Scrollposition (Seiten-Pixel)
  function setView(zoom, panX, scrollPx) {
    const z = Math.max(1, Math.min(5, zoom));
    view.zoom = z;
    const sy = Math.max(0, Math.min(maxScroll(), scrollPx));
    const sx = Math.max(0, Math.min(maxPan(), panX));
    view.setView(z, sx, sy);
    ghostFrame.style.width = `${layoutW()}px`;
    ghostFrame.style.height = `${window.innerHeight / z}px`;
    ghostFrame.style.transformOrigin = "0 0";
    ghostFrame.style.transform = `scale(${z}) translateX(${-sx}px)`;
    try { ghostFrame.contentWindow.scrollTo(0, sy); } catch (e) { /* ignore */ }
    zoomLabel.textContent = `${Math.round(z * 100)}%`;
    updateThumb();
  }
  function scrollTo(px) { setView(view.zoom, view.panX, px); }
  function zoomAt(newZoom, cx, cy) {
    const z0 = view.zoom;
    const z1 = Math.max(1, Math.min(5, newZoom));
    // Punkt unter (cx, cy) bleibt stehen
    const pageX = cx / z0 + view.panX;
    const pageY = cy / z0 + view.scrollPx;
    setView(z1, pageX - cx / z1, pageY - cy / z1);
  }
  document.getElementById("cv-zoom-in").addEventListener("click", () => zoomAt(view.zoom * 1.4, window.innerWidth / 2, window.innerHeight / 2));
  document.getElementById("cv-zoom-out").addEventListener("click", () => zoomAt(view.zoom / 1.4, window.innerWidth / 2, window.innerHeight / 2));
  zoomLabel.addEventListener("click", () => setView(1, 0, view.scrollPx));
  ghostFrame.addEventListener("load", () => { view.relayout(); setView(view.zoom, view.panX, view.scrollPx); });
  setInterval(() => { view.relayout(); updateThumb(); }, 2500);
  window.addEventListener("resize", () => setTimeout(() => { view.relayout(); setView(view.zoom, view.panX, view.scrollPx); }, 50));
  window.addEventListener("keydown", (e) => {
    if (e.target && e.target.tagName === "INPUT") return;
    const step = window.innerHeight * 0.8;
    if (e.key === "ArrowDown") scrollTo(view.scrollPx + 120);
    else if (e.key === "ArrowUp") scrollTo(view.scrollPx - 120);
    else if (e.key === "PageDown") scrollTo(view.scrollPx + step);
    else if (e.key === "PageUp") scrollTo(view.scrollPx - step);
    else if (e.key === "Home") scrollTo(0);
    else if (e.key === "End") scrollTo(maxScroll());
    else if (e.key === "+" || e.key === "=") zoomAt(view.zoom * 1.25, window.innerWidth / 2, window.innerHeight / 2);
    else if (e.key === "-") zoomAt(view.zoom / 1.25, window.innerWidth / 2, window.innerHeight / 2);
    else if (e.key === "0") setView(1, 0, view.scrollPx);
  });

  overlayEl.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
  overlayEl.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

  let pendingStamp = null;
  overlayEl.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) {
        drawing = null;
        pendingStamp = null;
        view.clearOverlay();
        const t = touchInfo();
        pinch = { dist: t.dist, zoom: view.zoom, cx: t.cx, cy: t.cy, panX: view.panX, scroll: view.scrollPx };
        return;
      }
    }
    if (e.button > 0) return;
    if (state.tool === "hand") {
      overlayEl.setPointerCapture(e.pointerId);
      pan = { x: e.clientX, y: e.clientY, scroll: view.scrollPx, panX: view.panX };
      return;
    }
    const p = view.toWorld(e.clientX, e.clientY);
    if (state.tool === "text") {
      commitText();
      startText(e.clientX, e.clientY, p);
      return;
    }
    commitText();
    overlayEl.setPointerCapture(e.pointerId);
    if (state.tool === "stamp") {
      const data = { s: state.stamp, c: state.color, x: round(p.x), y: round(p.y), size: SIZES.stamp[state.size], r: Math.round(state.rot * 1000) / 1000 };
      if (e.pointerType === "touch") pendingStamp = { id: e.pointerId, data };
      else commit("stamp", data);
      return;
    }
    if (state.tool === "pen" || state.tool === "erase") drawing = { type: state.tool, pts: [round(p.x), round(p.y)] };
    else if (state.tool === "shape") drawing = { type: "shape", x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    if (drawing) previewDrawing();
  });

  overlayEl.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch" && touches.has(e.pointerId)) {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2 && pinch) {
        const t = touchInfo();
        const z1 = Math.max(1, Math.min(5, pinch.zoom * (t.dist / pinch.dist)));
        const pageX = pinch.cx / pinch.zoom + pinch.panX;
        const pageY = pinch.cy / pinch.zoom + pinch.scroll;
        setView(z1, pageX - t.cx / z1, pageY - t.cy / z1);
        return;
      }
    }
    if (pan && state.tool === "hand") {
      setView(view.zoom, pan.panX - (e.clientX - pan.x) / view.zoom, pan.scroll - (e.clientY - pan.y) / view.zoom);
      return;
    }
    if (!drawing) return;
    const p = view.toWorld(e.clientX, e.clientY);
    if (drawing.type === "pen" || drawing.type === "erase") {
      const n = drawing.pts.length;
      const dx = p.x - drawing.pts[n - 2];
      const dy = p.y - drawing.pts[n - 1];
      if (dx * dx + dy * dy < 9) return;
      if (n < 9000) drawing.pts.push(round(p.x), round(p.y));
    } else {
      drawing.x1 = p.x;
      drawing.y1 = p.y;
    }
    previewDrawing();
  });

  function endDrawing(e) {
    if (e && e.pointerId !== undefined) touches.delete(e.pointerId);
    if (pendingStamp && e && e.pointerId === pendingStamp.id) {
      if (e.type === "pointerup" && touches.size === 0) commit("stamp", pendingStamp.data);
      pendingStamp = null;
    }
    if (touches.size < 2) pinch = null;
    pan = null;
    if (!drawing) return;
    const d = drawing;
    drawing = null;
    view.clearOverlay();
    if (d.type === "pen") {
      commit("stroke", { c: state.color, w: SIZES.pen[state.size], p: d.pts });
    } else if (d.type === "erase") {
      commit("stroke", { e: true, w: SIZES.erase[state.size], p: d.pts });
    } else {
      let x = Math.min(d.x0, d.x1);
      let y = Math.min(d.y0, d.y1);
      let w = Math.abs(d.x1 - d.x0);
      let h = Math.abs(d.y1 - d.y0);
      if (state.shape === "line") {
        x = d.x0; y = d.y0; w = d.x1 - d.x0; h = d.y1 - d.y0;
      }
      if (Math.abs(w) < 6 && Math.abs(h) < 6) {
        w = h = SIZES.stamp[state.size] * 0.8;
        x = d.x0 - w / 2;
        y = d.y0 - h / 2;
      }
      commit("shape", { f: state.shape, c: state.color, x: round(x), y: round(y), w: round(w), h: round(h), fill: state.fill, sw: SIZES.shape[state.size] });
    }
  }
  overlayEl.addEventListener("pointerup", endDrawing);
  overlayEl.addEventListener("pointercancel", endDrawing);

  function previewDrawing() {
    if (!drawing) return;
    if (drawing.type === "pen") {
      view.drawPreview({ kind: "stroke", data: { c: state.color, w: SIZES.pen[state.size], p: drawing.pts } });
    } else if (drawing.type === "erase") {
      view.drawPreview({ kind: "stroke", data: { c: "rgba(255,255,255,0.35)", w: SIZES.erase[state.size], p: drawing.pts } });
    } else {
      const d = drawing;
      let x = Math.min(d.x0, d.x1), y = Math.min(d.y0, d.y1);
      let w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0);
      if (state.shape === "line") { x = d.x0; y = d.y0; w = d.x1 - d.x0; h = d.y1 - d.y0; }
      view.drawPreview({ kind: "shape", data: { f: state.shape, c: state.color, x, y, w, h, fill: state.fill, sw: SIZES.shape[state.size] } });
    }
  }

  // ---------- Stempel als Mauszeiger (Mausrad dreht) ----------
  const ghost = document.createElement("canvas");
  ghost.className = "cv-ghost d-none";
  document.body.appendChild(ghost);
  let lastPt = null;
  function drawGhost() {
    const px = Math.max(24, SIZES.stamp[state.size] * view.scale * view.zoom);
    const pad = Math.ceil(px * 0.45);
    const side = Math.ceil(px + pad * 2);
    ghost.width = ghost.height = side;
    ghost.style.width = ghost.style.height = `${side}px`;
    ghost.style.marginLeft = ghost.style.marginTop = `${-side / 2}px`;
    const g = ghost.getContext("2d");
    g.clearRect(0, 0, side, side);
    g.globalAlpha = 0.85;
    canvasDrawStamp(g, state.stamp, side / 2, side / 2, px, state.color, state.rot);
  }
  function updateGhost() {
    const on = state.tool === "stamp" && lastPt;
    ghost.classList.toggle("d-none", !on);
    overlayEl.style.cursor = state.tool === "stamp" ? "none" : state.tool === "text" ? "text" : state.tool === "hand" ? "grab" : "crosshair";
    if (on) {
      drawGhost();
      ghost.style.left = `${lastPt.x}px`;
      ghost.style.top = `${lastPt.y}px`;
    }
  }
  overlayEl.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    lastPt = { x: e.clientX, y: e.clientY };
    if (state.tool === "stamp") {
      ghost.style.left = `${e.clientX}px`;
      ghost.style.top = `${e.clientY}px`;
      if (ghost.classList.contains("d-none")) updateGhost();
    }
  });
  overlayEl.addEventListener("pointerleave", () => ghost.classList.add("d-none"));
  overlayEl.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      zoomAt(view.zoom * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
    } else if (state.tool === "hand" && !e.shiftKey) {
      zoomAt(view.zoom * Math.exp(-e.deltaY * 0.0022), e.clientX, e.clientY);
    } else if (state.tool === "stamp" && !e.altKey) {
      state.rot += (e.deltaY > 0 ? 1 : -1) * (Math.PI / 12);
      updateGhost();
    } else if (e.shiftKey) {
      setView(view.zoom, view.panX + e.deltaY / view.zoom, view.scrollPx);
    } else {
      setView(view.zoom, view.panX + e.deltaX / view.zoom, view.scrollPx + e.deltaY / view.zoom);
    }
  }, { passive: false });
  const origSyncUi = syncUi;
  syncUi = function () { origSyncUi(); updateGhost(); };
  ["cv-colors", "cv-sizes", "cv-sub-stamp"].forEach((id) =>
    document.getElementById(id).addEventListener("click", () => setTimeout(updateGhost, 0)));

  // ---------- Text ----------
  let textAt = null;
  function styleTextInput() {
    const px = SIZES.text[state.size] * view.scale * view.zoom;
    textInput.style.fontSize = `${Math.max(14, px)}px`;
    textInput.style.color = state.color;
  }
  function startText(clientX, clientY, world) {
    textAt = world;
    textInput.value = "";
    textInput.style.left = `${clientX}px`;
    textInput.style.top = `${clientY}px`;
    textInput.classList.remove("d-none");
    styleTextInput();
    setTimeout(() => textInput.focus(), 0);
  }
  function commitText() {
    if (textInput.classList.contains("d-none")) return;
    const t = textInput.value.trim();
    textInput.classList.add("d-none");
    if (t && textAt) commit("text", { t, c: state.color, x: round(textAt.x), y: round(textAt.y), size: SIZES.text[state.size] });
    textAt = null;
  }
  textInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") commitText();
    if (e.key === "Escape") { textInput.value = ""; commitText(); }
  });
  textInput.addEventListener("blur", () => setTimeout(commitText, 100));

  // ---------- Verschiebbare Palette ----------
  const POS_KEY = "canvas_palette";
  let dock = { side: window.innerWidth < 700 ? "bottom" : "left", frac: 0.5 };
  try {
    const saved = JSON.parse(localStorage.getItem(POS_KEY) || "null");
    if (saved && ["top", "bottom", "left", "right"].includes(saved.side)) dock = saved;
  } catch (e) { /* ignore */ }

  function layoutPalette() {
    pal.classList.remove("dock-top", "dock-bottom", "dock-left", "dock-right");
    pal.classList.add(`dock-${dock.side}`);
    pal.style.left = pal.style.right = pal.style.top = pal.style.bottom = "auto";
    const m = 10;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = pal.offsetWidth;
    const h = pal.offsetHeight;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    if (dock.side === "bottom" || dock.side === "top") {
      pal.style.left = `${clamp(dock.frac * vw - w / 2, m, Math.max(m, vw - w - m))}px`;
      pal.style[dock.side] = `${m}px`;
    } else {
      pal.style.top = `${clamp(dock.frac * vh - h / 2, 56, Math.max(56, vh - h - m))}px`;
      pal.style[dock.side] = `${m}px`;
    }
  }

  let drag = null;
  handle.addEventListener("pointerdown", (e) => {
    const r = pal.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    handle.setPointerCapture(e.pointerId);
    handle.classList.add("dragging");
  });
  handle.addEventListener("pointermove", (e) => {
    if (!drag) return;
    pal.style.right = pal.style.bottom = "auto";
    pal.style.left = `${e.clientX - drag.dx}px`;
    pal.style.top = `${e.clientY - drag.dy}px`;
  });
  function endDrag() {
    if (!drag) return;
    drag = null;
    handle.classList.remove("dragging");
    const r = pal.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dists = { left: cx, right: vw - cx, top: cy, bottom: vh - cy };
    const side = Object.keys(dists).sort((a, b) => dists[a] - dists[b])[0];
    dock = { side, frac: side === "left" || side === "right" ? cy / vh : cx / vw };
    layoutPalette();
    try { localStorage.setItem(POS_KEY, JSON.stringify(dock)); } catch (e) { /* ignore */ }
  }
  handle.addEventListener("pointerup", endDrag);
  handle.addEventListener("pointercancel", endDrag);
  window.addEventListener("resize", layoutPalette);

  // ---------- Inhalt-Schatten & Admin-Reset ----------
  const ghostBtn = document.getElementById("cv-ghost-toggle");
  const setGhost = (on) => {
    ghostFrame.classList.toggle("off", !on);
    ghostBtn.classList.toggle("active", on);
    try { localStorage.setItem("canvas_ghost", on ? "1" : "0"); } catch (e) { /* ignore */ }
  };
  try { if (localStorage.getItem("canvas_ghost") === "0") setGhost(false); } catch (e) { /* ignore */ }
  ghostBtn.addEventListener("click", () => setGhost(ghostFrame.classList.contains("off")));

  const ADMIN_EMAIL = "manuelzeltner@gmail.com";
  const resetBtn = document.getElementById("cv-reset");
  function refreshAdmin(session) {
    const mail = session && session.user && session.user.email;
    resetBtn.hidden = mail !== ADMIN_EMAIL;
    layoutPalette();
  }
  if (client) {
    client.auth.getSession().then(({ data }) => refreshAdmin(data.session));
    client.auth.onAuthStateChange((_e, session) => refreshAdmin(session));
  }
  resetBtn.addEventListener("click", async () => {
    if (!confirm("Den ganzen Canvas für ALLE zurücksetzen? Das kann nicht rückgängig gemacht werden.")) return;
    const { error } = await client.rpc("canvas_reset");
    if (error) { alert("Zurücksetzen nicht möglich: " + error.message); return; }
    view.items = [];
    mine.length = 0;
    view.redraw();
  });

  const collapseBtn = document.getElementById("cv-collapse");
  collapseBtn.addEventListener("click", () => {
    const c = pal.classList.toggle("collapsed");
    collapseBtn.textContent = c ? "▴" : "▾";
    collapseBtn.setAttribute("aria-expanded", c ? "false" : "true");
    layoutPalette();
  });

  syncUi();
  updateThumb();

  // ---------- Daten laden + Live ----------
  view.load().then(() => view.subscribe());
})();
