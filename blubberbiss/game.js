(() => {
'use strict';
const cv = document.getElementById('game'), ctx = cv.getContext('2d');
const $ = id => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const pick = a => a[Math.floor(Math.random() * a.length)];

// W/H = Weltgrösse, VW/VH = sichtbarer Ausschnitt. Solo: beides gleich. Multiplayer: feste grosse Welt, Kamera folgt.
let W = 320, H = 180, VW = 320, VH = 180, camX = 0, camY = 0, PS = 3, FLOOR = 150, bg = null, kelp = [], dust = [];
const MPW = 640, MPH = 300;
let zoneIdx = 0, mp = null, frzT = 0;
let darkCv = document.createElement('canvas'), darkCtx = darkCv.getContext('2d');
const START_R = 6, CAP_R = 30;

/* ---------- Paletten ---------- */
const hex = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
const PALS = {
  blue:   {body:'#3f86e0',belly:'#a6dcf7',fin:'#2b5fb0',line:'#0d1f3d',acc:'#ffd34d'},
  orange: {body:'#f2872a',belly:'#ffc98a',fin:'#c4561a',line:'#3a1606',acc:'#fff2dc'},
  green:  {body:'#45b06b',belly:'#b7ebc4',fin:'#2c7d4a',line:'#0c2a17',acc:'#e9f76a'},
  pink:   {body:'#ec6aa4',belly:'#ffc3dc',fin:'#b83f7a',line:'#3b0c22',acc:'#ffffff'},
  purple: {body:'#8a62d9',belly:'#d3c3fb',fin:'#5d3ea8',line:'#1d1040',acc:'#5ff0e0'},
  red:    {body:'#d9443c',belly:'#ffb3a6',fin:'#9e2620',line:'#360806',acc:'#ffe08a'},
  teal:   {body:'#2fb8b0',belly:'#b5f1ea',fin:'#1d7f7e',line:'#06282a',acc:'#ff7a59'},
  shark:  {body:'#6d8197',belly:'#dce6ee',fin:'#536579',line:'#16202c',acc:'#ffffff'},
  puffer: {body:'#f2c14e',belly:'#fbe8b4',fin:'#d9962b',line:'#4a3010',acc:'#8a571a'},
  gold:   {body:'#ffcf3a',belly:'#fff1a8',fin:'#e09a12',line:'#5a3a00',acc:'#ffffff'},
  // Kugelfisch-Varianten für Multiplayer-Spieler
  pcoral: {body:'#ff7a6b',belly:'#ffd0c4',fin:'#d9483f',line:'#4a1410',acc:'#7a1f18'},
  pmint:  {body:'#5fe0b0',belly:'#d0fbe9',fin:'#2fa87e',line:'#0c3a2a',acc:'#16664a'},
  plila:  {body:'#b48cff',belly:'#e8dcff',fin:'#7d55d6',line:'#24124a',acc:'#4a2c96'},
  pblau:  {body:'#5cb8ff',belly:'#d3ecff',fin:'#2f7fd0',line:'#0b2546',acc:'#16508c'},
  prosa:  {body:'#ff8fc8',belly:'#ffe0f0',fin:'#d6559a',line:'#4a0f2c',acc:'#93245f'},
};
const PLAYER_PALS = ['puffer', 'pcoral', 'pmint', 'plila', 'pblau', 'prosa'];
const FISH_PALS = ['blue','orange','green','pink','purple','red','teal'];
const ZONES = [
  {name:'RIFF',             top:[6,24,52], bot:[22,70,110], sand:[32,78,114]},
  {name:'LAGUNE',           top:[3,30,42], bot:[16,92,100], sand:[34,98,100]},
  {name:'VIOLETTER GRABEN', top:[14,12,46],bot:[48,40,112], sand:[58,52,116]},
  {name:'TIEFSEE',          top:[2,8,20],  bot:[10,32,62],  sand:[20,42,70]},
];

/* ---------- Nurija (Easter Egg) ---------- */
// Pro überlebter Begegnung wird sein Gesicht schärfer. Rein kosmetisch, kein Spielvorteil.
const N_RES = [6, 9, 13, 18, 26, 40, 64];
const N_ASPECT = 150 / 96;
const LORE = [
  'Etwas Grosses lebt in der Tiefe.',
  'Ein Schatten mit Brille?',
  'Er hat Hunger. Immer.',
  'Sein Name: N-U-R-I-J-A.',
  'Er frisst alles. Sogar Haie.',
  'Fast scharf. Er schaut dich an.',
  'NURIJA, König des Riffs. Du trägst jetzt seine Brille.',
];
let nStage = 0;
try { nStage = clamp(+localStorage.getItem('blubberbiss-nurija') || 0, 0, 6); } catch (e) {}
let faceImg = null;
const faceCache = new Map();
const faceSrc = new Image();
faceSrc.onload = () => { faceImg = faceSrc; drawAlbum(); };
faceSrc.src = 'nurija.png';
function getFace(stage) {
  if (!faceImg) return null;
  if (faceCache.has(stage)) return faceCache.get(stage);
  const w = N_RES[stage], h = Math.round(w * N_ASPECT);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(faceImg, 0, 0, w, h);
  const id = g.getImageData(0, 0, w, h), d = id.data, q = stage >= 6 ? 12 : stage >= 4 ? 24 : 40;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.round(d[i] / q) * q; d[i+1] = Math.round(d[i+1] / q) * q; d[i+2] = Math.round(d[i+2] / q) * q;
    d[i+3] = d[i+3] > 110 ? 255 : 0;
  }
  g.putImageData(id, 0, 0);
  faceCache.set(stage, c); return c;
}
function drawAlbum() {
  const c = $('album'), g = c.getContext('2d');
  g.imageSmoothingEnabled = false; g.clearRect(0, 0, c.width, c.height);
  $('albumCount').textContent = nStage + '/6';
  $('albumLore').textContent = LORE[nStage];
  const f = getFace(nStage); if (!f) return;
  g.drawImage(f, 0, 0, c.width, c.height);
  if (nStage === 0) {
    g.globalCompositeOperation = 'source-in'; g.fillStyle = '#123a63'; g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#4fd8f0'; g.font = '700 26px Silkscreen, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('?', c.width/2, c.height/2);
  }
}

/* ---------- Sprites ---------- */
const cache = new Map();
function buildFish(rIn, pal, kind, sleepy) {
  const r = Math.max(2, Math.round(rIn * 2) / 2);
  const key = pal + '|' + kind + '|' + (sleepy ? 1 : 0) + '|' + r;
  let s = cache.get(key); if (s) return s;
  if (cache.size > 400) cache.clear();
  const P = {}; for (const k in PALS[pal]) P[k] = hex(PALS[pal][k]);
  const hi = P.body.map(v => Math.min(255, v + 42)), sh = P.body.map(v => v * 0.76 | 0), finD = P.fin.map(v => v * 0.8 | 0);
  let a, b, t, fh;
  if (kind === 'shark') { a = r*1.5; b = r*0.55; t = r*0.75; fh = r*0.75; }
  else if (kind === 'puffer') { a = r; b = r*0.9; t = r*0.42; fh = r*0.22; }
  else { a = r*1.12; b = r*0.72; t = r*0.62; fh = r*0.34; }
  const cx = a + t + 1.5, w = Math.ceil(cx + a + 1.5), h = Math.ceil(b*2 + fh*2 + 4), cy = h / 2;
  const grid = new Uint8Array(w * h);
  const topEdge = px => { const e = (px - cx) / a; return Math.abs(e) < 1 ? cy - b * Math.sqrt(1 - e*e) : cy; };
  const dorsal = kind === 'shark' ? [-0.35, 0.2] : kind === 'puffer' ? [-0.4, 0.05] : [-0.55, 0.2];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = x + .5, py = y + .5, dx = (px - cx) / a, dy = (py - cy) / b;
    const dyy = kind === 'shark' ? dy / (1 - Math.max(0, dx) * 0.32) : dy;
    let v = 0;
    if (dx*dx + dyy*dyy <= 1) v = 1;
    else {
      const tl = t + a*0.2, tx = (cx - a*0.8) - px;
      if (tx > 0 && tx < tl) {
        const rel = tx / tl, sp = b * (0.14 + rel*0.82), ady = Math.abs(py - cy);
        if (ady <= sp && !(rel > 0.6 && ady < (rel - 0.6) * b * 1.4)) v = 2;
      }
      if (!v && py < cy && dx > dorsal[0] && dx < dorsal[1]) {
        const fx = (dx - dorsal[0]) / (dorsal[1] - dorsal[0]);
        const shp = kind === 'shark' ? (fx < 0.65 ? fx / 0.65 : (1 - fx) / 0.35) : Math.sin(Math.PI * fx);
        const te = topEdge(px); if (py > te - fh*shp && py <= te + 1) v = 2;
      }
      if (!v && py > cy && kind !== 'puffer' && dx > -0.2 && dx < 0.2) {
        const fx = (dx + 0.2) / 0.4, be = 2*cy - topEdge(px);
        if (py < be + fh*0.55*Math.sin(Math.PI*fx) && py >= be - 1) v = 2;
      }
    }
    grid[y*w + x] = v;
  }
  const img = new ImageData(w, h), d = img.data;
  const put = (x, y, c, al = 255) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const i = (y*w + x) * 4; d[i] = c[0]; d[i+1] = c[1]; d[i+2] = c[2]; d[i+3] = al; };
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : grid[y*w + x];
  const spotS = Math.max(1, Math.round(r / 7));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = grid[y*w + x]; if (!v) continue;
    const px = x + .5, py = y + .5, dx = (px - cx) / a, dy = (py - cy) / b, ck = (x + y) & 1;
    let c;
    if (r >= 3 && (!at(x-1,y) || !at(x+1,y) || !at(x,y-1) || !at(x,y+1))) c = P.line;
    else if (v === 2) c = (x % 3 === 0) ? finD : P.fin;
    else {
      c = P.body;
      if (dy > 0.34 || (dy > 0.2 && ck)) c = P.belly;
      else if (dy < -0.56 || (dy < -0.42 && ck)) c = hi;
      if (dx < -0.72 && dy < 0.34 && ck) c = sh;
      if (kind === 'stripe' && (Math.abs(dx + 0.28) < 0.11 || Math.abs(dx - 0.3) < 0.1)) c = P.acc;
      if (kind === 'puffer' && dy < 0.3) {
        const hs = ((Math.floor(x/spotS) * 73856093) ^ (Math.floor(y/spotS) * 19349663)) >>> 0;
        if (hs % 7 === 0) c = P.acc;
      }
      if (kind === 'fish' && r >= 6) { const ex = dx + 0.5, ey = dy + 0.05; if (ex*ex + ey*ey < 0.025) c = P.acc; }
      if (r >= 7 && kind !== 'puffer' && Math.abs(px - (cx + a*0.3)) < 0.7 && Math.abs(dy) < 0.55) c = sh;
    }
    put(x, y, c);
  }
  if (r >= 6) { // Brustflosse
    const pcx = cx + a*0.02, pcy = cy + b*0.22, rx = a*0.22, ry = b*0.2;
    for (let y = Math.floor(pcy - ry); y <= pcy + ry; y++) for (let x = Math.floor(pcx - rx); x <= pcx + rx; x++) {
      const ex = (x + .5 - pcx) / rx, ey = (y + .5 - pcy) / ry, q = ex*ex + ey*ey;
      if (q <= 1 && at(x, y) === 1) put(x, y, q > 0.6 ? finD : P.fin);
    }
  }
  const dark = [12,12,22], white = [250,252,255];
  const ex = cx + a*(kind === 'shark' ? 0.6 : 0.5), ey = cy - b*(kind === 'puffer' ? 0.16 : 0.24);
  const er = kind === 'puffer' ? r*0.22 : kind === 'shark' ? r*0.1 : r*0.17;
  const disc = (ox, oy, rr, col) => { for (let y = Math.floor(oy - rr); y <= oy + rr; y++) for (let x = Math.floor(ox - rr); x <= ox + rr; x++) { const qx = x + .5 - ox, qy = y + .5 - oy; if (qx*qx + qy*qy <= rr*rr) put(x, y, col); } };
  if (er < 1.3) put(Math.floor(ex), Math.floor(ey), dark);
  else if (sleepy) { for (let x = Math.floor(ex - er); x <= ex + er; x++) put(x, Math.round(ey), P.line); }
  else if (kind === 'shark') disc(ex, ey, Math.max(1, er), dark);
  else {
    disc(ex, ey, er, white);
    disc(ex + er*0.32, ey + er*0.05, Math.max(0.8, er*0.58), dark);
    if (er >= 2.5) put(Math.floor(ex + er*0.15), Math.floor(ey - er*0.3), white);
  }
  if (kind === 'shark') {
    const my = Math.round(cy + b*0.38);
    for (let x = Math.round(cx + a*0.45); x < cx + a*0.9; x++) if (at(x, my)) { put(x, my, P.line); if (r >= 10 && x % 2 === 0 && at(x, my+1)) put(x, my+1, white); }
  } else {
    const mx = Math.floor(cx + a*0.86), my = Math.round(cy + b*0.18);
    if (at(mx, my)) put(mx, my, P.line);
    if (r >= 8 && at(mx-1, my)) put(mx-1, my, P.line);
  }
  if (kind === 'puffer' && r >= 7) { const bx = Math.floor(cx + a*0.55), by = Math.floor(cy + b*0.3); put(bx, by, [255,140,150]); put(bx+1, by, [255,140,150]); }
  const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(img, 0, 0);
  s = {c, w, h, cx, cy, a, b}; cache.set(key, s); return s;
}

function buildJelly(rIn) {
  const r = Math.max(4, Math.round(rIn)), key = 'jelly|' + r;
  let s = cache.get(key); if (s) return s;
  const w = Math.ceil(r*2 + 2), dh = Math.ceil(r*1.05), h = dh + 3, cx = w/2, by = dh + 1;
  const grid = new Uint8Array(w*h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (x + .5 - cx) / r, dy = (y + .5 - by) / (r*1.05);
    if (dy <= 0 && dx*dx + dy*dy <= 1) grid[y*w + x] = 1;
    else if (y >= by - 1 && y <= by && x % 3 !== 0 && Math.abs(dx) < 0.92) grid[y*w + x] = 2;
  }
  const img = new ImageData(w, h), d = img.data;
  const body = [255,120,180], hiC = [255,205,230], rim = [214,74,150], line = [96,20,64];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = grid[y*w + x]; if (!v) continue;
    const dx = (x + .5 - cx) / r, dy = (y + .5 - by) / (r*1.05), ck = (x + y) & 1;
    const at = (xx, yy) => (xx < 0 || yy < 0 || xx >= w || yy >= h) ? 0 : grid[yy*w + xx];
    let c = body;
    if (v === 2) c = rim;
    else if (!at(x-1,y) || !at(x+1,y) || !at(x,y-1)) c = line;
    else if (dy > -0.25 || (dy > -0.38 && ck)) c = rim;
    else if ((dx < -0.15 && dy < -0.5 && ck) || ((x*7 + y*3) % 11 === 0 && dy < -0.3)) c = hiC;
    const i = (y*w + x) * 4; d[i] = c[0]; d[i+1] = c[1]; d[i+2] = c[2]; d[i+3] = 225;
  }
  const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(img, 0, 0);
  s = {c, w, h, cx, by}; cache.set(key, s); return s;
}

/* ---------- Hintergrund ---------- */
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const BAYER = [0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
const floorAt = x => FLOOR + Math.sin(x*0.045)*2 + Math.sin(x*0.013 + 1)*3;

function makeBG() {
  const z = ZONES[zoneIdx % ZONES.length];
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data, R = mulberry(7);
  const rays = []; for (let i = 0; i < 5; i++) rays.push({x: R()*W*1.3 - W*0.1, w: 8 + R()*24, s: 0.5 + R()*0.5});
  const sandHi = z.sand.map(v => Math.min(255, v + 20)), sandLo = z.sand.map(v => v * 0.75);
  const bands = 12;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y*W + x) * 4, th = BAYER[(y & 3) * 4 + (x & 3)] / 16, fy = floorAt(x);
    let col;
    if (y >= fy) {
      const n = R(), depth = (y - fy) / (H - fy + 1);
      col = y < fy + 1.5 ? sandHi : n < 0.08 ? sandHi : n < 0.18 ? sandLo : z.sand;
      if (((x + y*2) % 11 === 0) && R() < 0.6) col = sandLo;
      col = [col[0] - depth*8, col[1] - depth*10, col[2] - depth*12];
    } else {
      const t = y / FLOOR, lv = clamp(Math.floor(t*bands + th), 0, bands), k = lv / bands;
      col = [z.top[0] + (z.bot[0] - z.top[0])*k, z.top[1] + (z.bot[1] - z.top[1])*k, z.top[2] + (z.bot[2] - z.top[2])*k];
      let ray = 0; const xr = x - y*0.45;
      for (const r of rays) { const dd = Math.abs(xr - r.x) / r.w; if (dd < 1) ray += (1 - dd) * r.s; }
      if (ray * (1 - t) * 0.75 > th) col = [col[0] + 9, col[1] + 18, col[2] + 22];
    }
    d[i] = col[0]; d[i+1] = col[1]; d[i+2] = col[2]; d[i+3] = 255;
  }
  g.putImageData(img, 0, 0);
  const rgb = (arr, f) => 'rgb(' + arr.map(v => Math.min(255, v*f | 0)).join(',') + ')';
  const branch = (x, y, ang, len, w, depth) => {
    const steps = Math.max(2, Math.round(len));
    for (let i = 0; i < steps; i++) { x += Math.cos(ang); y += Math.sin(ang); ang += (R() - 0.5) * 0.22; g.fillRect(Math.round(x - w/2), Math.round(y - w/2), Math.ceil(w), Math.ceil(w)); }
    if (depth > 0) for (let k = 0; k < 2; k++) branch(x, y, ang + (k ? 0.55 : -0.55) + (R() - 0.5)*0.3, len*(0.6 + R()*0.2), Math.max(1, w*0.75), depth - 1);
    else g.fillRect(Math.round(x - w), Math.round(y - w), Math.ceil(w*2), Math.ceil(w*2));
  };
  const rock = (cx, cy, rx, ry) => { for (let y = -Math.ceil(ry); y <= 0; y++) { const hw = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (y*y)/(ry*ry)))); g.fillRect(Math.round(cx - hw), Math.round(cy + y), hw*2 + 1, 1); } };
  const tubes = (x, y) => { const n = 2 + Math.floor(R()*3); let xx = x; for (let i = 0; i < n; i++) { const tw = 5 + Math.floor(R()*4), th2 = H*(0.06 + R()*0.1); g.fillRect(Math.round(xx), Math.round(y - th2), tw, Math.ceil(th2) + 2); g.fillRect(Math.round(xx - 1), Math.round(y - th2), tw + 2, 2); xx += tw + 1; } };
  g.fillStyle = rgb(z.bot, 0.74);
  for (let x = 4; x < W; x += 18 + R()*40) {
    if (R() < 0.5) branch(x, floorAt(x) + 1, -Math.PI/2 + (R() - 0.5)*0.4, H*(0.03 + R()*0.04), 2, 2);
    else rock(x, floorAt(x) + 2, 5 + R()*10, 3 + R()*5);
  }
  g.fillStyle = rgb(z.bot, 0.45);
  const side = (x0, x1) => {
    for (let k = 0; k < 3; k++) {
      const x = x0 + R()*(x1 - x0), q = R();
      if (q < 0.5) branch(x, floorAt(x) + 2, -Math.PI/2 + (R() - 0.5)*0.5, H*(0.06 + R()*0.06), 3, 3);
      else if (q < 0.8) tubes(x, floorAt(x) + 2);
      else rock(x, floorAt(x) + 3, 8 + R()*12, 5 + R()*6);
    }
  };
  side(-4, W*0.2); side(W*0.8, W + 4);
  return c;
}

function makeKelp() {
  const out = [];
  [0.04, 0.11, 0.89, 0.96].forEach(f => { const x = Math.round(W*f); out.push({x, y: floorAt(x) + 2, h: H*rnd(0.26, 0.48), ph: rnd(0, 6)}); });
  return out;
}

/* ---------- Zustand ---------- */
let state = 'title', prevState = 'play', time = 0, score = 0, hi = 0, level = 1, lives = 3, combo = 0, comboT = 0, nextLife = 15000;
let shake = 0, flash = 0, flashCol = '255,60,90', spawnT = 0, bubT = 0, luT = 0, dyingT = 0, overReady = 0, zT = 0, trailT = 0;
let runT = 0, evT = 0, ev = null, lastEv = '', nurija = null, nurijaAt = 0, nurijaDone = false, summon = false, killer = '';
const ents = [], parts = [], pops = [], bubbles = [], streaks = [];
const player = {x: 0, y: 0, vx: 0, vy: 0, r: 11, dir: 1, puff: 0, inv: 0, shield: 0, sleep: true, dead: false};
const tgt = {x: 0, y: 0}, keys = new Set();
let touchLast = null, muted = false, inputMode = 'point';
const EAT_RATIO = 0.9; // nur deutlich kleinere Fische sind fressbar
try { hi = +localStorage.getItem('blubberbiss-hi') || 0; } catch (e) {}
try { muted = localStorage.getItem('blubberbiss-mute') === '1'; } catch (e) {}
// Fressrausch ist persönlich (Goldfisch), unabhängig vom laufenden Ereignis
const frenzy = () => frzT > 0;

function resize() {
  const vw = window.innerWidth, vh = window.innerHeight;
  PS = Math.max(2, Math.round(Math.min(vw, vh) / 180));
  const oldW = W, oldH = H;
  if (mp) {
    // Ausschnitt nie grösser als die Welt: Pixel notfalls gröber machen
    PS = Math.max(PS, Math.ceil(vw / MPW), Math.ceil(vh / MPH));
    VW = Math.ceil(vw / PS); VH = Math.ceil(vh / PS); W = MPW; H = MPH;
    FLOOR = Math.round(H * 0.9);
  } else {
    VW = W = Math.ceil(vw / PS); VH = H = Math.ceil(vh / PS);
    FLOOR = Math.round(H * 0.86);
  }
  cv.width = VW; cv.height = VH; cv.style.width = VW*PS + 'px'; cv.style.height = VH*PS + 'px';
  darkCv.width = VW; darkCv.height = VH;
  ctx.imageSmoothingEnabled = false;
  if (!bg || W !== oldW || H !== oldH) {
    bg = makeBG(); kelp = makeKelp();
    dust = Array.from({length: Math.round(W*H/1400)}, () => ({x: rnd(0, W), y: rnd(0, FLOOR), vx: rnd(-2, 2), vy: rnd(-1.5, 1.5)}));
  }
  player.x = clamp(player.x, player.r, W - player.r); player.y = clamp(player.y, player.r, FLOOR - player.r*0.6);
}
function updateCam() {
  camX = W > VW ? clamp(Math.round(player.x - VW/2), 0, W - VW) : 0;
  camY = H > VH ? clamp(Math.round(player.y - VH/2), 0, H - VH) : 0;
}

/* ---------- Audio ---------- */
let ac = null;
function ensureAudio() { try { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) {} }
function tone(f0, f1, dur, type = 'square', vol = 0.06, delay = 0) {
  if (!ac || muted) return;
  try {
    const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + 0.03);
  } catch (e) {}
}
const sfx = {
  eat: c => tone(260 + c*70, 620 + c*110, 0.08),
  hurt: () => { tone(330, 70, 0.32, 'sawtooth', 0.08); tone(160, 50, 0.3, 'square', 0.05, 0.05); },
  pearl: () => [988, 1319, 1760].forEach((f, i) => tone(f, f, 0.07, 'square', 0.05, i*0.06)),
  shield: () => tone(300, 1400, 0.28, 'triangle', 0.08),
  pop: () => tone(900, 200, 0.15, 'triangle', 0.08),
  level: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f*1.01, 0.1, 'square', 0.06, i*0.09)),
  life: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, f, 0.08, 'triangle', 0.07, i*0.07)),
  start: () => [392, 523, 659].forEach((f, i) => tone(f, f, 0.09, 'square', 0.06, i*0.08)),
  over: () => [523, 415, 330, 220].forEach((f, i) => tone(f, f*0.97, 0.18, 'square', 0.06, i*0.16)),
  scream: () => { tone(160, 820, 0.45, 'sawtooth', 0.09); tone(820, 200, 0.7, 'sawtooth', 0.07, 0.45); tone(90, 60, 1.1, 'square', 0.05); },
  siren: () => { tone(660, 660, 0.17, 'square', 0.05); tone(440, 440, 0.17, 'square', 0.05, 0.2); },
};

/* ---------- Spawning ---------- */
function spawnFish(opt = {}) {
  const p = player, calm = state !== 'play';
  let r, kind = 'fish', pal = opt.pal || pick(FISH_PALS);
  if (opt.r) r = opt.r;
  else if (calm) r = rnd(3, 13);
  else {
    const edibleP = clamp(0.6 - level*0.03, 0.42, 0.6);
    r = Math.random() < edibleP ? p.r*rnd(0.35, 0.82) : p.r*rnd(1.0, 2.3);
  }
  r = clamp(r, 2.5, Math.min(W, H) * 0.28);
  if (!calm && !opt.r && r > p.r*1.4 && r > 12 && Math.random() < 0.6) { kind = 'shark'; pal = 'shark'; }
  else if (opt.kind) kind = opt.kind;
  else if (Math.random() < 0.22) kind = 'stripe';
  const spr = buildFish(r, pal, kind, false);
  const fromLeft = opt.fromLeft ?? Math.random() < 0.5;
  let sp = opt.sp || rnd(22, 44) * (1 + (level - 1)*0.14);
  if (!opt.sp) { if (kind === 'shark') sp *= 1.35; if (r < 5) sp *= 1.2; if (calm) sp *= 0.7; }
  const y = opt.y ?? rnd(12 + spr.h/2, FLOOR - spr.h*0.4);
  const e = {type: 'fish', kind, pal, r, spr, x: fromLeft ? -spr.w - (opt.off || 0) : W + spr.w + (opt.off || 0), y,
    vx: fromLeft ? sp : -sp, dir: fromLeft ? 1 : -1, margin: spr.w + 4 + (opt.off || 0), bobA: rnd(0, 10), bobF: rnd(1, 3), ph: rnd(0, 6)};
  ents.push(e); return e;
}
function spawnSchool() {
  const p = player, calm = state !== 'play';
  const r = calm ? 3.5 : Math.max(2.5, p.r*rnd(0.3, 0.5)), pal = pick(FISH_PALS), fromLeft = Math.random() < 0.5;
  const y = rnd(20, FLOOR - 20), sp = rnd(26, 40), n = 3 + Math.floor(Math.random()*3);
  for (let i = 0; i < n; i++) spawnFish({r, pal, kind: 'fish', fromLeft, sp, y: clamp(y + rnd(-9, 9), 10, FLOOR - 8), off: i*r*3.2});
}
function spawnJelly() {
  const r = clamp(rnd(5, 10) * (1 + (level - 1)*0.08), 4, 18), spr = buildJelly(r);
  ents.push({type: 'jelly', r, spr, x: rnd(W*0.15, W*0.85), y: H + r*3, vy: -rnd(12, 20), ph: rnd(0, 6), squash: 0});
}
function spawnItem(type) {
  const fromLeft = Math.random() < 0.5;
  ents.push({type, r: type === 'pearl' ? 3 : 6, x: fromLeft ? -10 : W + 10, y: rnd(24, FLOOR - 24), vx: (fromLeft ? 1 : -1) * rnd(14, 22), bobA: 4, bobF: 2, ph: rnd(0, 6), margin: 14});
}
function doSpawn() {
  const calm = state !== 'play';
  spawnT = (calm ? 1.5 : Math.max(0.3, 0.95 - level*0.08)) * clamp(300 / W, 0.6, 1.4) * rnd(0.6, 1.3);
  if (nurija && nurija.phase === 'pass') spawnT *= 2;
  const maxE = calm ? 10 : 15 + level*2;
  if (ents.length >= maxE) return;
  const q = Math.random(), j = 0.08 + level*0.012;
  if (!calm && q < j) spawnJelly();
  else if (!calm && q < j + 0.04) spawnItem('pearl');
  else if (!calm && q < j + 0.055 && player.shield <= 0) spawnItem('shield');
  else if (q < 0.25) spawnSchool();
  else spawnFish();
}

/* ---------- Überraschungen ---------- */
function startEvent(type) {
  lastEv = type;
  if (type === 'current') {
    const dir = Math.random() < 0.5 ? -1 : 1;
    ev = {type, t: 7, max: 7, dir};
    banner('STRÖMUNG!', dir > 0 ? 'ES ZIEHT NACH RECHTS' : 'ES ZIEHT NACH LINKS');
    tone(120, 70, 0.8, 'triangle', 0.09);
  } else if (type === 'gold') {
    const e = spawnFish({r: Math.max(3, player.r*0.55), pal: 'gold', kind: 'fish', sp: 72});
    e.gold = true; e.bobA = 45; e.bobF = 4;
    ev = {type, t: 12, max: 12, fish: e};
    banner('GOLDFISCH!', 'FANG IHN');
    sfx.pearl();
  } else {
    ev = {type: 'dark', t: 8, max: 8};
    banner('LICHT AUS!', 'NUR DIE AUGEN LEUCHTEN');
    tone(420, 60, 0.9, 'square', 0.06);
  }
}
function endEvent() { ev = null; evT = rnd(15, 24); }
function evFade() { return ev ? Math.min(1, (ev.max - ev.t) * 2, ev.t * 2) : 0; }

function startNurija() {
  nurijaDone = true;
  const h = Math.min(H*0.5, W*0.55*N_ASPECT), w = h / N_ASPECT, dir = Math.random() < 0.5 ? 1 : -1;
  nurija = {isNurija: true, phase: 'warn', t: 2.4, dir, w, h, x: dir > 0 ? -w*0.2 : W + w*0.2,
    y: clamp(player.y, h*0.45, FLOOR - h*0.4), sirenT: 0, ph: 0};
  banner('NURIJA KOMMT!', nStage >= 6 ? 'DER KÖNIG DES RIFFS' : 'BEGEGNUNG ' + (nStage + 1) + ' VON 6');
}
function updateNurija(dt) {
  if (mp) { updateNurijaMP(); return; }
  const n = nurija; if (!n) return;
  n.ph += dt;
  if (n.phase === 'warn') {
    n.t -= dt; n.sirenT -= dt;
    if (n.sirenT <= 0) { n.sirenT = 0.42; sfx.siren(); }
    n.y += clamp(player.y - n.y, -1, 1) * 30 * dt; n.y = clamp(n.y, n.h*0.45, FLOOR - n.h*0.4);
    if (n.t <= 0) { n.phase = 'pass'; shake = 6; sfx.scream(); }
    return;
  }
  const speed = (W + n.w*1.4) / 4.6;
  n.x += n.dir * speed * dt;
  n.y += clamp(player.y - n.y, -1, 1) * 16 * dt; n.y = clamp(n.y, n.h*0.42, FLOOR - n.h*0.38);
  shake = Math.max(shake, 1.2);
  const rx = n.w*0.42, ry = n.h*0.44;
  for (const e of ents) {
    if (e.dead) continue;
    const dx = e.x - n.x, dy = e.y - n.y;
    if (dx*dx/(rx*rx) + dy*dy/(ry*ry) < 1) {
      e.dead = true; burst(e.x, e.y, e.pal ? PALS[e.pal].body : '#ff7eb6', 6);
      if (Math.random() < 0.5) popup(e.x, e.y, 'MAMPF', '#ffffff');
    }
  }
  if (Math.random() < dt*10) bubbles.push({x: n.x + rnd(-rx, rx), y: n.y + rnd(-ry, ry)*0.5, s: 2, vy: rnd(14, 26), ph: rnd(0, 6)});
  if (state === 'play') {
    const p = player, dx = p.x - n.x, dy = p.y - n.y, prx = rx + p.r*0.6, pry = ry + p.r*0.6;
    if (dx*dx/(prx*prx) + dy*dy/(pry*pry) < 1) hurt(n);
  }
  if ((n.dir > 0 && n.x > W + n.w*0.8) || (n.dir < 0 && n.x < -n.w*0.8)) {
    nurija = null;
    if (state === 'play' || state === 'levelup') {
      score += 1500;
      if (nStage < 6) { nStage++; try { localStorage.setItem('blubberbiss-nurija', String(nStage)); } catch (e) {} drawAlbum(); }
      banner('ÜBERLEBT!', nStage >= 6 ? 'ALBUM KOMPLETT · +1500' : 'NURIJA-ALBUM ' + nStage + '/6 · +1500');
      sfx.life(); evT = rnd(14, 22);
    }
  }
}

/* ---------- Effekte ---------- */
function burst(x, y, col, n, spd = 40) {
  for (let i = 0; i < n; i++) { const a = Math.random()*6.283, s = rnd(spd*0.3, spd); parts.push({x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s, life: rnd(0.3, 0.7), c: col, s: Math.random() < 0.3 ? 2 : 1}); }
}
function popup(x, y, t, c, size = 8) { pops.push({x, y, t, c, life: 1, max: 1, vx: 0, size}); }

/* ---------- Spielmechanik ---------- */
function eat(e) {
  const p = player; e.dead = true;
  combo = comboT > 0 ? Math.min(combo + 1, 8) : 1; comboT = 1.8;
  const pts = Math.round((10 + e.r*e.r*1.2) / 5) * 5 * combo * (1 + (level - 1)*0.5) * (frenzy() ? 2 : 1) | 0;
  score += pts;
  popup(e.x, e.y - e.r, '+' + pts, combo > 1 ? '#ffd25a' : '#ffffff');
  const gr = Math.min(e.r, p.r*0.9);
  p.r = Math.min(CAP_R, Math.sqrt(p.r*p.r + gr*gr*0.15)); p.puff = 0.22;
  burst(e.x, e.y, e.pal ? PALS[e.pal].body : '#ff7eb6', 6 + Math.min(10, e.r | 0));
  sfx.eat(combo);
  if (mp) mpSend('eat', {id: e.id, g: e.gold ? 1 : 0});
  else if (p.r >= CAP_R - 0.01) levelUp();
}
function startFrenzy() {
  frzT = 6; banner('FRESSRAUSCH!', mp ? 'ALLES IST ESSBAR · AUCH GLEICH GROSSE' : 'ALLES IST ESSBAR · PUNKTE x2');
  sfx.level(); flash = 1; flashCol = '255,210,90';
}
function hurt(src) {
  const p = player; if (p.inv > 0) return;
  const kx = Math.sign(p.x - src.x) || 1;
  p.vx = kx*95; p.vy = (p.y < src.y ? -1 : 1) * 45; tgt.x = p.x + kx*28; tgt.y = p.y;
  if (p.shield > 0) { p.shield = 0; p.inv = 1; sfx.pop(); burst(p.x, p.y, '#9ff3ff', 14, 55); return; }
  if (mp) { mpHurt(src); return; }
  killer = src.isNurija ? 'nurija' : '';
  lives--; p.inv = 1.6; shake = 4; flash = 1; flashCol = '255,60,90'; combo = 0; comboT = 0;
  sfx.hurt(); burst(p.x, p.y, '#f2c14e', 10, 50);
  if (lives <= 0) { state = 'dying'; dyingT = 1.6; p.dead = true; sfx.over(); }
}
function collect(e) {
  const p = player; e.dead = true;
  if (mp) mpSend('eat', {id: e.id});
  if (e.type === 'pearl') { const pts = 250 * level; score += pts; popup(e.x, e.y - 6, '+' + pts, '#ffd25a'); burst(e.x, e.y, '#fff4d0', 10, 45); sfx.pearl(); }
  else { p.shield = 8; popup(p.x, p.y - p.r - 6, 'SCHILD!', '#8ff4ff'); burst(e.x, e.y, '#8ff4ff', 12, 45); sfx.shield(); }
}
function levelUp() {
  state = 'levelup'; luT = 2.4; level++; zoneIdx = level - 1;
  const bonus = 1000 * (level - 1); score += bonus;
  flash = 1; flashCol = '255,255,255';
  banner('LEVEL ' + level, ZONES[(level - 1) % ZONES.length].name + ' · +' + bonus);
  sfx.level();
  for (const e of ents) e.flee = true;
  bg = makeBG();
}
function collide() {
  const p = player;
  for (const e of ents) {
    if (state !== 'play') return;
    if (e.dead || e.flee) continue;
    const dx = p.x - e.x, dy = p.y - e.y;
    if (e.type === 'fish') {
      const rx = e.spr.a*0.82 + p.r*0.78, ry = e.spr.b*0.82 + p.r*0.72;
      if (dx*dx/(rx*rx) + dy*dy/(ry*ry) < 1) {
        if (e.gold) { eat(e); startFrenzy(); }
        else if (frenzy() || e.r < p.r*EAT_RATIO) eat(e);
        else hurt(e);
      }
    } else if (e.type === 'jelly') {
      const ddy = p.y - (e.y + e.r*0.25), rx = e.r*0.85 + p.r*0.7, ry = e.r*1.25 + p.r*0.7;
      if (dx*dx/(rx*rx) + ddy*ddy/(ry*ry) < 1) { if (frenzy()) eat(e); else hurt(e); }
    } else {
      const rr = (e.type === 'pearl' ? 4 : 7) + p.r*0.8;
      if (dx*dx + dy*dy < rr*rr) collect(e);
    }
  }
}

function moveEnt(e, dt) {
  if (e.net) { moveNetEnt(e); return; }
  e.ph += dt;
  if (e.flee) {
    if (e.type === 'jelly') e.y -= 70*dt;
    else { const d = e.x < player.x ? -1 : 1; e.vx += (d*160 - e.vx) * Math.min(1, dt*3); e.dir = e.vx > 0 ? 1 : -1; e.x += e.vx*dt; }
    const m = (e.spr && e.spr.w) || 20;
    if (e.x < -80 - m || e.x > W + 80 + m || e.y < -60) e.dead = true;
    return;
  }
  if (ev && ev.type === 'current') e.x += ev.dir * 30 * evFade() * dt;
  if (e.type === 'jelly') {
    const pulse = Math.max(0, Math.sin(e.ph*2.6)); e.squash = pulse;
    e.y += e.vy * (0.3 + pulse*1.4) * dt; e.x += Math.sin(e.ph*0.8)*8*dt;
    if (e.y < -e.r*4) e.dead = true;
    return;
  }
  e.x += e.vx*dt; e.y += Math.cos(e.ph*e.bobF)*e.bobA*dt;
  // Haie jagen dich, solange du vor ihnen bist
  if (e.kind === 'shark' && state === 'play' && !frenzy() && Math.sign(player.x - e.x) === Math.sign(e.vx))
    e.y += clamp(player.y - e.y, -1, 1) * (14 + level*3) * dt;
  // Im Fressrausch fliehen die grossen Fische vor dir
  if (frenzy() && e.type === 'fish' && e.r >= player.r*EAT_RATIO) e.y += (Math.sign(e.y - player.y) || 1) * 26 * dt;
  e.y = clamp(e.y, 6, FLOOR - 4);
  if ((e.vx > 0 && e.x > W + e.margin) || (e.vx < 0 && e.x < -e.margin)) e.dead = true;
}

function movePlayer(dt) {
  const p = player;
  let kx = 0, ky = 0;
  if (keys.has('arrowleft') || keys.has('a')) kx--;
  if (keys.has('arrowright') || keys.has('d')) kx++;
  if (keys.has('arrowup') || keys.has('w')) ky--;
  if (keys.has('arrowdown') || keys.has('s')) ky++;
  if (kx || ky) inputMode = 'key';
  const minY = p.r*0.9 + 3, maxY = floorAt(p.x) - p.r*0.6;
  // Trägheit: Der Fisch wird nur beschleunigt, nie direkt gesetzt. Grössere Fische sind schwerer.
  const mass = 1 + p.r / 14;
  const acc = 240 / mass, maxS = 108 - Math.min(40, p.r);
  let ax = 0, ay = 0;
  if (kx || ky) {
    const m = Math.hypot(kx, ky); ax = kx/m*acc; ay = ky/m*acc;
  } else if (inputMode === 'point') {
    tgt.x = clamp(tgt.x, p.r, W - p.r); tgt.y = clamp(tgt.y, minY, maxY);
    let dx = tgt.x - p.x, dy = tgt.y - p.y;
    let wx = dx*2.4, wy = dy*2.4; const wm = Math.hypot(wx, wy);
    if (wm > maxS) { wx *= maxS/wm; wy *= maxS/wm; }
    const dvx = wx - p.vx, dvy = wy - p.vy, m = Math.hypot(dvx, dvy) || 1;
    const s = Math.min(acc, m*3) / m; ax = dvx*s; ay = dvy*s;
  }
  if (ev && ev.type === 'current') ax += ev.dir * 95 * evFade();
  p.vx += ax*dt; p.vy += ay*dt;
  const drag = Math.pow(0.42, dt); p.vx *= drag; p.vy *= drag;   // Wasserwiderstand, man gleitet aus
  const sp = Math.hypot(p.vx, p.vy); if (sp > maxS*1.6) { p.vx *= maxS*1.6/sp; p.vy *= maxS*1.6/sp; }
  p.x += p.vx*dt; p.y += p.vy*dt;
  if (p.x < p.r) { p.x = p.r; p.vx = Math.abs(p.vx)*0.35; }
  if (p.x > W - p.r) { p.x = W - p.r; p.vx = -Math.abs(p.vx)*0.35; }
  if (p.y < minY) { p.y = minY; p.vy = Math.abs(p.vy)*0.35; }
  if (p.y > maxY) { p.y = maxY; p.vy = -Math.abs(p.vy)*0.35; }
  if (Math.abs(p.vx) > 5) p.dir = p.vx > 0 ? 1 : -1;
  trailT -= dt;
  if (Math.hypot(p.vx, p.vy) > 40 && trailT <= 0) { trailT = 0.18; bubbles.push({x: p.x - p.dir*p.r, y: p.y, s: p.r > 14 ? 1 : 0, vy: rnd(8, 16), ph: rnd(0, 6)}); }
}

function update(dt) {
  time += dt; const p = player;
  bubT -= dt;
  if (bubT <= 0) { bubT = rnd(0.15, 0.5) * clamp(260 / W, 0.4, 1.5); const x = rnd(0, W); bubbles.push({x, y: floorAt(x) - 1, s: Math.random() < 0.25 ? 2 : Math.random() < 0.5 ? 1 : 0, vy: rnd(10, 24), ph: rnd(0, 6)}); }
  const cur = ev && ev.type === 'current' ? ev.dir * 30 * evFade() : 0;
  for (let i = bubbles.length - 1; i >= 0; i--) { const b = bubbles[i]; b.y -= b.vy*dt; b.x += (Math.sin(b.ph + time*2.2)*5 + cur)*dt; if (b.y < -4) bubbles.splice(i, 1); }
  for (const d of dust) { d.x += (d.vx + cur*1.5)*dt; d.y += d.vy*dt; if (d.x < 0) d.x += W; if (d.x > W) d.x -= W; if (d.y < 0) d.y += FLOOR; if (d.y > FLOOR) d.y -= FLOOR; }
  if (cur) for (let k = 0; k < 2; k++) streaks.push({x: camX + rnd(0, VW), y: clamp(camY + rnd(4, VH), 4, FLOOR), len: rnd(5, 14), vx: Math.sign(cur)*rnd(90, 160), life: rnd(0.3, 0.7)});
  for (let i = streaks.length - 1; i >= 0; i--) { const s = streaks[i]; s.x += s.vx*dt; s.life -= dt; if (s.life <= 0) streaks.splice(i, 1); }
  const damp = Math.pow(0.05, dt);
  for (let i = parts.length - 1; i >= 0; i--) { const q = parts[i]; q.x += q.vx*dt; q.y += q.vy*dt; q.vx *= damp; q.vy = q.vy*damp - 8*dt; q.life -= dt; if (q.life <= 0) parts.splice(i, 1); }
  for (let i = pops.length - 1; i >= 0; i--) { const q = pops[i]; q.y -= 14*dt; q.x += q.vx*dt; q.life -= dt; if (q.life <= 0) pops.splice(i, 1); }
  shake = Math.max(0, shake - dt*12); flash = Math.max(0, flash - dt*3);

  if (mp) { mpUpdate(dt); return; }
  if (state === 'title' || state === 'play' || state === 'over') { spawnT -= dt; if (spawnT <= 0) doSpawn(); }
  for (const e of ents) moveEnt(e, dt);

  if (state === 'title') {
    p.sleep = true; p.r = 11; p.x = W/2; p.y = floorAt(W/2) - p.r*0.9 - 1; p.dir = 1;
    zT -= dt; if (zT <= 0) { zT = 0.9; pops.push({x: p.x + p.r*0.7, y: p.y - p.r*0.9, t: 'z', c: '#8fe6ff', life: 1.6, max: 1.6, vx: 7, size: 8}); }
  } else if (state === 'play' || state === 'levelup') movePlayer(dt);
  else if (state === 'dying') { p.y -= 18*dt; dyingT -= dt; if (dyingT <= 0) showOver(); }

  if (state === 'play' || state === 'levelup') {
    runT += dt;
    if (ev) {
      ev.t -= dt;
      if ((ev.type === 'gold' && ev.fish.dead) || ev.t <= 0) endEvent();
    } else if (!nurija && state === 'play') {
      if (!nurijaDone && runT >= nurijaAt) startNurija();
      else { evT -= dt; if (evT <= 0) startEvent(pick(['current', 'gold', 'dark'].filter(t => t !== lastEv))); }
    }
  }
  updateNurija(dt);

  if (state === 'play') {
    collide();
    comboT -= dt; if (comboT <= 0) combo = 0;
    if (p.shield > 0) p.shield = Math.max(0, p.shield - dt);
    if (score >= nextLife) { nextLife += 15000; if (lives < 5) { lives++; popup(p.x, p.y - p.r - 6, '1UP', '#ff7ab0'); sfx.life(); } }
  }
  if (state === 'levelup') {
    luT -= dt; p.r += (START_R - p.r) * Math.min(1, dt*2.5);
    if (luT <= 0) { state = 'play'; p.r = START_R; p.inv = 1.2; spawnT = 0.6; }
  }
  p.inv = Math.max(0, p.inv - dt); p.puff = Math.max(0, p.puff - dt); frzT = Math.max(0, frzT - dt);
  for (let i = ents.length - 1; i >= 0; i--) if (ents[i].dead) ents.splice(i, 1);
  updateCam(); updateHUD();
}

/* ---------- Zeichnen ---------- */
function disc(x, y, r) { const n = Math.ceil(r); for (let dy = -n; dy <= n; dy++) { const w = Math.floor(Math.sqrt(Math.max(0, r*r - dy*dy)) + 0.3); ctx.fillRect(x - w, y + dy, w*2 + 1, 1); } }
function ring(x, y, r) { const n = Math.ceil(r*6.3); for (let i = 0; i < n; i++) { const a = i / n * 6.283; ctx.fillRect(Math.round(x + Math.cos(a)*r), Math.round(y + Math.sin(a)*r), 1, 1); } }
function drawWarn(x, y) { ctx.fillStyle = '#2a0610'; ctx.fillRect(x - 1, y - 1, 3, 7); ctx.fillStyle = '#ff3b5c'; ctx.fillRect(x, y, 1, 3); ctx.fillRect(x, y + 4, 1, 1); }

function drawKelp() {
  for (const k of kelp) {
    const segs = Math.floor(k.h / 2);
    for (let i = 0; i < segs; i++) {
      const yy = Math.round(k.y - i*2), xx = Math.round(k.x + Math.sin(time*1.1 + k.ph + i*0.13) * i * 0.09);
      ctx.fillStyle = '#0e3a44'; ctx.fillRect(xx, yy - 2, 3, 2);
      if (i % 5 === 2) { ctx.fillStyle = '#165458'; const left = i % 10 < 5; ctx.fillRect(left ? xx - 3 : xx + 3, yy - 2, 3, 1); ctx.fillRect(left ? xx - 4 : xx + 6, yy - 3, 1, 1); }
    }
  }
}

function drawEnt(e) {
  const x = Math.round(e.x), y = Math.round(e.y);
  if (e.type === 'fish') {
    const s = e.spr, bob = Math.floor(e.ph*4) % 2;
    const scared = frenzy() && e.r >= player.r*EAT_RATIO;
    if (scared && Math.floor(time*8) % 2) ctx.globalAlpha = 0.45;
    ctx.save(); ctx.translate(x, y + bob); if (e.dir < 0) ctx.scale(-1, 1);
    ctx.drawImage(s.c, -Math.round(s.cx), -Math.round(s.cy)); ctx.restore();
    ctx.globalAlpha = 1;
    if (e.gold) { ctx.fillStyle = '#fff6c0'; ctx.fillRect(x + Math.round(Math.sin(time*9)*s.a), y - Math.round(s.b) - 2, 1, 1); ctx.fillRect(x + Math.round(Math.cos(time*7)*s.a), y + Math.round(s.b) + 1, 1, 1); }
    if (state === 'play' && !e.flee && !frenzy() && !e.gold && e.r >= player.r*EAT_RATIO) {
      const d = Math.hypot(player.x - e.x, player.y - e.y);
      if (d < 80 + e.r && Math.floor(time*6) % 2 === 0) drawWarn(x, y - Math.round(s.b) - 9);
    }
  } else if (e.type === 'jelly') {
    const s = e.spr, sq = 1 + e.squash*0.15, n = e.r > 8 ? 5 : 4, len = Math.round(e.r*1.6);
    ctx.fillStyle = 'rgba(255,150,205,0.7)';
    for (let k = 0; k < n; k++) {
      const tx0 = x - e.r*0.7 + k * (e.r*1.4 / (n - 1));
      for (let i = 0; i < len; i++) ctx.fillRect(Math.round(tx0 + Math.sin(time*3 + i*0.35 + k)*(1 + i*0.06)), y + i, 1, 1);
    }
    const dw = s.w / sq, dh = s.h * sq;
    ctx.drawImage(s.c, Math.round(x - dw/2), Math.round(y - s.by*sq), Math.round(dw), Math.round(dh));
    if (state === 'play' && !frenzy() && Math.hypot(player.x - e.x, player.y - e.y) < 70 && Math.floor(time*6) % 2 === 0) drawWarn(x, Math.round(y - s.by*sq) - 9);
  } else if (e.type === 'pearl') {
    const yy = y + Math.round(Math.sin(e.ph*3)*1.5);
    ctx.fillStyle = 'rgba(255,236,190,0.16)'; disc(x, yy, 6);
    ctx.fillStyle = '#c9b8ee'; disc(x, yy, 3);
    ctx.fillStyle = '#f7f2ff'; disc(x - 1, yy - 1, 1.6);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 2, yy - 2, 1, 1);
    if (Math.floor(time*5 + e.ph) % 3 === 0) { ctx.fillStyle = '#ffe27a'; ctx.fillRect(x + 4, yy - 6, 1, 3); ctx.fillRect(x + 3, yy - 5, 3, 1); }
  } else {
    const yy = y + Math.round(Math.sin(e.ph*3)*1.5);
    ctx.fillStyle = 'rgba(127,240,255,0.16)'; disc(x, yy, 6);
    ctx.fillStyle = '#8ff4ff'; ring(x, yy, 6);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 3, yy - 4, 2, 1); ctx.fillRect(x - 4, yy - 3, 1, 2);
    ctx.fillStyle = '#ffd25a'; ctx.fillRect(x - 1, yy - 2, 3, 3); ctx.fillRect(x, yy + 1, 1, 1);
  }
}

function drawPlayer() {
  const p = player;
  if (state === 'over' || (mp && p.dead)) return;
  drawPuffer({x: p.x, y: p.y + (p.sleep ? Math.sin(time*2) : 0), r: p.r, dir: p.dir, pal: mp ? mp.pal : 'puffer', sleep: p.sleep, dead: p.dead,
    puff: p.puff, glasses: nStage >= 6, blink: p.inv > 0 && state === 'play' && Math.floor(time*12) % 2 === 0, shield: p.shield, frz: frenzy()});
}
function drawPuffer(o) {
  const p = o, x = Math.round(o.x), y = Math.round(o.y);
  if (!o.blink) {
    const spr = buildFish(p.r, o.pal, 'puffer', o.sleep), sc = 1 + (o.puff || 0)*0.9;
    ctx.save(); ctx.translate(x, y); ctx.scale(p.dir, p.dead ? -1 : 1);
    ctx.drawImage(spr.c, -spr.cx*sc, -spr.cy*sc, spr.w*sc, spr.h*sc);
    if (o.glasses) { // Belohnung für das volle Album: Nurijas Brille (nur Optik)
      const ex = Math.round(spr.a*0.5*sc), ey = Math.round(-spr.b*0.16*sc), er = Math.max(2, p.r*0.34*sc);
      ctx.fillStyle = '#3a2412'; ring(ex, ey, er);
      ctx.fillRect(Math.round(ex - er - p.r*0.45), ey, Math.round(p.r*0.45), 1);
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(Math.round(ex - er*0.5), Math.round(ey - er*0.5), 1, 1);
    }
    ctx.restore();
  }
  if (o.shield > 0) {
    ctx.fillStyle = 'rgba(143,244,255,0.08)'; disc(x, y, p.r*1.4);
    ctx.fillStyle = (o.shield < 2 && Math.floor(time*8) % 2) ? 'rgba(143,244,255,0.35)' : 'rgba(143,244,255,0.9)';
    ring(x, y, p.r*1.4 + 1);
  }
  if (o.frz && Math.floor(time*10) % 2) { ctx.fillStyle = '#ffd25a'; ring(x, y, p.r*1.25 + 2); }
}

function drawNurija() {
  const n = nurija; if (!n) return;
  const f = getFace(nStage);
  if (n.phase === 'warn') {
    const peek = clamp((2.4 - n.t) / 2.4, 0, 1);
    if (f) { const lx = n.dir > 0 ? -n.w + n.w*0.3*peek : W - n.w*0.3*peek; ctx.drawImage(f, Math.round(lx), Math.round(n.y - n.h/2), Math.round(n.w), Math.round(n.h)); }
    if (Math.floor(time*5) % 2 === 0) {
      const wx = n.dir > 0 ? Math.max(Math.round(n.w*0.3*peek) + 6, camX + 6) : Math.min(Math.round(W - n.w*0.3*peek) - 9, camX + VW - 9);
      ctx.save(); ctx.translate(wx, clamp(Math.round(n.y) - 10, camY + 30, camY + VH - 20)); ctx.scale(2, 2); drawWarn(1, 0); ctx.restore();
    }
    return;
  }
  const wob = Math.sin(n.ph*8)*1.5, sc = 1 + Math.sin(n.ph*10)*0.03;
  const tx = n.x - n.dir*n.w*0.42, ty = n.y + wob, tl = n.w*0.5;
  for (let i = 0; i < tl; i++) { // Fischschwanz
    const half = Math.round(n.h*0.05 + (i/tl)*n.h*0.3), xx = Math.round(tx - n.dir*i);
    ctx.fillStyle = '#4a3010'; ctx.fillRect(xx, Math.round(ty - half) - 1, 1, half*2 + 2);
    ctx.fillStyle = i % 4 === 0 ? '#c4862a' : '#e0a83a'; ctx.fillRect(xx, Math.round(ty - half), 1, half*2);
  }
  if (f) ctx.drawImage(f, Math.round(n.x - n.w*sc/2), Math.round(n.y - n.h*sc/2 + wob), Math.round(n.w*sc), Math.round(n.h*sc));
  else { ctx.fillStyle = '#d9a37a'; disc(Math.round(n.x), Math.round(n.y), n.w*0.45); }
}

function drawDark() {
  const a = evFade(), p = player, g = darkCtx;
  g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, W, H);
  g.fillStyle = `rgba(1,4,12,${0.94*a})`; g.fillRect(0, 0, VW, VH);
  g.globalCompositeOperation = 'destination-out';
  const px = p.x - camX, py = p.y - camY;
  const R = 34 + p.r*1.6, gr = g.createRadialGradient(px, py, R*0.3, px, py, R);
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(px, py, R, 0, 6.3); g.fill();
  g.globalCompositeOperation = 'source-over';
  ctx.drawImage(darkCv, camX, camY);
  if (mp) for (const o of mp.peers.values()) { // andere Spieler: nur ihre Augen
    if (o.dead) continue;
    ctx.fillStyle = canEatMe(o) ? `rgba(255,60,80,${a})` : `rgba(255,255,255,${0.8*a})`;
    const ex = Math.round(o.x + o.dir*o.r*0.5), ey = Math.round(o.y - o.r*0.2);
    ctx.fillRect(ex, ey, 1, 1); if (o.r > 8) ctx.fillRect(ex - o.dir, ey, 1, 1);
  }
  for (const e of ents) {
    if (e.type === 'fish' && e.r >= p.r*EAT_RATIO) {
      const ex = Math.round(e.x + e.dir*e.spr.a*0.55), ey = Math.round(e.y - e.spr.b*0.24);
      ctx.fillStyle = `rgba(255,60,80,${a})`; ctx.fillRect(ex, ey, 1, 1); if (e.r > 8) ctx.fillRect(ex - e.dir, ey, 1, 1);
    } else if (e.type === 'jelly') {
      ctx.fillStyle = `rgba(255,120,190,${0.7*a})`; ctx.fillRect(Math.round(e.x) - 1, Math.round(e.y - e.r*0.5), 3, 2);
    } else if (e.type === 'pearl') {
      ctx.fillStyle = `rgba(255,236,190,${a})`; ctx.fillRect(Math.round(e.x), Math.round(e.y), 1, 1);
    }
  }
}

function draw() {
  ctx.fillStyle = '#06172e'; ctx.fillRect(0, 0, VW, VH);
  ctx.save();
  if (shake > 0) ctx.translate(Math.round(rnd(-shake, shake)), Math.round(rnd(-shake, shake)));
  ctx.translate(-camX, -camY);
  ctx.drawImage(bg, 0, 0);
  ctx.fillStyle = 'rgba(180,230,255,0.22)';
  for (const d of dust) ctx.fillRect(d.x | 0, d.y | 0, 1, 1);
  drawKelp();
  ctx.fillStyle = 'rgba(200,240,255,0.35)';
  for (const s of streaks) ctx.fillRect(Math.round(s.x), Math.round(s.y), Math.round(s.len), 1);
  ents.sort((a, b) => a.r - b.r);
  for (const e of ents) drawEnt(e);
  if (mp) drawPeers();
  drawNurija();
  drawPlayer();
  for (const b of bubbles) {
    const x = Math.round(b.x), y = Math.round(b.y);
    ctx.fillStyle = 'rgba(160,225,255,0.6)';
    if (b.s === 0) ctx.fillRect(x, y, 1, 1);
    else if (b.s === 1) { ctx.fillRect(x - 1, y - 1, 2, 1); ctx.fillRect(x - 1, y + 1, 2, 1); ctx.fillRect(x - 2, y, 1, 1); ctx.fillRect(x + 1, y, 1, 1); }
    else { ctx.fillRect(x - 1, y - 2, 3, 1); ctx.fillRect(x - 1, y + 2, 3, 1); ctx.fillRect(x - 2, y - 1, 1, 3); ctx.fillRect(x + 2, y - 1, 1, 3); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(x - 1, y - 1, 1, 1); }
  }
  for (const q of parts) { ctx.globalAlpha = clamp(q.life*2, 0, 1); ctx.fillStyle = q.c; ctx.fillRect(Math.round(q.x), Math.round(q.y), q.s, q.s); }
  ctx.globalAlpha = 1;
  if (ev && ev.type === 'dark') drawDark();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const q of pops) {
    ctx.globalAlpha = clamp(q.life / q.max * 1.6, 0, 1);
    ctx.font = (q.size || 8) + 'px Silkscreen, monospace';
    ctx.fillStyle = '#04101f'; ctx.fillText(q.t, Math.round(q.x) + 1, Math.round(q.y) + 1);
    ctx.fillStyle = q.c; ctx.fillText(q.t, Math.round(q.x), Math.round(q.y));
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  syncTags();
  if (mp) drawEdgeMarkers();
  if (flash > 0) { ctx.fillStyle = `rgba(${flashCol},${flash*0.45})`; ctx.fillRect(0, 0, VW, VH); }
}

/* ---------- HUD & Screens ---------- */
const HEART = '<svg viewBox="0 0 7 6" width="21" height="18" shape-rendering="crispEdges" aria-hidden="true"><path d="M1 0h2v1h1V0h2v1h1v2H6v1H5v1H4v1H3V5H2V4H1V3H0V1h1z" fill="currentColor"/></svg>';
const EV_LABEL = {current: 'STRÖMUNG', gold: 'GOLDFISCH', dark: 'DUNKEL', frenzy: 'RAUSCH'};
let hudCache = '';
function updateHUD() {
  const p = player, g = clamp(Math.round((p.r - START_R) / (CAP_R - START_R) * 100), 0, 100);
  const evTxt = frzT > 0 ? 'RAUSCH ' + Math.ceil(frzT) : ev ? EV_LABEL[ev.type] + ' ' + Math.max(1, Math.ceil(ev.t)) : '';
  const s = [score, lives, level, combo, g, p.shield > 0 ? 1 : 0, evTxt, mp ? mp.boardKey : ''].join('|');
  if (s === hudCache) return; hudCache = s;
  $('hearts').hidden = !!mp; $('lvlBox').hidden = !!mp; $('board').hidden = !mp;
  if (mp) $('board').innerHTML = mp.boardHtml;
  $('score').textContent = String(score).padStart(6, '0');
  $('lvl').textContent = level;
  $('combo').textContent = combo > 1 ? 'COMBO x' + combo : '';
  $('growFill').style.width = g + '%';
  let h = ''; for (let i = 0; i < Math.max(3, lives); i++) h += i < lives ? HEART : HEART.replace('<svg', '<svg class="lost"');
  $('hearts').innerHTML = h;
  $('shieldChip').hidden = !(p.shield > 0);
  $('evChip').hidden = !evTxt; $('evChip').textContent = evTxt;
}
let bannerTO = 0;
function banner(main, sub) {
  const b = $('banner');
  b.innerHTML = `<div class="logo mid">${main}</div>${sub ? `<div class="bsub">${sub}</div>` : ''}`;
  b.hidden = false; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  clearTimeout(bannerTO); bannerTO = setTimeout(() => { b.hidden = true; }, 1800);
}
function setTitle() {
  if (mp) mpLeave();
  state = 'title'; level = 1; zoneIdx = 0; frzT = 0; ev = null; nurija = null; camX = camY = 0;
  resize(); bg = makeBG(); ents.length = 0;
  $('join').hidden = true; $('over').hidden = true; $('pause').hidden = true; $('blubbBtn').hidden = true; $('feed').innerHTML = '';
  for (let i = 0; i < 5; i++) { const e = spawnFish(); e.x = rnd(W*0.1, W*0.9); }
  $('title').hidden = false; $('hud').hidden = true; $('hiTitle').textContent = String(hi).padStart(6, '0');
  drawAlbum();
}
function newGame() {
  ensureAudio();
  state = 'play'; score = 0; level = 1; lives = 3; combo = 0; comboT = 0; nextLife = 15000; inputMode = 'point';
  ents.length = 0; parts.length = 0; pops.length = 0; streaks.length = 0;
  runT = 0; ev = null; lastEv = ''; evT = rnd(16, 24); nurija = null; nurijaDone = false; killer = ''; frzT = 0; zoneIdx = 0;
  nurijaAt = summon ? 10 : rnd(45, 95); summon = false; // jede Runde gleiche Chance
  const p = player; Object.assign(p, {x: W*0.5, y: H*0.5, vx: 0, vy: 0, r: START_R, dir: 1, puff: 0, inv: 1.2, shield: 0, sleep: false, dead: false});
  tgt.x = p.x; tgt.y = p.y; touchLast = null;
  bg = makeBG(); spawnT = 0.5; hudCache = '';
  $('title').hidden = true; $('over').hidden = true; $('pause').hidden = true; $('hud').hidden = false; hudCache = '';
  banner('LOS!', ZONES[0].name); sfx.start();
}
function showOver() {
  state = 'over'; ev = null;
  const newHi = score > hi;
  if (newHi) { hi = score; try { localStorage.setItem('blubberbiss-hi', String(hi)); } catch (e) {} }
  $('overTitle').textContent = killer === 'nurija' ? 'NURIJA HAT DICH!' : 'GEFRESSEN!';
  $('finalScore').textContent = score; $('finalLvl').textContent = level; $('finalHi').textContent = hi;
  $('finalAlbum').textContent = nStage + '/6';
  $('newHi').hidden = !newHi; $('hud').hidden = true; $('over').hidden = false;
  overReady = time + 0.7;
  try { $('againBtn').focus({preventScroll: true}); } catch (e) {}
}
function pause() {
  if (mp) { if (!mp.joined) return; mp.menu = true; $('pause').hidden = false; return; } // Der Ozean läuft weiter
  if (state !== 'play' && state !== 'levelup') return; prevState = state; state = 'pause'; $('pause').hidden = false;
}
function resume() {
  if (mp) { mp.menu = false; $('pause').hidden = true; return; }
  if (state !== 'pause') return; state = prevState; $('pause').hidden = true; last = performance.now();
}
function soundLabel() { $('soundBtn').textContent = muted ? 'TON: AUS' : 'TON: AN'; }

/* ---------- Multiplayer: Supabase Realtime (Broadcast + Presence), kein Login nötig ----------
   Ein gemeinsamer Ozean pro Raum (max. ROOM_MAX Spieler, danach Raum 2, 3 …).
   Der am längsten anwesende Spieler ist «Host»: Er lässt Fische schlüpfen, startet Ereignisse und
   Nurija und gibt die gemeinsame Uhr vor. Alle Fische bewegen sich nach einer festen Formel ab ihrer
   Startzeit, darum sehen alle dasselbe, ohne dass Positionen übertragen werden müssen.
   Wer gefressen wird, meldet das selbst («eaten»), so entscheidet der Bildschirm des Opfers. */
const ROOM_MAX = 12, SEND_EVERY = 0.2, PEER_TIMEOUT = 4000;
const ADJ = ['Flinke', 'Wilde', 'Kleine', 'Freche', 'Mutige', 'Dicke', 'Stille', 'Wache', 'Blaue', 'Rote', 'Flotte', 'Gierige'];
const NOUN = ['Egli', 'Hecht', 'Krabbe', 'Barbe', 'Qualle', 'Forelle', 'Grundel', 'Sardine', 'Flunder', 'Muräne', 'Zander', 'Felche'];
const randName = () => (pick(ADJ) + ' ' + pick(NOUN)).slice(0, 14);
const cleanName = s => String(s || '').replace(/[<>&"'`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14);
const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const myId = ((window.crypto && crypto.randomUUID) ? crypto.randomUUID().replace(/-/g, '') : String(Math.random()).slice(2) + Date.now()).slice(0, 12);
let mpName = '', mpPal = '', suggested = '', lobby = null;
try { mpName = cleanName(localStorage.getItem('blubberbiss-name')); mpPal = localStorage.getItem('blubberbiss-pal') || ''; } catch (e) {}
if (!PLAYER_PALS.includes(mpPal)) mpPal = pick(PLAYER_PALS);
const sb = () => (typeof getSupabase === 'function' ? getSupabase() : null);
const nowS = () => (Date.now() + (mp ? mp.offset : 0)) / 1000;
const nid = () => myId.slice(0, 5) + (++mp.seq).toString(36);

/* --- Titelbildschirm: zeigen, wie viele gerade im Ozean sind --- */
function mpPeek() {
  const client = sb();
  if (!client || lobby || mp) return;
  try {
    lobby = client.channel('blubberbiss-ozean-1', {config: {presence: {key: 'peek-' + myId}}});
    lobby.on('presence', {event: 'sync'}, () => {
      if (!lobby) return;
      const n = Object.keys(lobby.presenceState()).length;
      $('onlineHint').textContent = n === 0 ? 'OZEAN IST LEER' : n === 1 ? '1 IM OZEAN' : n + ' IM OZEAN';
    });
    lobby.subscribe(st => { if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') $('onlineHint').textContent = 'OZEAN OFFLINE'; });
  } catch (e) { $('onlineHint').textContent = 'OZEAN OFFLINE'; }
}

/* --- Beitrittsbildschirm --- */
function renderSwatches() {
  $('swatches').innerHTML = PLAYER_PALS.map(k =>
    `<button type="button" class="swatch" data-pal="${k}" style="background:${PALS[k].body}" aria-label="Farbe ${k}" aria-pressed="${k === mpPal}"></button>`).join('');
}
$('swatches').addEventListener('click', e => {
  const b = e.target.closest('[data-pal]'); if (!b) return;
  mpPal = b.dataset.pal; try { localStorage.setItem('blubberbiss-pal', mpPal); } catch (er) {}
  renderSwatches(); tone(700, 900, 0.06, 'square', 0.04);
});
function showJoin() {
  ensureAudio();
  $('title').hidden = true; $('join').hidden = false; $('joinStatus').textContent = '';
  const inp = $('nameInput');
  suggested = mpName ? '' : randName(); inp.value = mpName || suggested;
  renderSwatches();
  if (!mpName) { // Eingeloggt? Dann den Vornamen vorschlagen.
    const c = sb();
    if (c) c.auth.getSession().then(({data}) => {
      const u = data && data.session && data.session.user, m = (u && u.user_metadata) || {};
      const nm = cleanName(String(m.full_name || m.name || '').split(' ')[0]);
      if (nm && inp.value === suggested) inp.value = nm;
    }).catch(() => {});
  }
  if (window.matchMedia && matchMedia('(pointer:fine)').matches) inp.focus();
}

async function mpJoin() {
  if ((mp && mp.joined) || $('join').hidden || mpJoin.busy) return;
  mpJoin.busy = true;
  try { if (mp) await mpLeave(); await mpJoinNow(); } finally { mpJoin.busy = false; }
}
async function mpJoinNow() {
  const client = sb();
  if (!client) { $('joinStatus').textContent = 'KEINE VERBINDUNG ZUM OZEAN'; return; }
  mpName = cleanName($('nameInput').value) || randName();
  try { localStorage.setItem('blubberbiss-name', mpName); } catch (e) {}
  ensureAudio();
  $('joinStatus').textContent = 'TAUCHE AB …';
  if (lobby) { const l = lobby; lobby = null; try { await client.removeChannel(l); } catch (e) {} }
  mp = {client, room: 1, ch: null, joined: false, host: false, offset: 0, clockSet: false, peers: new Map(), menu: false,
    pal: mpPal, name: mpName, seq: 0, sendT: 0, idleT: 0, lastSent: '', spawnT: 0.5, evT: rnd(20, 30), nurT: rnd(55, 90), clockT: 0,
    lastEv: '', joinedAt: Date.now(), boardKey: '', boardHtml: '', boardT: 0, count: 1, kingId: null, deadT: 0, feed: [], emote: 0, blubbCd: 0, hiddenAt: 0};
  state = 'mpwait'; player.dead = true; ents.length = 0; parts.length = 0; pops.length = 0; ev = null; nurija = null; frzT = 0; zoneIdx = 0; bg = null;
  resize();
  mpConnect(1);
}

function mpConnect(room) {
  if (!mp) return;
  const ch = mp.client.channel('blubberbiss-ozean-' + room, {config: {broadcast: {self: false}, presence: {key: myId}}});
  mp.ch = ch; mp.room = room;
  ch.on('broadcast', {event: 'm'}, ({payload}) => { if (mp && mp.ch === ch) mpRecv(payload); });
  ch.on('presence', {event: 'sync'}, () => { if (mp && mp.ch === ch) mpPresence(); });
  const fail = setTimeout(() => { if (mp && mp.ch === ch && !mp.joined) $('joinStatus').textContent = 'DAUERT … NOCH EINEN MOMENT'; }, 5000);
  ch.subscribe(async st => {
    if (!mp || mp.ch !== ch) return;
    if (st === 'SUBSCRIBED') {
      clearTimeout(fail);
      try { await ch.track({n: mp.name, j: mp.joinedAt}); } catch (e) {}
      if (!mp.joined) mpStart(); else { mpSend('hello', {}); }
    } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') {
      if (!mp.joined) $('joinStatus').textContent = 'OZEAN NICHT ERREICHBAR · NOCHMAL VERSUCHEN';
    }
  });
}

function mpStart() {
  mp.joined = true;
  $('join').hidden = true; $('title').hidden = true; $('hud').hidden = false; $('blubbBtn').hidden = false;
  $('restartBtn').textContent = 'VERLASSEN'; hudCache = '';
  score = 0; level = 1; lives = 3; combo = 0; comboT = 0; inputMode = 'point';
  mpSpawnPlayer();
  mpSend('hello', {});
  banner('OZEAN' + (mp.room > 1 ? ' ' + mp.room : ''), mp.count > 1 ? mp.count + ' FISCHE IM WASSER' : 'NOCH ALLEIN · LADE LEUTE EIN');
  sfx.start();
}

function mpLeave() {
  if (!mp) return;
  const m = mp;
  mpSend('bye', {});
  mp = null;
  ents.length = 0; ev = null; nurija = null; frzT = 0; player.dead = false;
  $('hud').hidden = true; $('blubbBtn').hidden = true; $('feed').innerHTML = ''; $('restartBtn').textContent = 'NEUSTART';
  return Promise.resolve(m.ch ? m.client.removeChannel(m.ch) : null).catch(() => {}).then(() => { if (state === 'title') mpPeek(); });
}

function mpSend(k, data) {
  if (!mp || !mp.ch) return;
  try { mp.ch.send({type: 'broadcast', event: 'm', payload: Object.assign({k, f: myId}, data)}); } catch (e) {}
}
// Vom Host ausgelöste Dinge gelten auch für ihn selbst
function hostEmit(msg) { mpRecv(Object.assign({f: myId}, msg)); mpSend(msg.k, msg); }

function setClock(t, force) {
  const off = t - Date.now();
  if (!mp.clockSet || force || Math.abs(off - mp.offset) > 1500) mp.offset = off;
  else mp.offset += (off - mp.offset) * 0.2;
  mp.clockSet = true;
}

function mpPresence() {
  const st = mp.ch.presenceState();
  const list = Object.entries(st).map(([id, v]) => ({id, j: (v && v[0] && v[0].j) || 0})).filter(x => !x.id.startsWith('peek-'));
  list.sort((a, b) => a.j - b.j || (a.id < b.id ? -1 : 1));
  mp.count = Math.max(1, list.length);
  const rank = list.findIndex(x => x.id === myId);
  if (rank >= ROOM_MAX && mp.room < 20) { // Raum voll: nächsten nehmen
    const old = mp.ch; mp.ch = null; mp.peers.clear(); ents.length = 0; mp.clockSet = false; mp.host = false;
    mp.client.removeChannel(old).catch(() => {}).then(() => { if (mp) { mpConnect(mp.room + 1); banner('RAUM VOLL', 'WECHSLE IN OZEAN ' + (mp.room + 1)); } });
    return;
  }
  const wasHost = mp.host;
  mp.host = rank === 0;
  if (mp.host && !wasHost) { mp.clockSet = true; mp.clockT = 0; mp.spawnT = 0.2; }
  const ids = new Set(list.map(x => x.id));
  for (const [id, o] of mp.peers) if (!ids.has(id) && performance.now() - o.last > 1500) mp.peers.delete(id);
}

function mpVisibility() {
  if (!mp || !mp.ch) return;
  if (document.hidden) {
    mpSend('bye', {}); mp.hiddenAt = Date.now();
    try { mp.ch.untrack(); } catch (e) {}
  } else {
    mp.joinedAt = Date.now(); // wer zurückkommt, reiht sich hinten ein (Host bleibt, wer da war)
    try { mp.ch.track({n: mp.name, j: mp.joinedAt}); } catch (e) {}
    player.inv = Math.max(player.inv, 2); last = performance.now();
    mpSend('hello', {});
  }
}
window.addEventListener('pagehide', () => { if (mp) mpSend('bye', {}); });

/* --- Netzwerk-Fische --- */
function netData(e) {
  const o = {}; for (const k of ['id', 'type', 'kind', 'pal', 'r', 'gold', 'x0', 'y0', 'vx', 'vy', 't0', 'bobA', 'bobF', 'ph0']) if (e[k] !== undefined) o[k] = e[k];
  return o;
}
function addNetEnt(d) {
  if (!d || !d.id || ents.some(e => e.id === d.id)) return;
  const e = Object.assign({}, d, {net: true, x: d.x0, y: d.y0, ph: 0});
  if (e.type === 'fish') { e.spr = buildFish(e.r, e.pal, e.kind, false); e.margin = e.spr.w + 4; e.dir = e.vx > 0 ? 1 : -1; }
  else if (e.type === 'jelly') e.spr = buildJelly(e.r);
  else e.margin = 14;
  moveNetEnt(e);
  if (!e.dead) ents.push(e);
}
function moveNetEnt(e) {
  const tau = nowS() - e.t0; e.ph = Math.max(0, tau) + (e.ph0 || 0);
  if (e.type === 'jelly') {
    e.squash = Math.max(0, Math.sin(tau*2.6));
    e.y = e.y0 + e.vy*(0.9*tau - 0.2*Math.cos(tau*2.6)); e.x = e.x0 + Math.sin(tau*0.8)*10;
    if (e.y < -e.r*4) e.dead = true;
    return;
  }
  e.x = e.x0 + e.vx*tau;
  e.y = clamp(e.y0 + (e.bobA / e.bobF) * Math.sin(e.bobF*tau + (e.ph0 || 0)), 6, FLOOR - 4);
  e.dir = e.vx > 0 ? 1 : -1;
  if ((e.vx > 0 && e.x > W + e.margin) || (e.vx < 0 && e.x < -e.margin)) e.dead = true;
}
function mkNetFish(o) {
  const fromLeft = o.fromLeft ?? Math.random() < 0.5, r = Math.round(clamp(o.r, 2.5, 36)*2)/2, w = Math.ceil(r*3.9) + 4, off = o.off || 0;
  return {id: nid(), type: 'fish', kind: o.kind, pal: o.pal, r, gold: o.gold ? 1 : 0,
    x0: fromLeft ? -w - off : W + w + off, y0: Math.round(o.y), vx: Math.round(fromLeft ? o.sp : -o.sp), t0: nowS(),
    bobA: o.bobA ?? Math.round(rnd(0, 10)), bobF: o.bobF ?? +rnd(1, 3).toFixed(2), ph0: +rnd(0, 6).toFixed(2)};
}
function hostSpawn(alive) {
  const live = ents.reduce((n, e) => n + (e.dead ? 0 : 1), 0), maxE = Math.min(60, 22 + alive.length*6);
  if (live >= maxE) return;
  const ref = pick(alive).r, q = Math.random(), t = nowS(), out = [];
  const item = type => { const fl = Math.random() < 0.5; return {id: nid(), type, r: type === 'pearl' ? 3 : 6, x0: fl ? -10 : W + 10, y0: Math.round(rnd(24, FLOOR - 24)), vx: Math.round((fl ? 1 : -1) * rnd(14, 22)), t0: t, bobA: 4, bobF: 2, ph0: +rnd(0, 6).toFixed(2)}; };
  if (q < 0.09) out.push({id: nid(), type: 'jelly', r: Math.round(rnd(5, 12)), x0: Math.round(rnd(20, W - 20)), y0: H + 30, vy: -Math.round(rnd(12, 20)), t0: t, ph0: 0});
  else if (q < 0.14) out.push(item('pearl'));
  else if (q < 0.165) out.push(item('shield'));
  else if (q < 0.4) {
    const r = Math.max(2.5, ref*rnd(0.3, 0.5)), pal = pick(FISH_PALS), fromLeft = Math.random() < 0.5, sp = rnd(26, 40), y = rnd(20, FLOOR - 20);
    const n = 3 + Math.floor(Math.random()*3);
    for (let i = 0; i < n; i++) out.push(mkNetFish({r, pal, kind: 'fish', fromLeft, sp, y: clamp(y + rnd(-9, 9), 10, FLOOR - 8), off: i*r*3.2}));
  } else {
    let r = Math.random() < 0.6 ? ref*rnd(0.35, 0.82) : ref*rnd(1.0, 2.3), kind = 'fish', pal = pick(FISH_PALS);
    r = clamp(r, 2.5, 34);
    if (r > ref*1.4 && r > 12 && Math.random() < 0.6) { kind = 'shark'; pal = 'shark'; }
    else if (Math.random() < 0.22) kind = 'stripe';
    let sp = rnd(22, 44); if (kind === 'shark') sp *= 1.35; if (r < 5) sp *= 1.2;
    out.push(mkNetFish({r, pal, kind, sp, y: rnd(12 + r, FLOOR - r*0.8)}));
  }
  hostEmit({k: 'sp', e: out});
}
function hostTick(dt) {
  const t = nowS();
  mp.clockT -= dt; if (mp.clockT <= 0) { mp.clockT = 2; mpSend('c', {t: Date.now() + mp.offset}); }
  const alive = [player].concat([...mp.peers.values()].filter(o => !o.dead));
  mp.spawnT -= dt;
  if (mp.spawnT <= 0) { mp.spawnT = rnd(0.3, 0.7) * clamp(3 / (alive.length + 1), 0.45, 1.2); hostSpawn(alive); }
  if (ev || nurija) return;
  mp.evT -= dt; mp.nurT -= dt;
  if (mp.nurT <= 0) {
    mp.nurT = rnd(80, 130); mp.evT = Math.max(mp.evT, 14);
    hostEmit({k: 'nur', t0: t + 0.2, dir: Math.random() < 0.5 ? 1 : -1, y0: Math.round(rnd(H*0.3, H*0.62))});
  } else if (mp.evT <= 0) {
    mp.evT = rnd(24, 38);
    const type = pick(['current', 'gold', 'dark'].filter(x => x !== mp.lastEv)); mp.lastEv = type;
    if (type === 'gold') {
      const ref = pick(alive).r;
      hostEmit({k: 'sp', e: [mkNetFish({r: Math.max(3, ref*0.55), pal: 'gold', kind: 'fish', sp: 72, gold: 1, bobA: 45, bobF: 4, y: rnd(30, FLOOR - 30)})]});
    }
    hostEmit({k: 'ev', type, t0: t, max: type === 'current' ? 7 : type === 'gold' ? 14 : 9, dir: Math.random() < 0.5 ? -1 : 1});
  }
}

/* --- Nachrichten --- */
function peerName(id) { const o = mp && mp.peers.get(id); return id === myId ? mp.name : o ? o.name : '???'; }
function mpRecv(m) {
  if (!mp || !m || typeof m.k !== 'string') return;
  switch (m.k) {
    case 's': peerState(m); break;
    case 'c': if (!mp.host) setClock(+m.t); break;
    case 'hello':
      if (mp.host && m.f !== myId) mpSend('sync', {to: m.f, t: Date.now() + mp.offset, e: ents.filter(e => !e.dead && e.net).map(netData),
        ev: ev ? {type: ev.type, t0: ev.t0, max: ev.max, dir: ev.dir} : null, nur: nurija ? {t0: nurija.t0, dir: nurija.dir, y0: nurija.y0} : null});
      break;
    case 'sync':
      if (m.to !== myId) break;
      setClock(+m.t, true);
      for (const d of m.e || []) addNetEnt(d);
      if (m.ev && !ev) applyEv(m.ev, false);
      if (m.nur && !nurija) applyNur(m.nur, false);
      break;
    case 'sp': for (const d of m.e || []) addNetEnt(d); break;
    case 'eat': {
      const e = ents.find(x => x.id === m.id); if (e && !e.dead) { e.dead = true; burst(e.x, e.y, e.pal ? PALS[e.pal].body : '#fff4d0', 5); }
      if (m.g) { const who = m.f === myId ? 'DU HAST' : peerName(m.f).toUpperCase() + ' HAT'; if (m.f !== myId) banner(who + ' IHN!', 'GOLDFISCH WEG'); feedPush(`<b>${esc(peerName(m.f))}</b> schnappt den Goldfisch`); }
      break;
    }
    case 'ev': applyEv(m, true); break;
    case 'nur': applyNur(m, true); break;
    case 'eaten': onEaten(m); break;
    case 'blubb': { const o = mp.peers.get(m.f); if (o) { o.emote = 1.8; for (let i = 0; i < 6; i++) bubbles.push({x: o.x + rnd(-o.r, o.r), y: o.y - rnd(0, o.r), s: 1 + (i % 2), vy: rnd(20, 34), ph: rnd(0, 6)}); } break; }
    case 'bye': mp.peers.delete(m.f); break;
  }
}
function applyEv(m, announce) {
  ev = {type: m.type, t0: +m.t0, max: +m.max, dir: m.dir > 0 ? 1 : -1, t: +m.max};
  if (!announce) return;
  if (m.type === 'current') { banner('STRÖMUNG!', ev.dir > 0 ? 'ES ZIEHT NACH RECHTS' : 'ES ZIEHT NACH LINKS'); tone(120, 70, 0.8, 'triangle', 0.09); }
  else if (m.type === 'gold') { banner('GOLDFISCH!', 'WER SCHNAPPT IHN ZUERST?'); sfx.pearl(); }
  else { banner('LICHT AUS!', 'NUR DIE AUGEN LEUCHTEN'); tone(420, 60, 0.9, 'square', 0.06); }
}
function applyNur(m, announce) {
  const h = Math.min(H*0.5, W*0.55*N_ASPECT), w = h / N_ASPECT, dir = m.dir > 0 ? 1 : -1;
  nurija = {isNurija: true, phase: 'warn', t: 2.4, t0: +m.t0, dir, y0: +m.y0, w, h, x: dir > 0 ? -w*0.2 : W + w*0.2, y: +m.y0, ph: 0, siren: -1, survive: state === 'play'};
  if (announce) banner('NURIJA KOMMT!', 'FÜR ALLE · VON ' + (dir > 0 ? 'LINKS' : 'RECHTS'));
}
function updateNurijaMP() {
  const n = nurija; if (!n) return;
  const tau = nowS() - n.t0; n.ph = Math.max(0, tau);
  n.y = clamp(n.y0 + Math.sin(tau*0.7)*H*0.12, n.h*0.42, FLOOR - n.h*0.38);
  if (tau < 2.4) {
    n.phase = 'warn'; n.t = 2.4 - tau;
    const si = Math.floor(Math.max(0, tau) / 0.42); if (si !== n.siren) { n.siren = si; sfx.siren(); }
    return;
  }
  if (n.phase === 'warn') { n.phase = 'pass'; sfx.scream(); if (Math.abs(n.y - player.y) < VH) shake = 6; }
  const speed = (W + n.w*1.4) / 7;
  n.x = (n.dir > 0 ? -n.w*0.2 : W + n.w*0.2) + n.dir*speed*(tau - 2.4);
  if (Math.abs(n.x - (camX + VW/2)) < VW) shake = Math.max(shake, 1.2);
  const rx = n.w*0.42, ry = n.h*0.44;
  for (const e of ents) {
    if (e.dead) continue;
    const dx = e.x - n.x, dy = e.y - n.y;
    if (dx*dx/(rx*rx) + dy*dy/(ry*ry) < 1) { e.dead = true; burst(e.x, e.y, e.pal ? PALS[e.pal].body : '#ff7eb6', 6); if (Math.random() < 0.4) popup(e.x, e.y, 'MAMPF', '#ffffff'); }
  }
  if (Math.random() < 0.15) bubbles.push({x: n.x + rnd(-rx, rx), y: n.y + rnd(-ry, ry)*0.5, s: 2, vy: rnd(14, 26), ph: rnd(0, 6)});
  if (state === 'play') {
    const p = player, dx = p.x - n.x, dy = p.y - n.y, prx = rx + p.r*0.6, pry = ry + p.r*0.6;
    if (dx*dx/(prx*prx) + dy*dy/(pry*pry) < 1) hurt(n);
  }
  if ((n.dir > 0 && n.x > W + n.w*0.8) || (n.dir < 0 && n.x < -n.w*0.8)) {
    nurija = null;
    if (n.survive && state === 'play') {
      score += 1500;
      if (nStage < 6) { nStage++; try { localStorage.setItem('blubberbiss-nurija', String(nStage)); } catch (e) {} drawAlbum(); }
      banner('ÜBERLEBT!', nStage >= 6 ? 'ALBUM KOMPLETT · +1500' : 'NURIJA-ALBUM ' + nStage + '/6 · +1500');
      sfx.life();
    }
  }
}

/* --- Spieler --- */
function peerState(m) {
  let o = mp.peers.get(m.f);
  const x = +m.x || 0, y = +m.y || 0, r = clamp(+m.r || START_R, 2, CAP_R);
  if (!o) {
    o = {id: m.f, x, y, r, tx: x, ty: y, tr: r, dir: 1, emote: 0, dead: false, score: 0};
    mp.peers.set(m.f, o);
    if (mp.joined) feedPush(`<b>${esc(cleanName(m.n) || '???')}</b> taucht auf`);
  }
  if (o.dead && !m.dd) { o.x = x; o.y = y; o.r = r; }
  o.tx = x; o.ty = y; o.vx = +m.vx || 0; o.vy = +m.vy || 0; o.tr = r; o.dir = m.d < 0 ? -1 : 1;
  o.score = Math.max(0, +m.sc || 0); o.shield = m.sh ? 9 : 0; o.frz = !!m.fz; o.inv = !!m.i; o.dead = !!m.dd; o.glasses = !!m.g;
  o.name = cleanName(m.n) || '???'; o.pal = PLAYER_PALS.includes(m.p) ? m.p : 'puffer'; o.last = performance.now();
}
function updatePeers(dt) {
  const now = performance.now(), k = Math.min(1, dt*10);
  for (const [id, o] of mp.peers) {
    if (now - o.last > PEER_TIMEOUT) { mp.peers.delete(id); continue; }
    o.tx += o.vx*dt; o.ty += o.vy*dt; // zwischen zwei Meldungen weiterschwimmen lassen
    o.x += (o.tx - o.x)*k; o.y += (o.ty - o.y)*k; o.r += (o.tr - o.r)*Math.min(1, dt*6);
    o.emote = Math.max(0, o.emote - dt);
  }
}
function canEatMe(o) { return !o.dead && (player.r < o.r*EAT_RATIO || (o.frz && player.r < o.r*1.15)); }
function peerCollide() {
  const p = player; if (p.inv > 0) return;
  for (const o of mp.peers.values()) {
    if (o.inv || !canEatMe(o) || (frenzy() && !o.frz)) continue;
    if (Math.hypot(p.x - o.x, p.y - o.y) < o.r*0.95 + p.r*0.3) { hurt({isPeer: true, id: o.id, name: o.name, x: o.x, y: o.y}); return; }
  }
}
function mpSpawnPlayer() {
  const p = player; let best = {x: W/2, y: H/2}, bd = -1;
  for (let i = 0; i < 12; i++) {
    const x = rnd(30, W - 30), y = rnd(30, FLOOR - 30); let d = 1e9;
    for (const o of mp.peers.values()) if (!o.dead && o.r > START_R) d = Math.min(d, Math.hypot(o.x - x, o.y - y));
    for (const e of ents) if (e.type === 'fish' && e.r > START_R) d = Math.min(d, Math.hypot(e.x - x, e.y - y)*1.5);
    if (d > bd) { bd = d; best = {x, y}; }
  }
  Object.assign(p, {x: best.x, y: best.y, vx: 0, vy: 0, r: START_R, dir: 1, puff: 0, inv: 2.5, shield: 0, sleep: false, dead: false});
  tgt.x = p.x; tgt.y = p.y; touchLast = null; combo = 0; comboT = 0; frzT = 0; state = 'play';
  updateCam();
}
function mpHurt(src) {
  const p = player;
  if (src.isNurija || src.isPeer) { mpDie(src); return; }
  p.r = Math.max(START_R, p.r*0.75); p.inv = 1.6; shake = 4; flash = 1; flashCol = '255,60,90'; combo = 0; comboT = 0;
  sfx.hurt(); burst(p.x, p.y, '#f2c14e', 10, 50); popup(p.x, p.y - p.r - 6, 'AUTSCH', '#ff7ab0');
}
function mpDie(src) {
  const p = player;
  mpSend('eaten', {by: src.isPeer ? src.id : null, nur: src.isNurija ? 1 : 0, r: Math.round(p.r*10)/10, king: mp.kingId === myId ? 1 : 0, n: mp.name});
  feedPush(src.isNurija ? `<b>Nurija</b> frisst <b>dich</b>` : `<b>${esc(src.name)}</b> frisst <b>dich</b>`);
  state = 'mpdead'; mp.deadT = 2.4; p.dead = true; if (nurija) nurija.survive = false;
  score = Math.floor(score*0.75/5)*5; combo = 0; comboT = 0; frzT = 0;
  shake = 5; flash = 1; flashCol = '255,60,90'; sfx.over(); burst(p.x, p.y, '#f2c14e', 16, 60);
  banner(src.isNurija ? 'NURIJA HAT DICH!' : 'GEFRESSEN!', src.isPeer ? 'VON ' + src.name.toUpperCase() + ' · -25%' : 'GLEICH GEHT ES WEITER');
}
function onEaten(m) {
  const victim = cleanName(m.n) || '???', o = mp.peers.get(m.f);
  if (o) { o.dead = true; burst(o.x, o.y, PALS[o.pal].body, 14, 55); }
  if (m.nur) { feedPush(`<b>Nurija</b> frisst <b>${esc(victim)}</b>`); return; }
  if (m.by === myId && state === 'play') {
    const p = player, r = clamp(+m.r || START_R, 2, CAP_R);
    const pts = Math.round((300 + r*r*8) / 5) * 5 + (m.king ? 2000 : 0);
    score += pts; p.r = Math.min(CAP_R, Math.sqrt(p.r*p.r + r*r*0.35)); p.puff = 0.3;
    popup(p.x, p.y - p.r - 6, '+' + pts, '#ffd25a', 10);
    if (m.king) { banner('KÖNIGSMORD!', victim.toUpperCase() + ' · +2000 KOPFGELD'); sfx.level(); flash = 1; flashCol = '255,210,90'; }
    else { banner('MAHLZEIT!', victim.toUpperCase() + ' GEFRESSEN'); sfx.eat(6); }
    feedPush(`<b>Du</b> frisst <b>${esc(victim)}</b>${m.king ? ' 👑' : ''}`);
  } else feedPush(`<b>${esc(peerName(m.by))}</b> frisst <b>${esc(victim)}</b>${m.king ? ' 👑' : ''}`);
}
function blubb() {
  if (!mp || state !== 'play' || mp.blubbCd > 0) return;
  mp.blubbCd = 1.2; mp.emote = 1.8; mpSend('blubb', {});
  const p = player; tone(500, 1200, 0.12, 'triangle', 0.07); tone(700, 1500, 0.1, 'triangle', 0.05, 0.12);
  for (let i = 0; i < 8; i++) bubbles.push({x: p.x + rnd(-p.r, p.r), y: p.y - rnd(0, p.r), s: 1 + (i % 2), vy: rnd(20, 34), ph: rnd(0, 6)});
}
function feedPush(h) {
  if (!mp) return;
  mp.feed.unshift({h, t: time}); mp.feed.length = Math.min(mp.feed.length, 4);
  renderFeed();
}
function renderFeed() { $('feed').innerHTML = mp.feed.map(f => `<div>${f.h}</div>`).join(''); }
function mpBoard() {
  const list = [{id: myId, name: mp.name, score, pal: mp.pal}].concat([...mp.peers.values()].map(o => ({id: o.id, name: o.name, score: o.score, pal: o.pal})));
  list.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  mp.kingId = list.length > 1 && list[0].score > 0 ? list[0].id : null;
  const top = list.slice(0, 5); if (!top.some(x => x.id === myId)) top.push(list.find(x => x.id === myId));
  const rows = top.map(x => `<div class="row${x.id === myId ? ' me' : ''}"><span class="dot" style="background:${PALS[x.pal].body}"></span><span class="nm">${x.id === mp.kingId ? '♛ ' : ''}${esc(x.name)}</span><span>${x.score}</span></div>`).join('');
  mp.boardHtml = rows + `<div class="cnt">${list.length} IM OZEAN${mp.room > 1 ? ' · RAUM ' + mp.room : ''}</div>`;
  mp.boardKey = top.map(x => x.id + x.score).join(',') + list.length + mp.kingId;
  if (mp.feed.length && time - mp.feed[mp.feed.length - 1].t > 7) { mp.feed.pop(); renderFeed(); }
}

function mpUpdate(dt) {
  const p = player, t = nowS();
  const z = Math.floor(t / 180) % ZONES.length; // alle 3 Minuten wechselt der Ozean, für alle gleichzeitig
  if (mp.clockSet && z !== zoneIdx) { zoneIdx = z; bg = makeBG(); if (mp.joined) banner(ZONES[z].name, 'DER OZEAN WANDELT SICH'); }
  if (mp.host && mp.joined) hostTick(dt);
  for (const e of ents) if (!e.dead) moveNetEnt(e);
  if (ev) { ev.t = ev.max - (t - ev.t0); if (ev.t <= 0 || (ev.type === 'gold' && !ents.some(e => e.gold && !e.dead) && t - ev.t0 > 1)) ev = null; }
  updatePeers(dt);
  if (state === 'play') {
    if (mouseScr && inputMode === 'point' && !touchLast) { tgt.x = mouseScr.x + camX; tgt.y = mouseScr.y + camY; }
    movePlayer(dt);
    if (p.r > 18) p.r = Math.max(18, p.r - (p.r - 18)*0.012*dt); // Riesen schrumpfen langsam, wenn sie nicht fressen
    collide(); peerCollide();
    comboT -= dt; if (comboT <= 0) combo = 0;
    if (p.shield > 0) p.shield = Math.max(0, p.shield - dt);
  } else if (state === 'mpdead') { p.y -= 14*dt; mp.deadT -= dt; if (mp.deadT <= 0) mpSpawnPlayer(); }
  updateNurija(dt);
  p.inv = Math.max(0, p.inv - dt); p.puff = Math.max(0, p.puff - dt); frzT = Math.max(0, frzT - dt);
  mp.blubbCd = Math.max(0, mp.blubbCd - dt); mp.emote = Math.max(0, mp.emote - dt);
  for (let i = ents.length - 1; i >= 0; i--) if (ents[i].dead) ents.splice(i, 1);
  // Eigenen Zustand senden: 5x pro Sekunde, wenn sich nichts tut nur 1x
  mp.sendT -= dt; mp.idleT -= dt;
  if (mp.joined && mp.ch && !document.hidden && mp.sendT <= 0) {
    mp.sendT = SEND_EVERY;
    const msg = {x: Math.round(p.x*10)/10, y: Math.round(p.y*10)/10, vx: Math.round(p.vx), vy: Math.round(p.vy), r: Math.round(p.r*10)/10, d: p.dir,
      sc: score, sh: p.shield > 0 ? 1 : 0, fz: frenzy() ? 1 : 0, i: p.inv > 0 ? 1 : 0, dd: state === 'mpdead' ? 1 : 0, n: mp.name, p: mp.pal, g: nStage >= 6 ? 1 : 0};
    const key = JSON.stringify(msg);
    if (key !== mp.lastSent || mp.idleT <= 0) { mp.lastSent = key; mp.idleT = 1; mpSend('s', msg); }
  }
  mp.boardT -= dt; if (mp.boardT <= 0) { mp.boardT = 0.4; mpBoard(); }
  updateCam(); updateHUD();
}

/* --- Zeichnen (Multiplayer) --- */
function drawPeers() {
  for (const o of mp.peers.values()) {
    if (o.dead) continue;
    drawPuffer({x: o.x, y: o.y, r: o.r, dir: o.dir, pal: o.pal, glasses: o.glasses, shield: o.shield, frz: o.frz, blink: o.inv && Math.floor(time*12) % 2 === 0});
    if (state === 'play' && canEatMe(o) && !(frenzy() && !o.frz) && Math.hypot(player.x - o.x, player.y - o.y) < 80 + o.r && Math.floor(time*6) % 2 === 0)
      drawWarn(Math.round(o.x), Math.round(o.y - o.r) - 9);
  }
}
// Namensschilder als HTML-Ebene: scharf und klein, unabhängig von der Pixelgrösse
const tagEls = new Map();
function syncTags() {
  const box = $('tags'), seen = new Set();
  const show = !(ev && ev.type === 'dark'); // im Dunkeln bleiben Namen versteckt
  const put = (id, x, y, r, name, me, king, emote) => {
    seen.add(id);
    let el = tagEls.get(id);
    if (!el) { el = document.createElement('div'); el.className = 'tag'; box.appendChild(el); tagEls.set(id, el); }
    const html = (emote > 0 ? '<span class="em">BLUBB!</span>' : '') + (king ? '<span class="crown">♛</span>' : '') + `<span class="nm">${esc(name)}</span>`;
    if (el._h !== html) { el._h = html; el.innerHTML = html; }
    el.classList.toggle('me', me);
    el.style.transform = `translate(${Math.round((x - camX)*PS)}px,${Math.round((y - r*0.95 - 2 - camY)*PS)}px) translate(-50%,-100%)`;
  };
  if (mp && show) {
    for (const o of mp.peers.values()) if (!o.dead) put(o.id, o.x, o.y, o.r, o.name, false, o.id === mp.kingId, o.emote);
    if (state === 'play') put(myId, player.x, player.y, player.r, mp.name, true, mp.kingId === myId, mp.emote);
  }
  for (const [id, el] of tagEls) if (!seen.has(id)) { el.remove(); tagEls.delete(id); }
}
function drawEdgeMarkers() { // Pfeile am Rand für Spieler ausserhalb des Ausschnitts
  for (const o of mp.peers.values()) {
    if (o.dead) continue;
    const sx = o.x - camX, sy = o.y - camY;
    if (sx >= 0 && sx <= VW && sy >= 0 && sy <= VH) continue;
    const x = Math.round(clamp(sx, 3, VW - 4)), y = Math.round(clamp(sy, 3, VH - 4));
    const danger = canEatMe(o);
    if (danger && Math.floor(time*6) % 2) continue;
    ctx.fillStyle = '#04101f'; ctx.fillRect(x - 2, y - 2, 5, 5);
    ctx.fillStyle = danger ? '#ff3b5c' : PALS[o.pal].body; ctx.fillRect(x - 1, y - 1, 3, 3);
  }
}

// Testzugang nur mit ?debug in der Adresse
if (/[?&]debug\b/.test(location.search)) window.__bb = {player, ents, get mp() { return mp; }, get state() { return state; }, get score() { return score; }, hostEmit, nowS};

/* ---------- Easter Eggs ---------- */
let pokes = 0, pokeT = 0, typed = '';
$('albumCard').addEventListener('click', e => {
  e.stopPropagation(); ensureAudio();
  const now = performance.now(); pokes = now - pokeT < 900 ? pokes + 1 : 1; pokeT = now;
  const card = $('albumCard'); card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
  tone(300 + pokes*80, 200, 0.08, 'square', 0.05);
  if (pokes >= 5) {
    pokes = 0; summon = true; sfx.scream();
    $('albumLore').textContent = 'NICHT ANSTUPSEN! Er kommt in der nächsten Runde früher.';
  }
});
function secretKey(k) {
  if (k.length !== 1) return;
  typed = (typed + k).slice(-6);
  if (typed === 'nurija') { summon = true; ensureAudio(); sfx.scream(); banner('???', 'ER HAT DICH GEHÖRT'); }
}

/* ---------- Eingabe ---------- */
const steering = () => state === 'play' || state === 'levelup';
cv.addEventListener('pointerdown', e => {
  if (!steering()) return;
  if (e.pointerType === 'mouse') setAbs(e);
  else { touchLast = {x: e.clientX, y: e.clientY}; tgt.x = player.x; tgt.y = player.y; }
});
function setAbs(e) { mouseScr = {x: e.clientX / PS, y: e.clientY / PS}; tgt.x = mouseScr.x + camX; tgt.y = mouseScr.y + camY; inputMode = 'point'; }
let mouseScr = null;
window.addEventListener('pointermove', e => {
  if (!steering()) return;
  if (e.pointerType === 'mouse') setAbs(e);
  else if (touchLast) {
    inputMode = 'point';
    const dx = (e.clientX - touchLast.x) / PS * 1.35, dy = (e.clientY - touchLast.y) / PS * 1.35;
    touchLast = {x: e.clientX, y: e.clientY};
    tgt.x = clamp(tgt.x + dx, 0, W); tgt.y = clamp(tgt.y + dy, 0, H); mouseScr = null;
  }
});
window.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') touchLast = null; });
window.addEventListener('pointercancel', () => { touchLast = null; });
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (e.target && e.target.tagName === 'INPUT') { if (k === 'enter') mpJoin(); else if (k === 'escape') setTitle(); return; }
  secretKey(k);
  if (['arrowleft','arrowright','arrowup','arrowdown',' '].includes(k)) e.preventDefault();
  if (mp) {
    if (k === 'escape' || k === 'p') { if (mp.menu) resume(); else pause(); return; }
    if (k === 'b' && !e.repeat) { blubb(); return; }
    keys.add(k); return;
  }
  if (!$('join').hidden) return;
  if (k === 'enter' && state === 'title') { if (document.activeElement && document.activeElement.tagName === 'BUTTON') return; newGame(); return; }
  if (k === ' ' && state === 'title') { newGame(); return; }
  if ((k === 'enter' || k === ' ') && state === 'over' && time >= overReady) { newGame(); return; }
  if (k === 'escape' || k === 'p') { if (state === 'pause') resume(); else pause(); return; }
  keys.add(k);
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());
document.addEventListener('visibilitychange', () => { if (mp) mpVisibility(); else if (document.hidden) pause(); });
$('soloBtn').addEventListener('click', e => { e.stopPropagation(); newGame(); });
$('mpBtn').addEventListener('click', e => { e.stopPropagation(); showJoin(); });
$('joinBack').addEventListener('click', setTitle);
$('joinGo').addEventListener('click', mpJoin);
$('blubbBtn').addEventListener('click', e => { e.stopPropagation(); blubb(); });
$('overMenuBtn').addEventListener('click', setTitle);
$('menuBtn').addEventListener('click', e => { e.stopPropagation(); pause(); });
$('resumeBtn').addEventListener('click', resume);
$('restartBtn').addEventListener('click', () => { if (mp) setTitle(); else newGame(); });
$('againBtn').addEventListener('click', () => { if (time >= overReady) newGame(); });
$('soundBtn').addEventListener('click', () => { muted = !muted; soundLabel(); try { localStorage.setItem('blubberbiss-mute', muted ? '1' : '0'); } catch (e) {} });
window.addEventListener('resize', resize);

/* ---------- Start ---------- */
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (state !== 'pause') update(dt);
  draw();
  requestAnimationFrame(frame);
}
resize(); soundLabel(); setTitle(); mpPeek();
if (document.fonts && document.fonts.load) document.fonts.load('8px Silkscreen').catch(() => {});
requestAnimationFrame(frame);
})();
