// Gemeinsamer Canvas: Datenmodell, Zeichnen und Live-Synchronisierung (Landing + /canvas/)
const CANVAS_W = 1600;
const CANVAS_H = 1000;
const CANVAS_BG_TOP = "#2c3a2b";
const CANVAS_BG_BOTTOM = "#43674a";
const CANVAS_COLORS = ["#a9a92a", "#e2685a", "#dccfc3", "#14414f", "#5c1c24"];
const CANVAS_COLOR_NAMES = ["Olivgrün", "Koralle", "Sand", "Petrol", "Bordeaux"];

// Stempel in einem 24x24-Raster
const CANVAS_STAMPS = {
  z: (ctx) => {
    ctx.save();
    ctx.scale(0.5, 0.5);
    const bar = (x, y, w) => {
      ctx.beginPath();
      ctx.roundRect(x, y, w, 5.328, 2.664);
      ctx.fill();
    };
    bar(12.148, 4.086, 23.703);
    bar(12.148, 10.485, 23.703);
    bar(12.148, 16.883, 23.703);
    ctx.rotate((-40.788087 * Math.PI) / 180);
    ctx.beginPath();
    ctx.roundRect(-17.573, 38.252, 27.938, 5.328, 2.664);
    ctx.fill();
    ctx.restore();
  },
  flower: (ctx) => {
    for (let i = 0; i < 5; i++) {
      ctx.save();
      ctx.translate(12, 12);
      ctx.rotate((i * Math.PI * 2) / 5);
      ctx.beginPath();
      ctx.ellipse(0, -6, 3.6, 5.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(12, 12, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },
  star: (ctx) => ctx.fill(new Path2D("M12 1.5l3.1 6.8 7.4.8-5.5 5 1.6 7.3L12 17.6l-6.6 3.8 1.6-7.3-5.5-5 7.4-.8z")),
  heart: (ctx) => ctx.fill(new Path2D("M12 21.5s-9-5.6-9-12A5 5 0 0 1 12 6.8 5 5 0 0 1 21 9.5c0 6.4-9 12-9 12z")),
  sun: (ctx) => {
    ctx.beginPath();
    ctx.arc(12, 12, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = ctx.fillStyle;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(12 + Math.cos(a) * 8, 12 + Math.sin(a) * 8);
      ctx.lineTo(12 + Math.cos(a) * 11, 12 + Math.sin(a) * 11);
      ctx.stroke();
    }
  },
  leaf: (ctx) => ctx.fill(new Path2D("M21 3C10 3 4 8.5 4 16c0 1.6.3 3 .9 4.2C6.3 14.5 10.5 10.5 17 8.5c-4.5 3-7.6 6.4-9.2 12.3 1.3.5 2.7.7 4.2.7 7.2 0 9-9.5 9-18.5z")),
  moon: (ctx) => ctx.fill(new Path2D("M20.5 15A9 9 0 0 1 9 3.5 9 9 0 1 0 20.5 15z")),
  mountain: (ctx) => ctx.fill(new Path2D("M1 21L9 6l4.5 8L16 10l7 11z")),
  drop: (ctx) => ctx.fill(new Path2D("M12 2C8 8 5 11.5 5 15.5a7 7 0 0 0 14 0C19 11.5 16 8 12 2z")),
};
const CANVAS_STAMP_NAMES = {
  z: "Z", flower: "Blume", star: "Stern", heart: "Herz", sun: "Sonne",
  leaf: "Blatt", moon: "Mond", mountain: "Berg", drop: "Tropfen",
};

function canvasDrawStamp(ctx, name, x, y, size, color, rot = 0) {
  const fn = CANVAS_STAMPS[name];
  if (!fn) return;
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.translate(-size / 2, -size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.fillStyle = color;
  fn(ctx);
  ctx.restore();
}

function canvasDrawStroke(ctx, d) {
  const p = d.p || [];
  if (p.length < 2) return;
  ctx.save();
  ctx.strokeStyle = d.c;
  ctx.fillStyle = d.c;
  ctx.lineWidth = d.w;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (p.length < 4) {
    ctx.beginPath();
    ctx.arc(p[0], p[1], d.w / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length - 2; i += 2) {
      const mx = (p[i] + p[i + 2]) / 2;
      const my = (p[i + 1] + p[i + 3]) / 2;
      ctx.quadraticCurveTo(p[i], p[i + 1], mx, my);
    }
    ctx.lineTo(p[p.length - 2], p[p.length - 1]);
    ctx.stroke();
  }
  ctx.restore();
}

function canvasDrawShape(ctx, d) {
  ctx.save();
  ctx.strokeStyle = d.c;
  ctx.fillStyle = d.c;
  ctx.lineWidth = d.sw || 6;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const { x, y, w, h } = d;
  ctx.beginPath();
  if (d.f === "rect") ctx.rect(x, y, w, h);
  else if (d.f === "circle") ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
  else if (d.f === "tri") {
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
  } else if (d.f === "line") {
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y + h);
  }
  if (d.fill && d.f !== "line") ctx.fill();
  else ctx.stroke();
  ctx.restore();
}

function canvasDrawText(ctx, d) {
  ctx.save();
  ctx.fillStyle = d.c;
  ctx.font = `700 ${d.size}px Helvetica, "Helvetica Neue", Arial, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.fillText(d.t, d.x, d.y);
  ctx.restore();
}

function canvasDrawItem(ctx, item) {
  const d = item.data;
  if (!d) return;
  if (item.kind === "stroke") canvasDrawStroke(ctx, d);
  else if (item.kind === "stamp") canvasDrawStamp(ctx, d.s, d.x, d.y, d.size, d.c, d.r || 0);
  else if (item.kind === "shape") canvasDrawShape(ctx, d);
  else if (item.kind === "text") canvasDrawText(ctx, d);
}

class CanvasView {
  // mode: "cover" (Hintergrund) oder "contain" (Zeichenseite)
  constructor(el, { mode = "cover", overlay = null } = {}) {
    this.el = el;
    this.ctx = el.getContext("2d");
    this.overlay = overlay;
    this.octx = overlay ? overlay.getContext("2d") : null;
    this.mode = mode;
    this.items = [];
    this.ownNonces = new Set();
    this.scale = 1;
    this.ox = 0;
    this.oy = 0;
    this._raf = 0;
    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.el.clientWidth || window.innerWidth;
    const h = this.el.clientHeight || window.innerHeight;
    this.cssW = w;
    this.cssH = h;
    this.dpr = dpr;
    for (const c of [this.el, this.overlay]) {
      if (!c) continue;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const sx = w / CANVAS_W;
    const sy = h / CANVAS_H;
    this.scale = this.mode === "cover" ? Math.max(sx, sy) : Math.min(sx, sy);
    this.ox = (w - CANVAS_W * this.scale) / 2;
    this.oy = (h - CANVAS_H * this.scale) / 2;
    this.redraw();
  }

  toWorld(clientX, clientY) {
    const r = this.el.getBoundingClientRect();
    return {
      x: (clientX - r.left - this.ox) / this.scale,
      y: (clientY - r.top - this.oy) / this.scale,
    };
  }

  applyTransform(ctx) {
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.translate(this.ox, this.oy);
    ctx.scale(this.scale, this.scale);
  }

  drawBackground() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, this.el.height);
    g.addColorStop(0, CANVAS_BG_TOP);
    g.addColorStop(1, CANVAS_BG_BOTTOM);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.el.width, this.el.height);
    if (this.mode === "contain") {
      this.applyTransform(ctx);
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 2 / this.scale;
      ctx.strokeRect(0, 0, CANVAS_W, CANVAS_H);
    }
  }

  redraw() {
    cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(() => {
      this.drawBackground();
      this.applyTransform(this.ctx);
      if (this.mode === "contain") {
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(0, 0, CANVAS_W, CANVAS_H);
        this.ctx.clip();
      }
      for (const it of this.items) canvasDrawItem(this.ctx, it);
      if (this.mode === "contain") this.ctx.restore();
    });
  }

  clearOverlay() {
    if (!this.octx) return;
    this.octx.setTransform(1, 0, 0, 1, 0, 0);
    this.octx.clearRect(0, 0, this.overlay.width, this.overlay.height);
  }

  drawPreview(item) {
    this.clearOverlay();
    this.applyTransform(this.octx);
    canvasDrawItem(this.octx, item);
  }

  addItem(item) {
    this.items.push(item);
    this.applyTransform(this.ctx);
    canvasDrawItem(this.ctx, item);
  }

  removeById(id) {
    const i = this.items.findIndex((it) => it.id === id);
    if (i < 0) return;
    this.items.splice(i, 1);
    this.redraw();
  }

  async load() {
    const client = getSupabase();
    if (!client) return;
    const all = [];
    for (let from = 0; from < 20000; from += 1000) {
      const { data, error } = await client
        .from("canvas_items")
        .select("id,kind,data")
        .order("created_at", { ascending: true })
        .range(from, from + 999);
      if (error || !data) break;
      all.push(...data);
      if (data.length < 1000) break;
    }
    const fetchedNonces = new Set(all.map((it) => it.data && it.data.n).filter(Boolean));
    const pending = this.items.filter((it) => !it.id && !(it.data && fetchedNonces.has(it.data.n)));
    this.items = [...all, ...pending];
    this.redraw();
  }

  subscribe() {
    const client = getSupabase();
    if (!client) return;
    client
      .channel("canvas-items")
      .on("postgres_changes", { event: "*", schema: "public", table: "canvas_items" }, (payload) => {
        if (payload.eventType === "INSERT") {
          const row = payload.new;
          const mine = this.items.find((it) => it.data && row.data && it.data.n && it.data.n === row.data.n);
          if (mine) {
            mine.id = row.id;
            if (this.onOwnId) this.onOwnId(mine);
            return;
          }
          if (this.items.some((it) => it.id === row.id)) return;
          this.addItem({ id: row.id, kind: row.kind, data: row.data });
        } else if (payload.eventType === "DELETE") {
          this.removeById(payload.old.id);
        }
      })
      .subscribe();
  }
}

function canvasOwnerToken() {
  try {
    let t = localStorage.getItem("canvas_token");
    if (!t) {
      t = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()) + "-" + Math.random().toString(36).slice(2);
      localStorage.setItem("canvas_token", t);
    }
    return t;
  } catch (e) {
    return "session-" + Math.random().toString(36).slice(2) + Date.now();
  }
}
