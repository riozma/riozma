(() => {
'use strict';
const cv = document.getElementById('game');
let ctx = cv.getContext('2d'); // let: die Garderobe zeichnet damit kurz in eine Vorschau
const $ = id => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const pick = a => a[Math.floor(Math.random() * a.length)];

// W/H = Weltgrösse, VW/VH = sichtbarer Ausschnitt. Solo: beides gleich. Multiplayer: feste grosse Welt, Kamera folgt.
let W = 320, H = 180, VW = 320, VH = 180, camX = 0, camY = 0, PS = 3, FLOOR = 150, bg = null, kelp = [], dust = [];
const MPW = 640, MPH = 300;
let zoneIdx = 0, mp = null, frzT = 0, SURF = 36; // SURF = Höhe der Wasseroberfläche
const GRAV = 300;
// Eigene Ebene in Bildschirmauflösung, damit Nurijas Gesicht scharf bleibt
const hiCv = document.getElementById('hi'), hctx = hiCv.getContext('2d');
let hiK = 1, shX = 0, shY = 0;
function drawFace(f, x, y, w, h, flip) {
  hctx.imageSmoothingEnabled = faceSmooth(nStage); hctx.imageSmoothingQuality = 'high';
  const X = Math.round((x - camX + shX)*hiK), Y = Math.round((y - camY + shY)*hiK), Wd = Math.round(w*hiK), Hd = Math.round(h*hiK);
  if (flip) { hctx.save(); hctx.translate(X + Wd, Y); hctx.scale(-1, 1); hctx.drawImage(f, 0, 0, Wd, Hd); hctx.restore(); }
  else hctx.drawImage(f, X, Y, Wd, Hd);
}
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
  // seltene Fische & Sardinen
  rainbow: {body:'#ff6b6b',belly:'#ffffff',fin:'#7b5cff',line:'#1d1040',acc:'#ffffff'},
  kristall:{body:'#bff6ff',belly:'#ffffff',fin:'#7fd9ff',line:'#2a6c8a',acc:'#ffffff'},
  lava:    {body:'#ff5a1f',belly:'#ffd23f',fin:'#b3200d',line:'#2a0500',acc:'#fff2a8'},
  geist:   {body:'#d8e4ff',belly:'#ffffff',fin:'#a9b8e8',line:'#5a6a9a',acc:'#ffffff'},
  nacht:   {body:'#1b1f4a',belly:'#3a3f8a',fin:'#0b0d24',line:'#000000',acc:'#ffe14d'},
  sardine: {body:'#a9b9c9',belly:'#eef4fa',fin:'#7f93a8',line:'#2a3846',acc:'#5d7a99'},
  mystery: {body:'#6b2fa3',belly:'#c9a3f0',fin:'#3d1366',line:'#14052a',acc:'#ffd25a'},
};
const hsl2rgb = (h, s, l) => { const k = n => (n + h/30) % 12, a = s*Math.min(l, 1 - l), f = n => l - a*Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)); return [f(0)*255|0, f(8)*255|0, f(4)*255|0]; };
const PLAYER_PALS = ['puffer', 'pcoral', 'pmint', 'plila', 'pblau', 'prosa'];
const FISH_PALS = ['blue','orange','green','pink','purple','red','teal'];
const ZONES = [
  {name:'RIFF',             top:[14,58,98], bot:[22,70,110], sand:[32,78,114], sky:[[88,160,222],[196,228,246]]},
  {name:'LAGUNE',           top:[10,70,82], bot:[16,92,100], sand:[34,98,100], sky:[[120,196,226],[236,240,214]]},
  {name:'VIOLETTER GRABEN', top:[34,26,82], bot:[48,40,112], sand:[58,52,116], sky:[[58,40,112],[242,140,118]], stars:1},
  {name:'TIEFSEE',          top:[6,20,44],  bot:[10,32,62],  sand:[20,42,70],  sky:[[4,6,22],[24,34,72]], stars:1},
];

/* ---------- Nurija (Easter Egg) ---------- */
// Pro überlebter Begegnung wird sein Gesicht schärfer. Rein kosmetisch, kein Spielvorteil.
// Auflösung des Gesichts pro Album-Stufe (Quelle ist 96 px breit). Ab Stufe 4 weich statt pixelig.
const N_RES = [16, 24, 34, 48, 72, 120, 320]; // Breite in px pro Album-Stufe (Quelle 320 px)
const faceSmooth = stage => stage >= 4;
const N_ASPECT = 279 / 320; // Höhe / Breite des Nurija-Fischs
const nurijaSize = () => { const h = Math.min(H*0.32, 72); return {h, w: h / N_ASPECT}; };
const nurijaY = (base, ph, h) => clamp(base + Math.sin(ph*1.7)*(FLOOR - SURF)*0.26, SURF + h*0.42, FLOOR - h*0.36); // beim Durchschwimmen auf und ab
const LORE = [
  'Etwas Grosses lebt in der Tiefe.',
  'Ein Schatten mit Brille und Flossen?',
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
faceSrc.src = 'nurija-fisch.png';
function getFace(stage) {
  if (!faceImg) return null;
  if (faceCache.has(stage)) return faceCache.get(stage);
  const w = N_RES[stage], h = Math.round(w * N_ASPECT);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(faceImg, 0, 0, w, h);
  if (stage < 6) { // frühe Stufen: etwas weniger Farben, harte Kante
    const id = g.getImageData(0, 0, w, h), d = id.data, q = stage >= 4 ? 6 : stage >= 2 ? 14 : 22;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.round(d[i] / q) * q; d[i+1] = Math.round(d[i+1] / q) * q; d[i+2] = Math.round(d[i+2] / q) * q;
      if (!faceSmooth(stage)) d[i+3] = d[i+3] > 110 ? 255 : 0;
    }
    g.putImageData(id, 0, 0);
  }
  faceCache.set(stage, c); return c;
}
function drawAlbum() {
  const c = $('album'), g = c.getContext('2d');
  g.imageSmoothingEnabled = faceSmooth(nStage); g.imageSmoothingQuality = 'high'; g.clearRect(0, 0, c.width, c.height);
  $('albumCount').textContent = nStage + '/6';
  $('albumLore').textContent = LORE[nStage];
  const f = getFace(nStage); if (!f) return;
  const k = Math.min(c.width / f.width, c.height / f.height), dw = f.width*k, dh = f.height*k;
  g.drawImage(f, (c.width - dw)/2, (c.height - dh)/2, dw, dh);
  if (nStage === 0) {
    g.globalCompositeOperation = 'source-in'; g.fillStyle = '#123a63'; g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#4fd8f0'; g.font = '700 ' + Math.round(c.width/2) + 'px Silkscreen, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('?', c.width/2, c.height/2);
  }
}

/* ---------- Pixel-Art-Sprites (ChatGPT-Spritesheets, Magenta entfernt; siehe sprites/) ----------
   Jede Datei ist ein Streifen gleich grosser Bilder. Ist ein Bild noch nicht geladen, wird die
   alte, gezeichnete Version verwendet. */
const SPRITE_META = {"lootbox": {"n": 8, "w": 132, "h": 137}, "landlord": {"n": 4, "w": 184, "h": 148}, "fisher": {"n": 6, "w": 208, "h": 244}, "gull": {"n": 4, "w": 116, "h": 96}, "kraken_head": {"n": 1, "w": 324, "h": 300}, "kraken_arm": {"n": 8, "w": 52, "h": 58}, "sub": {"n": 3, "w": 204, "h": 148}, "mystery": {"n": 4, "w": 148, "h": 96}, "wheel": {"n": 1, "w": 512, "h": 512, "cx": 258.0, "cy": 270.0, "r": 142.0}, "acc": {"n": 9, "w": 56, "h": 40}, "rare": {"n": 10, "w": 148, "h": 104}, "kfx": {"n": 8, "w": 117, "h": 120}, "kgrab": {"n": 4, "w": 120, "h": 90}, "ktip": {"n": 4, "w": 54, "h": 45}, "kseg": {"n": 8, "w": 58, "h": 42, "parts": [[4, 59, 12, 51], [4, 59, 14, 48], [4, 59, 17, 46], [4, 59, 19, 44], [4, 59, 21, 42], [4, 59, 23, 40], [4, 59, 25, 38], [4, 59, 27, 36]]}, "keyes": {"n": 6, "w": 139, "h": 88}};
const SPR = {};
for (const [name, m] of Object.entries(SPRITE_META)) { const img = new Image(); img.src = 'sprites/' + name + '.png'; SPR[name] = Object.assign({img, cache: new Map()}, m); }
const sprReady = name => { const s = SPR[name]; return s && s.img.complete && s.img.naturalWidth > 0 ? s : null; };
// Ein Bild in Zielbreite w, sauber verkleinert und mit harter Kante (passt zum Pixel-Look)
function sprFrame(name, i, w) {
  const s = sprReady(name); if (!s) return null;
  w = Math.max(2, Math.round(w)); const key = i + '|' + w; let c = s.cache.get(key); if (c) return c;
  const h = Math.max(2, Math.round(w * s.h / s.w));
  c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(s.img, i*s.w, 0, s.w, s.h, 0, 0, w, h);
  try { const id = g.getImageData(0, 0, w, h), d = id.data; for (let k = 3; k < d.length; k += 4) d[k] = d[k] > 110 ? 255 : 0; g.putImageData(id, 0, 0); } catch (e) {}
  if (s.cache.size > 240) s.cache.clear();
  s.cache.set(key, c); return c;
}
// Zeichnet Bild i so, dass (cx, cy) am Ankerpunkt (ax, ay) liegt; flip spiegelt nach links
function drawSpr(name, i, cx, cy, w, flip, ax = 0.5, ay = 0.5) {
  const c = sprFrame(name, i, w); if (!c) return false;
  const y = Math.round(cy - c.height*ay);
  if (flip) { ctx.save(); ctx.translate(Math.round(cx), 0); ctx.scale(-1, 1); ctx.drawImage(c, Math.round(-c.width*ax), y); ctx.restore(); }
  else ctx.drawImage(c, Math.round(cx - c.width*ax), y);
  return true;
}
const RARE_FRAME = {rainbow: 0, kristall: 2, lava: 4, geist: 6, nacht: 8};
// Spritebasierte Fische (selten, Mystery, Immobilienhai): Breite passend zum gezeichneten Fisch
function drawFishSprite(e, x, y, w, dir, ph) {
  if (e.my) return drawSpr('mystery', Math.floor(ph*6) % 4, x, y, w*1.2, dir < 0);
  if (e.ll) return drawSpr('landlord', Math.floor(ph*6) % 4, x, y - w*0.12, w*1.3, dir < 0);
  if (e.rare && RARE_FRAME[e.pal] !== undefined) return drawSpr('rare', RARE_FRAME[e.pal] + (Math.floor(ph*5) % 2), x, y, w*1.15, dir < 0);
  return false;
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
      if (pal === 'rainbow' && c !== P.acc) c = hsl2rgb((x / w)*320 % 360, 0.85, c === P.belly ? 0.8 : 0.58); // Regenbogen
      if (pal === 'kristall' && ((x*3 + y*5) % 7 === 0)) c = [255, 255, 255];
      if (pal === 'lava' && ((x*7 + y*3) % 9 === 0)) c = [255, 236, 140];
      if (pal === 'mystery' && ((x*5 + y*7) % 11 === 0)) c = P.acc;
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
    if (y < SURF) {
      const t = y / SURF, lv = clamp(Math.floor(t*6 + th), 0, 6) / 6, a = z.sky[0], b = z.sky[1];
      col = [a[0] + (b[0] - a[0])*lv, a[1] + (b[1] - a[1])*lv, a[2] + (b[2] - a[2])*lv];
      if (z.stars && R() < 0.012 && t < 0.8) col = [235, 240, 255];
    } else if (y >= fy) {
      const n = R(), depth = (y - fy) / (H - fy + 1);
      col = y < fy + 1.5 ? sandHi : n < 0.08 ? sandHi : n < 0.18 ? sandLo : z.sand;
      if (((x + y*2) % 11 === 0) && R() < 0.6) col = sandLo;
      col = [col[0] - depth*8, col[1] - depth*10, col[2] - depth*12];
    } else {
      const t = (y - SURF) / (FLOOR - SURF), lv = clamp(Math.floor(t*bands + th), 0, bands), k = lv / bands;
      col = [z.top[0] + (z.bot[0] - z.top[0])*k, z.top[1] + (z.bot[1] - z.top[1])*k, z.top[2] + (z.bot[2] - z.top[2])*k];
      let ray = 0; const xr = x - (y - SURF)*0.45;
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
  [0.04, 0.11, 0.89, 0.96].forEach(f => { const x = Math.round(W*f); out.push({x, y: floorAt(x) + 2, h: Math.min(H*rnd(0.26, 0.48), FLOOR - SURF - 14), ph: rnd(0, 6)}); });
  return out;
}

/* ---------- Zustand ---------- */
let state = 'title', prevState = 'play', time = 0, score = 0, hi = 0, level = 1, lives = 3, combo = 0, comboT = 0, nextLife = 15000;
let shake = 0, flash = 0, flashCol = '255,60,90', spawnT = 0, bubT = 0, luT = 0, dyingT = 0, overReady = 0, zT = 0, trailT = 0;
let runT = 0, evT = 0, ev = null, lastEv = '', nurija = null, nurijaAt = 0, nurijaDone = false, summon = false, killer = '';
const ents = [], parts = [], pops = [], bubbles = [], streaks = [];
const player = {x: 0, y: 0, vx: 0, vy: 0, r: 11, dir: 1, puff: 0, inv: 0, shield: 0, sleep: true, dead: false, air: false, ship: null};
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
    FLOOR = Math.round(H * 0.9); SURF = Math.round(H * 0.15);
  } else {
    VW = W = Math.ceil(vw / PS); VH = H = Math.ceil(vh / PS);
    FLOOR = Math.round(H * 0.86); SURF = Math.round(H * 0.2);
  }
  cv.width = VW; cv.height = VH; cv.style.width = VW*PS + 'px'; cv.style.height = VH*PS + 'px';
  const dpr = Math.min(2, window.devicePixelRatio || 1); hiK = PS*dpr;
  hiCv.width = Math.round(VW*hiK); hiCv.height = Math.round(VH*hiK); hiCv.style.width = VW*PS + 'px'; hiCv.style.height = VH*PS + 'px';
  darkCv.width = VW; darkCv.height = VH;
  ctx.imageSmoothingEnabled = false;
  if (!bg || W !== oldW || H !== oldH) {
    bg = makeBG(); kelp = makeKelp();
    dust = Array.from({length: Math.round(W*H/1400)}, () => ({x: rnd(0, W), y: rnd(SURF, FLOOR), vx: rnd(-2, 2), vy: rnd(-1.5, 1.5)}));
  }
  player.x = clamp(player.x, player.r, W - player.r); player.y = clamp(player.y, SURF - 40, FLOOR - player.r*0.6);
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
// Feste Grössenverteilung: Fische wachsen nicht mit dir mit. Viel Kleines, einiges Mittleres, wenige Riesen.
function npcR() {
  const q = Math.random();
  return q < 0.48 ? rnd(2.5, 6) : q < 0.76 ? rnd(6, 11) : q < 0.92 ? rnd(11, 20) : rnd(20, 34);
}
const WTOP = () => SURF + 6;
function spawnFish(opt = {}) {
  const p = player, calm = state !== 'play';
  let r, kind = 'fish', pal = opt.pal || pick(FISH_PALS);
  if (opt.r) r = opt.r;
  else if (calm) r = rnd(3, 13);
  else r = npcR();
  r = clamp(r, 2.5, 34);
  if (!calm && !opt.r && r > 14 && Math.random() < 0.55) { kind = 'shark'; pal = 'shark'; }
  else if (opt.kind) kind = opt.kind;
  else if (Math.random() < 0.22) kind = 'stripe';
  const spr = buildFish(r, pal, kind, false);
  const fromLeft = opt.fromLeft ?? Math.random() < 0.5;
  let sp = opt.sp || rnd(22, 44) * (1 + (level - 1)*0.14);
  if (!opt.sp) { if (kind === 'shark') sp *= 1.35; if (r < 5) sp *= 1.2; if (calm) sp *= 0.7; }
  // (sp wird unten als Reisetempo gespeichert, z.B. für Haie)
  const y = opt.y ?? rnd(WTOP() + spr.h/2, FLOOR - spr.h*0.4);
  const e = {type: 'fish', kind, pal, r, spr, x: fromLeft ? -spr.w - (opt.off || 0) : W + spr.w + (opt.off || 0), y,
    vx: fromLeft ? sp : -sp, vy: 0, sp, dir: fromLeft ? 1 : -1, margin: spr.w + 4 + (opt.off || 0), bobA: kind === 'shark' ? rnd(0, 3) : rnd(0, 10), bobF: rnd(1, 3), ph: rnd(0, 6)};
  ents.push(e); return e;
}
function spawnSchool() {
  const p = player, calm = state !== 'play';
  const r = calm ? 3.5 : rnd(2.5, 4.5), pal = pick(FISH_PALS), fromLeft = Math.random() < 0.5;
  const y = rnd(WTOP() + 14, FLOOR - 20), sp = rnd(26, 40), n = 3 + Math.floor(Math.random()*3);
  for (let i = 0; i < n; i++) spawnFish({r, pal, kind: 'fish', fromLeft, sp, y: clamp(y + rnd(-9, 9), WTOP() + 4, FLOOR - 8), off: i*r*3.2});
}
function spawnJelly() {
  const r = rnd(5, 12), spr = buildJelly(r), x = rnd(W*0.15, W*0.85);
  ents.push({type: 'jelly', r, spr, x, y: H + r*3, x0: x, y0: H + r*3, t0: ft(), vy: -rnd(12, 20), ph: 0, squash: 0});
}
function spawnItem(type) {
  const fromLeft = Math.random() < 0.5;
  ents.push({type, r: type === 'pearl' ? 3 : 6, x: fromLeft ? -10 : W + 10, y: rnd(WTOP() + 16, FLOOR - 24), vx: (fromLeft ? 1 : -1) * rnd(14, 22), bobA: 4, bobF: 2, ph: rnd(0, 6), margin: 14});
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
    const e = spawnFish({r: 5, pal: 'gold', kind: 'fish', sp: 72});
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
  const {h, w} = nurijaSize(), dir = Math.random() < 0.5 ? 1 : -1, y = clamp(player.y, SURF + h*0.42, FLOOR - h*0.36);
  nurija = {isNurija: true, phase: 'warn', t: 2.4, dir, w, h, x: dir > 0 ? -w*0.2 : W + w*0.2, y, by: y, sirenT: 0, ph: 0};
  banner('NURIJA KOMMT!', nStage >= 6 ? 'DER KÖNIG DES RIFFS' : 'BEGEGNUNG ' + (nStage + 1) + ' VON 6');
}
function updateNurija(dt) {
  if (mp) { updateNurijaMP(); return; }
  const n = nurija; if (!n) return;
  n.ph += dt;
  if (n.phase === 'warn') {
    n.t -= dt; n.sirenT -= dt;
    if (n.sirenT <= 0) { n.sirenT = 0.42; sfx.siren(); }
    n.by += clamp(player.y - n.by, -1, 1) * 30 * dt; n.y = nurijaY(n.by, n.ph, n.h);
    if (n.t <= 0) { n.phase = 'pass'; shake = 6; sfx.scream(); if (player.r > 20) banner('ES GIBT IMMER', 'EINEN GRÖSSEREN FISCH'); }
    return;
  }
  const speed = (W + n.w*1.4) / 4.6;
  n.x += n.dir * speed * dt;
  n.by += clamp(player.y - n.by, -1, 1) * 14 * dt; n.y = nurijaY(n.by, n.ph, n.h);
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
  countEat(statKey(e));
  combo = comboT > 0 ? Math.min(combo + 1, 8) : 1; comboT = 1.8;
  const pts = Math.round((10 + e.r*e.r*1.2) / 5) * 5 * combo * (1 + (level - 1)*0.5) * (frenzy() ? 2 : 1) * (e.pal === 'sardine' ? 3 : e.rare ? 5 : 1) | 0;
  const first = !(stats.eaten[statKey(e)] > 1);
  if (e.my) { setTimeout(startWheel, 250); }
  if (e.gold) addCoins(50, e.x, e.y - e.r - 8);
  else if (e.rare) { addCoins(100, e.x, e.y - e.r - 8); banner('SELTEN!', first ? 'NEUER SKIN FREIGESCHALTET' : '+100 MÜNZEN'); }
  else if (e.ll) { addCoins(300, e.x, e.y - e.r - 8); banner('MIETPREISBREMSE!', 'DU HAST DEN IMMOBILIENHAI GEFRESSEN · +300'); }
  else if (e.pal === 'sardine') addCoins(2);
  else if (first && skinOk(statKey(e)) && statKey(e) !== 'jelly') popup(p.x, p.y - p.r - 14, 'NEUER SKIN!', '#8ff4ff');
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
  countCaught(src.isNurija ? 'Nurija' : src.isPeer ? 'Mitspieler' : src.kind === 'shark' ? 'Hai' : src.type === 'jelly' ? 'Qualle' : 'Fisch');
  if (mp) { mpHurt(src); return; }
  if (src.type === 'fish') BIGGER();
  killer = src.isNurija ? 'nurija' : '';
  lives--; p.inv = 1.6; shake = 4; flash = 1; flashCol = '255,60,90'; combo = 0; comboT = 0;
  sfx.hurt(); burst(p.x, p.y, '#f2c14e', 10, 50);
  if (lives <= 0) { state = 'dying'; dyingT = 1.6; p.dead = true; sfx.over(); }
}
function collect(e) {
  const p = player; e.dead = true;
  if (mp) mpSend('eat', {id: e.id, c: e.type === 'chest' ? 1 : 0});
  if (e.type === 'chest') {
    const pts = 500 * (mp ? 1 : level); score += pts; addCoins(150, e.x, e.y - 14);
    banner('SCHATZ!', '+150 MÜNZEN · +' + pts); sfx.level(); burst(e.x, e.y, '#ffd25a', 18, 60); return;
  }
  if (e.type === 'pearl') { addCoins(10); const pts = 250 * level; score += pts; popup(e.x, e.y - 6, '+' + pts, '#ffd25a'); burst(e.x, e.y, '#fff4d0', 10, 45); sfx.pearl(); }
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
        else if (e.ll) payRent(e);
        else hurt(e);
      }
    } else if (e.type === 'jelly') {
      const ddy = p.y - (e.y + e.r*0.25), rx = e.r*0.85 + p.r*0.7, ry = e.r*1.25 + p.r*0.7;
      if (dx*dx/(rx*rx) + ddy*ddy/(ry*ry) < 1) { if (frenzy()) eat(e); else hurt(e); }
    } else {
      const rr = (e.type === 'pearl' ? 4 : e.type === 'chest' ? 8 : 7) + p.r*0.8;
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
  if (e.type === 'jelly') { jellyAt(e); return; }
  if (e.type === 'chest') { chestAt(e); return; }
  e.x += e.vx*dt; e.y += Math.cos(e.ph*e.bobF)*e.bobA*dt;
  if (e.kind === 'shark' && state !== 'title') sharkLocal(e, dt);
  // Im Fressrausch fliehen die grossen Fische vor dir
  if (frenzy() && e.type === 'fish' && e.kind !== 'shark' && e.r >= player.r*EAT_RATIO) e.y += (Math.sign(e.y - player.y) || 1) * 26 * dt;
  e.y = clamp(e.y, WTOP() - 2, FLOOR - 4);
  if ((e.vx > 0 && e.x > W + e.margin) || (e.vx < 0 && e.x < -e.margin)) e.dead = true;
}

// Eingabe als Richtung + Stärke: Tastatur oder Joystick (Finger/Maus gedrückt halten und ziehen)
const joy = {on: false, id: null, bx: 0, by: 0, dx: 0, dy: 0, m: 0};
const JOY_R = 48;
function inputVec() {
  let kx = 0, ky = 0;
  if (keys.has('arrowleft') || keys.has('a')) kx--;
  if (keys.has('arrowright') || keys.has('d')) kx++;
  if (keys.has('arrowup') || keys.has('w')) ky--;
  if (keys.has('arrowdown') || keys.has('s')) ky++;
  if (kx || ky) { const m = Math.hypot(kx, ky); return {x: kx/m, y: ky/m, m: 1}; }
  if (joy.on && joy.m > 0) return {x: joy.dx, y: joy.dy, m: joy.m};
  return {x: 0, y: 0, m: 0};
}
// Höchstgeschwindigkeit: grosse Fische sind etwas langsamer
const speedFor = r => 100 - Math.min(34, (r - START_R)*1.4);

function movePlayer(dt) {
  const p = player, inp = inputVec();
  p.frz = frenzy();
  if (p.ship) { shipStep(dt, inp); return; }
  if (p.air) { // in der Luft: Schwerkraft, kaum Steuerung
    p.vy += GRAV*dt; p.vx += inp.x*inp.m*50*dt;
    p.x += p.vx*dt; p.y += p.vy*dt;
    p.x = clamp(p.x, p.r, W - p.r);
    if (p.vy > 0) landOnShip();
    if (!p.ship && p.y >= SURF) { p.air = false; p.vy *= 0.45; splash(p.x, p.r); }
    if (Math.abs(p.vx) > 5) p.dir = p.vx > 0 ? 1 : -1;
    return;
  }
  const maxS = speedFor(p.r);
  if (inp.m > 0) { // Richtung halten = beschleunigen bis zur Höchstgeschwindigkeit, kein Abbremsen
    const k = Math.min(1, dt*5 / (1 + p.r/40));
    p.vx += (inp.x*maxS*inp.m - p.vx)*k; p.vy += (inp.y*maxS*inp.m - p.vy)*k;
  } else { const drag = Math.pow(0.3, dt); p.vx *= drag; p.vy *= drag; } // loslassen: ausgleiten
  if (ev && ev.type === 'current') p.x += ev.dir * 34 * evFade() * dt;
  p.x += p.vx*dt; p.y += p.vy*dt;
  const maxY = floorAt(p.x) - p.r*0.6;
  if (p.x < p.r) { p.x = p.r; p.vx = Math.abs(p.vx)*0.35; }
  if (p.x > W - p.r) { p.x = W - p.r; p.vx = -Math.abs(p.vx)*0.35; }
  if (p.y > maxY) { p.y = maxY; p.vy = -Math.abs(p.vy)*0.35; }
  if (p.y < SURF) { // an der Oberfläche: schnell genug nach oben = Sprung
    if (p.vy < -55) { p.air = true; p.vy = p.vy*1.1 - 35; p.vx *= 1.05; splash(p.x, p.r); onJump(); }
    else { p.y = SURF; p.vy = Math.max(0, p.vy); }
  }
  if (Math.abs(p.vx) > 5) p.dir = p.vx > 0 ? 1 : -1;
  trailT -= dt;
  if (Math.hypot(p.vx, p.vy) > 40 && trailT <= 0) { trailT = 0.18; bubbles.push({x: p.x - p.dir*p.r, y: p.y, s: p.r > 14 ? 1 : 0, vy: rnd(8, 16), ph: rnd(0, 6)}); }
}

function update(dt) {
  time += dt; const p = player;
  bubT -= dt;
  if (bubT <= 0) { bubT = rnd(0.15, 0.5) * clamp(260 / W, 0.4, 1.5); const x = rnd(0, W); bubbles.push({x, y: floorAt(x) - 1, s: Math.random() < 0.25 ? 2 : Math.random() < 0.5 ? 1 : 0, vy: rnd(10, 24), ph: rnd(0, 6)}); }
  const cur = ev && ev.type === 'current' ? ev.dir * 30 * evFade() : 0;
  for (let i = bubbles.length - 1; i >= 0; i--) { const b = bubbles[i]; b.y -= b.vy*dt; b.x += (Math.sin(b.ph + time*2.2)*5 + cur)*dt; if (b.y < SURF + 1) bubbles.splice(i, 1); }
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
  else if (state === 'caught') updateCaught(dt);
  else if (state === 'dying') { p.y -= 18*dt; dyingT -= dt; if (dyingT <= 0) showOver(); }
  if (state === 'play' || state === 'levelup' || state === 'caught') directorTick(dt, [p]);
  updateFeats(dt); updateLoot(dt); propIncome(dt);

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
  if (state === 'play' || state === 'levelup' || state === 'caught') checkRecord();
  updateCam(); updateHUD();
}

/* ---------- Oberfläche, Schiffe, Möwen, Krake ----------
   Alle drei bewegen sich nach einer festen Formel ab ihrer Startzeit t0. Solo zählt die Spielzeit,
   im Multiplayer die gemeinsame Uhr. So sehen im Multiplayer alle dasselbe. */
const feats = [];
let caught = null, dirT = {ship: 10, bird: 35, kraken: 70}, featSeq = 0;
const ft = () => mp ? nowS() : time;
const fid = () => (mp ? myId.slice(0, 4) : 'l') + 'f' + (++featSeq).toString(36);
const SKY = () => Math.max(6, Math.round(SURF*0.32));
const KS = () => clamp(H / 180, 1, 1.5);
const CATCH_LABEL = {ship: 'Fischer', bird: 'Möwe', kraken: 'Krake'};

function addFeat(d) {
  if (!d || !d.id || feats.some(f => f.id === d.id)) return;
  feats.push(Object.assign({}, d));
  if (d.type === 'kraken') { banner('DER KRAKE ERWACHT!', 'AUS DER TIEFE · ' + (d.x < player.x - 40 ? 'LINKS' : d.x > player.x + 40 ? 'RECHTS' : 'UNTER DIR')); tone(70, 40, 1.6, 'sawtooth', 0.09); tone(55, 35, 1.8, 'square', 0.05, 0.3); }
  if (d.type === 'bird') { tone(1500, 900, 0.18, 'sawtooth', 0.05); tone(1400, 1000, 0.16, 'sawtooth', 0.04, 0.22); }
}
function emitFeat(d) { if (mp) { addFeat(d); mpSend('ft', {d}); } else addFeat(d); }

/* --- Formeln --- */
const shipX = (s, t) => s.x0 + s.vx*((s.sunk ? Math.min(t, s.sunk) : t) - s.t0);
// Versenkte Schiffe sinken bis auf den Grund
const deckY = (s, t) => s.sunk ? Math.round(Math.min(SURF - 6 + (t - s.sunk)*16, floorAt(shipX(s, t)) - 4)) : SURF - 6 + Math.round(Math.sin((t - s.t0)*1.6));
const SHIP_MAX_R = 16; // grössere Fische sind zu schwer für ein Boot
const SINK_JOKES = ['ZU SCHWER FÜR DIESEN KAHN', 'DIE VERSICHERUNG ZAHLT NICHT', 'DER FISCHER SCHWIMMT JETZT AUCH', 'TITANIC, ABER MIT FISCH', 'DIÄT WÄRE EINE OPTION'];
function sinkShip(s, remote) {
  if (s.sunk) return;
  s.sunk = remote ? +remote : ft();
  splash(shipX(s, s.sunk), 8); shake = Math.max(shake, 5);
  tone(160, 50, 0.9, 'sawtooth', 0.08); tone(90, 40, 1.2, 'square', 0.05, 0.2);
  if (player.ship === s) { player.ship = null; player.air = true; player.vy = -30; }
  if (!remote) {
    banner('SCHIFF VERSENKT!', pick(SINK_JOKES)); score += 300; addCoins(20, shipX(s, s.sunk), SURF - 14);
    if (mp) mpSend('sink', {id: s.id, t: s.sunk});
  } else feedPush(`<b>${esc(peerName(remote.f || ''))}</b> versenkt ein Schiff`);
}
function birdPos(b, t) {
  const tau = t - b.t0, sky = SKY();
  if (tau < b.d) { const u = Math.max(0, tau / b.d); return {x: b.sx + (b.tx - b.sx)*u, y: sky + (b.ty - sky)*u*u, dive: true, u}; }
  const u = (tau - b.d) / b.d;
  return {x: b.tx + (b.ex - b.tx)*u, y: b.ty + (sky - b.ty)*(1 - (1 - u)*(1 - u)), dive: false, u, done: u >= 1};
}
function krakenAt(k, t) {
  const tau = t - k.t0, ks = KS(), ease = u => u*u*(3 - 2*u);
  let rise = 0;
  if (tau >= 2 && tau < 4) rise = ease((tau - 2) / 2); else if (tau >= 4 && tau < 10.5) rise = 1; else if (tau >= 10.5) rise = 1 - ease(clamp((tau - 10.5) / 2.5, 0, 1));
  const y0 = FLOOR + 34*ks, top = FLOOR - 62*ks;
  const hx = k.x + Math.sin(tau*0.7)*10*ks, hy = y0 + (top - y0)*rise + Math.sin(tau*1.3)*3;
  const ext = tau < 10.5 ? clamp((tau - 3) / 1.5, 0, 1) : rise;
  const arms = [], L = 92*ks*ext, n = 16;
  if (L > 2) for (let i = 0; i < 8; i++) {
    let x = hx + (i - 3.5)*4*ks, y = hy + 8*ks, th = -Math.PI/2 + (i - 3.5)*0.34 + Math.sin(tau*1.3 + i*0.9)*0.75;
    const pts = [];
    for (let j = 0; j < n; j++) {
      th += Math.sin(tau*2.2 + i + j*0.35)*0.1;
      x += Math.cos(th)*L/n; y += Math.sin(th)*L/n;
      pts.push({x, y, r: (5.5 - 4*j/n)*ks});
    }
    arms.push(pts);
  }
  return {hx, hy, rise, ext, arms, ks, tau, done: tau > 13};
}

/* --- Regisseur: Solo lokal, im Multiplayer nur der Host --- */
function resetDirector() { digState.clear(); dirT = {ship: rnd(6, 12), bird: rnd(30, 50), kraken: rnd(55, 90), rare: rnd(35, 70), sardine: rnd(50, 90), landlord: rnd(60, 110), chest: rnd(45, 80)}; feats.length = 0; caught = null; }
function directorTick(dt, alive) {
  const t = ft();
  dirT.ship -= dt; dirT.bird -= dt; dirT.kraken -= dt; dirT.rare -= dt; dirT.sardine -= dt; dirT.landlord -= dt; dirT.chest -= dt;
  if (dirT.rare <= 0) { dirT.rare = rnd(60, 110); spawnSpecial('rare'); }
  if (dirT.sardine <= 0) { dirT.sardine = rnd(80, 140); spawnSpecial('sardine'); }
  if (dirT.landlord <= 0) { dirT.landlord = rnd(90, 160); if (!ents.some(e => e.ll && !e.dead)) spawnSpecial('landlord'); }
  if (dirT.chest <= 0) { dirT.chest = rnd(70, 130); if (!ents.some(e => e.type === 'chest' && !e.dead)) spawnSpecial('chest'); }
  dirT.mystery = (dirT.mystery ?? rnd(60, 110)) - dt; dirT.loot = (dirT.loot ?? rnd(70, 120)) - dt;
  if (dirT.mystery <= 0) { dirT.mystery = rnd(100, 170); if (!ents.some(e => e.my && !e.dead)) spawnSpecial('mystery'); }
  if (dirT.loot <= 0) {
    dirT.loot = rnd(130, 210);
    if (!feats.some(f => f.type === 'loot')) {
      const x = Math.round(clamp(pick(alive).x + rnd(-120, 120), 30, W - 30));
      emitFeat({id: fid(), type: 'loot', t0: t, x}); if (mp) mpSend('ann', {a: 'loot'}); announce('loot');
    }
  }
  if (dirT.ship <= 0) {
    dirT.ship = rnd(38, 65);
    if (feats.filter(f => f.type === 'ship' && !f.sunk).length < (mp ? 2 : 1)) {
      const fl = Math.random() < 0.5, L = Math.round(rnd(40, 56));
      emitFeat({id: fid(), type: 'ship', t0: t, L, x0: fl ? -L : W + L, vx: Math.round((fl ? 1 : -1)*rnd(8, 14)*10)/10});
    }
  }
  if (dirT.bird <= 0) { // ab und zu stürzt eine Möwe einfach so ins Wasser
    dirT.bird = rnd(28, 50);
    if (!feats.some(f => f.type === 'bird')) {
      const who = pick(alive), tx = clamp(who.x + rnd(-60, 60), 20, W - 20);
      emitFeat(mkBird(tx, SURF + rnd(16, 36), rnd(1.3, 1.7)));
    }
  }
  dirT.sub = (dirT.sub ?? rnd(40, 80)) - dt;
  if (dirT.sub <= 0) {
    dirT.sub = rnd(90, 160);
    if (!feats.some(f => f.type === 'sub')) {
      const fl = Math.random() < 0.5;
      emitFeat({id: fid(), type: 'sub', t0: t, x0: fl ? -40 : W + 40, vx: fl ? 9 : -9, y: Math.round(rnd(SURF + (FLOOR - SURF)*0.35, FLOOR - 40))});
      if (mp) mpSend('ann', {a: 'sub'}); announce('sub');
    }
  }
  subTick(t);
  if (dirT.kraken <= 0 && !nurija) {
    dirT.kraken = rnd(85, 140);
    if (!feats.some(f => f.type === 'kraken')) emitFeat({id: fid(), type: 'kraken', t0: t, x: Math.round(clamp(pick(alive).x + rnd(-50, 50), 50, W - 50))});
  }
}
// Forschungs-U-Boot: fährt langsam durch, Scheinwerfer an, wirft ab und zu eine Überraschung ab
const subPos = (f, t) => ({x: f.x0 + f.vx*(t - f.t0), y: f.y + Math.sin((t - f.t0)*0.8)*4});
function subTick(t) {
  for (const f of feats) {
    if (f.type !== 'sub') continue;
    if (f.nd === undefined) f.nd = t + rnd(5, 9);
    if (t < f.nd) continue;
    f.nd = t + rnd(11, 18);
    const sp = subPos(f, t); if (sp.x < 10 || sp.x > W - 10) continue;
    const q = Math.random(), x = Math.round(sp.x), y = Math.round(sp.y + 8);
    const type = q < 0.45 ? 'pearl' : q < 0.7 ? 'shield' : q < 0.88 ? 'chest' : 'mystery';
    if (mp) {
      let d;
      if (type === 'chest') d = {id: nid(), type: 'chest', r: 6, x0: x, y0: y, vy: 18, t0: t};
      else if (type === 'mystery') { d = mkNetFish({r: 6, pal: 'mystery', kind: 'fish', sp: 40, bobA: 20, bobF: 3, y, fromLeft: f.vx > 0}); Object.assign(d, {my: 1, x0: x, t0: t}); }
      else d = {id: nid(), type, r: type === 'pearl' ? 3 : 6, x0: x, y0: y, vx: Math.round(f.vx*0.5), t0: t, bobA: 4, bobF: 2, ph0: 0};
      hostEmit({k: 'sp', ann: type === 'mystery' ? 'mystery' : 'subdrop', e: [d]});
    } else {
      if (type === 'chest') ents.push({id: 'c' + t, type: 'chest', r: 6, x0: x, y0: y, vy: 18, t0: t, x, y, ph: 0, local: 1});
      else if (type === 'mystery') { const e = spawnFish({r: 6, pal: 'mystery', kind: 'fish', sp: 40, y, fromLeft: f.vx > 0}); Object.assign(e, {x, my: 1, rare: 1, bobA: 20, bobF: 3}); announce('mystery'); }
      else ents.push({type, r: type === 'pearl' ? 3 : 6, x, y, vx: f.vx*0.5, bobA: 4, bobF: 2, ph: 0, margin: 14});
      if (type !== 'mystery') announce('subdrop', '', x, y);
    }
  }
}
function drawSub(f) {
  const t = ft(), sp = subPos(f, t), x = Math.round(sp.x), y = Math.round(sp.y), d = f.vx > 0 ? 1 : -1;
  // Scheinwerfer-Kegel nach vorne unten
  ctx.fillStyle = 'rgba(255,250,200,0.10)';
  ctx.beginPath(); ctx.moveTo(x + d*15, y + 1); ctx.lineTo(x + d*95, y + 38); ctx.lineTo(x + d*70, y + 62); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,250,200,0.08)';
  ctx.beginPath(); ctx.moveTo(x + d*15, y + 1); ctx.lineTo(x + d*88, y + 44); ctx.lineTo(x + d*76, y + 54); ctx.closePath(); ctx.fill();
  if (drawSpr('sub', Math.floor(time*12) % 3, x, y - 3, 46, d < 0)) return;
  ctx.save(); ctx.translate(x, y); ctx.scale(d, 1);
  ctx.fillStyle = '#3a2a00';
  for (let yy = -6; yy <= 6; yy++) { const w = Math.round(16*Math.sqrt(1 - (yy*yy)/49)); ctx.fillRect(-w - 1, yy, w*2 + 2, 1); }
  for (let yy = -5; yy <= 5; yy++) { const w = Math.round(15*Math.sqrt(1 - (yy*yy)/36)); ctx.fillStyle = yy < -2 ? '#ffe27a' : yy > 3 ? '#c4962b' : '#f2c14e'; ctx.fillRect(-w, yy, w*2, 1); }
  ctx.fillStyle = '#3a2a00'; ctx.fillRect(-5, -11, 9, 6); ctx.fillStyle = '#f2c14e'; ctx.fillRect(-4, -10, 7, 5);
  ctx.fillStyle = '#3a2a00'; ctx.fillRect(1, -15, 1, 5); ctx.fillRect(1, -15, 3, 1); // Periskop
  for (const px of [-8, -1, 6]) { ctx.fillStyle = '#04101f'; ctx.fillRect(px - 2, -2, 5, 5); ctx.fillStyle = '#8ff4ff'; ctx.fillRect(px - 1, -1, 3, 3); ctx.fillStyle = '#ffffff'; ctx.fillRect(px - 1, -1, 1, 1); }
  ctx.fillStyle = '#fff6c0'; ctx.fillRect(14, -1, 3, 3); // Scheinwerfer
  ctx.fillStyle = '#5a4a20'; const pr = Math.floor(time*12) % 2; ctx.fillRect(-19, pr ? -4 : -1, 2, pr ? 3 : 5); ctx.fillRect(-19, pr ? 1 : -1, 2, pr ? 3 : 2); // Propeller
  ctx.restore();
}
function mkBird(tx, ty, d) {
  const fl = Math.random() < 0.5;
  return {id: fid(), type: 'bird', t0: ft(), d: +d.toFixed(2), sx: Math.round(tx + (fl ? -1 : 1)*rnd(150, 200)), tx: Math.round(tx), ty: Math.round(ty), ex: Math.round(tx + (fl ? 1 : -1)*170)};
}
// Wer rausspringt, riskiert eine Möwe – aber eher selten
function onJump() {
  if ((state !== 'play') || feats.some(f => f.type === 'bird') || Math.random() > 0.2) return;
  const p = player, tAir = 2*Math.abs(p.vy) / GRAV;
  emitFeat(mkBird(clamp(p.x + p.vx*tAir, 20, W - 20), SURF + 6, tAir + 0.6));
}
function splash(x, r) {
  for (let i = 0; i < 6 + r; i++) parts.push({x: x + rnd(-r, r), y: SURF, vx: rnd(-30, 30), vy: -rnd(30, 80), life: rnd(0.3, 0.6), c: i % 3 ? '#cfefff' : '#ffffff', s: Math.random() < 0.3 ? 2 : 1});
  tone(320, 120, 0.12, 'triangle', 0.05);
}

/* --- Schiffe: draufspringen, Gold klauen, nicht zu lange bleiben --- */
const SHIP_WARN = 2.2, SHIP_CATCH = 3.6;
function landOnShip() {
  const p = player, t = ft();
  for (const s of feats) {
    if (s.type !== 'ship') continue;
    const sx = shipX(s, t), dy = deckY(s, t), foot = p.y + p.r*0.55;
    if (s.sunk) continue;
    if (Math.abs(p.x - sx) < s.L/2 - 2 && foot >= dy - 1 && foot <= dy + 7) {
      if (p.r > SHIP_MAX_R) { sinkShip(s); p.vy = -40; return; } // zu schwer: Boot bricht
      Object.assign(p, {ship: s, air: false, vx: 0, vy: 0, shipOff: p.x - sx, shipT: 0, goldT: 0.35, warned: false});
      tone(180, 120, 0.08, 'square', 0.05); popup(p.x, dy - p.r - 8, 'AN BORD!', '#ffd25a');
      return;
    }
  }
}
function shipStep(dt, inp) {
  const p = player, s = p.ship, t = ft();
  if (!feats.includes(s)) { p.ship = null; p.air = true; p.vy = 0; return; }
  const sx = shipX(s, t), dy = deckY(s, t);
  p.shipOff += inp.x*inp.m*42*dt;
  p.x = sx + p.shipOff; p.y = dy - p.r*0.55;
  if (inp.m > 0.2 && Math.abs(inp.x) > 0.2) p.dir = inp.x > 0 ? 1 : -1;
  const off = () => { p.ship = null; p.air = true; };
  if (Math.abs(p.shipOff) > s.L/2 - 1) { off(); p.vy = -30; p.vx = Math.sign(p.shipOff)*40 + s.vx; return; }
  if (inp.m > 0.35 && inp.y < -0.55) { off(); p.vy = -160; p.vx = inp.x*70 + s.vx; splash(p.x, 2); return; }
  if (inp.m > 0.35 && inp.y > 0.6) { off(); p.vy = -70; p.vx = (p.shipOff >= 0 ? 1 : -1)*80; return; }
  p.goldT -= dt;
  if (p.goldT <= 0) { // Gold klauen
    p.goldT = 0.45;
    const pts = 100 * (mp ? 1 : level) * (frenzy() ? 2 : 1); score += pts; stats.gold += pts; saveStats();
    popup(p.x + rnd(-4, 4), p.y - p.r - 6, '+' + pts + ' ●5', '#ffd25a'); addCoins(5);
    burst(p.x, p.y - p.r*0.4, '#ffd25a', 4, 30); tone(1568, 2093, 0.06, 'square', 0.04);
  }
  p.shipT += dt;
  if (p.shipT >= SHIP_WARN && !p.warned) { p.warned = true; popup(sx, dy - 22, 'HE DU!', '#ff3b5c', 10); tone(500, 300, 0.25, 'sawtooth', 0.06); }
  if (p.shipT >= SHIP_CATCH) startCaught('ship', s);
}

/* --- Gefangen werden (Schiff, Möwe, Krake) mit Animation --- */
function startCaught(by, f) {
  const p = player;
  if (state !== 'play' || caught) return;
  if (by !== 'ship') {
    if (p.inv > 0) return;
    if (p.shield > 0) { p.shield = 0; p.inv = 1.2; sfx.pop(); burst(p.x, p.y, '#9ff3ff', 14, 55); p.vy = 60; return; }
  }
  caught = {by, f, t: 0, scale: 1, bites: 0};
  state = 'caught'; p.ship = null; p.air = false; p.vx = p.vy = 0; combo = 0; comboT = 0;
  joy.on = false; joy.m = 0; joyShow();
  if (nurija) nurija.survive = false;
  shake = 3; sfx.hurt();
  banner(by === 'ship' ? 'GEFISCHT!' : by === 'bird' ? 'GESCHNAPPT!' : 'DER KRAKE!', by === 'ship' ? 'ZU LANGE AN BORD' : by === 'bird' ? 'DIE MÖWE HAT DICH' : 'GEPACKT');
}
function updateCaught(dt) {
  const c = caught, p = player, t = ft(); if (!c) return;
  c.t += dt;
  if (c.by === 'ship') {
    const s = c.f, sx = shipX(s, t), dy = deckY(s, t), sd = s.vx > 0 ? 1 : -1;
    const fx = sx - sd*(s.L/2 - 8), fy = dy - 13;
    c.fx = fx; c.fy = fy;
    if (c.t < 0.45) { p.x = sx + (p.shipOff || 0); p.y = dy - p.r*0.55; }
    else if (c.t < 1.0) { const u = (c.t - 0.45) / 0.55; p.x += (fx + sd*3 - p.x)*Math.min(1, u*0.5 + dt*6); p.y += (fy - 4 - p.y)*Math.min(1, u*0.5 + dt*6); }
    else {
      p.x = fx + sd*3; p.y = fy - 4;
      c.scale = Math.max(0, 1 - (c.t - 1) / 0.95);
      const bite = Math.floor((c.t - 1) / 0.3);
      if (bite > c.bites && bite <= 3) { c.bites = bite; popup(fx, fy - 14, 'MAMPF', '#ffffff', 9); burst(p.x, p.y, '#f2f2f2', 6, 30); tone(140, 80, 0.1, 'square', 0.07); }
    }
    if (c.t > 2.05) finishCaught();
  } else if (c.by === 'bird') {
    const b = birdPos(c.f, t); c.f.carry = true;
    p.x = b.x; p.y = b.y + 4 + p.r*0.4; p.dir = c.f.ex > c.f.tx ? 1 : -1;
    if (c.t > 1.7 || b.done) finishCaught();
  } else {
    const k = krakenAt(c.f, t);
    p.x += (k.hx - p.x)*Math.min(1, dt*3.5); p.y += (k.hy + 6*k.ks - p.y)*Math.min(1, dt*3.5);
    if (c.t > 0.7) c.scale = Math.max(0, 1 - (c.t - 0.7) / 0.6);
    if (c.t > 0.8 && !c.bites) { c.bites = 1; popup(k.hx, k.hy - 20, 'SCHLÜRF', '#ff9ad5', 9); }
    if (c.t > 1.4) finishCaught();
  }
}
function finishCaught() {
  const by = caught.by, p = player; caught = null;
  countCaught(CATCH_LABEL[by]);
  if (mp) { mpDie({isFeat: true, label: CATCH_LABEL[by]}); return; }
  lives--; killer = by; p.r = Math.max(START_R, p.r*0.6); // wer erwischt wird, wird kleiner
  shake = 4; flash = 1; flashCol = '255,60,90';
  if (lives <= 0) { state = 'dying'; dyingT = 1.2; p.dead = true; sfx.over(); return; }
  Object.assign(p, {x: clamp(p.x, 30, W - 30), y: SURF + 30, vx: 0, vy: 0, inv: 2.2, air: false, ship: null});
  state = 'play';
}

/* --- Kollisionen & Bewegung --- */
function updateFeats(dt) {
  const t = ft(), p = player, play = state === 'play';
  for (let i = feats.length - 1; i >= 0; i--) {
    const f = feats[i];
    if (f.type === 'ship') {
      const x = shipX(f, t);
      if (((f.vx > 0 && x > W + f.L + 10) || (f.vx < 0 && x < -f.L - 10) || (f.sunk && t - f.sunk > 35)) && !(caught && caught.f === f)) { feats.splice(i, 1); continue; }
      if (f.sunk && t - f.sunk < 6 && Math.random() < 0.3) bubbles.push({x: x + rnd(-f.L/2, f.L/2), y: deckY(f, t), s: 1 + (Math.random() < 0.5), vy: rnd(18, 34), ph: rnd(0, 6)});
    } else if (f.type === 'sub') {
      const sp = subPos(f, t);
      if ((f.vx > 0 && sp.x > W + 60) || (f.vx < 0 && sp.x < -60)) { feats.splice(i, 1); continue; }
      if (Math.random() < 0.08) bubbles.push({x: sp.x - Math.sign(f.vx)*18, y: sp.y, s: 1, vy: rnd(10, 20), ph: rnd(0, 6)});
    } else if (f.type === 'bird') {
      const b = birdPos(f, t);
      if (b.done && !(caught && caught.f === f)) { feats.splice(i, 1); continue; }
      if (b.y > SURF - 2 && !f.splashed && b.dive) { f.splashed = true; splash(b.x, 3); }
      if (b.y > SURF) for (const e of ents) if (!e.dead && e.type === 'fish' && e.r < 10 && Math.hypot(e.x - b.x, e.y - b.y) < e.r + 4) { e.dead = true; burst(e.x, e.y, PALS[e.pal].body, 5); }
      if (play && !f.carry && Math.hypot(p.x - b.x, p.y - b.y) < 6 + p.r*0.7) startCaught('bird', f);
    } else if (f.type === 'kraken') {
      const k = krakenAt(f, t); f._k = k;
      if (k.done) { feats.splice(i, 1); continue; }
      if (k.tau < 2.2) { shake = Math.max(shake, 1.5); if (Math.random() < 0.5) bubbles.push({x: f.x + rnd(-20, 20), y: FLOOR - 2, s: 1 + (Math.random() < 0.4), vy: rnd(20, 40), ph: rnd(0, 6)}); }
      const hit = (x, y, rr) => {
        const ex = (x - k.hx) / (20*k.ks + rr), ey = (y - k.hy) / (16*k.ks + rr);
        if (ex*ex + ey*ey < 1 && k.rise > 0.3) return true;
        for (const arm of k.arms) for (const q of arm) if (Math.hypot(x - q.x, y - q.y) < q.r + rr) return true;
        return false;
      };
      if (k.ext > 0.2) for (const e of ents) if (!e.dead && e.type === 'fish' && hit(e.x, e.y, e.r*0.5)) { e.dead = true; burst(e.x, e.y, PALS[e.pal].body, 6); }
      if (play && k.rise > 0.3 && hit(p.x, p.y, p.r*0.6)) startCaught('kraken', f);
    }
  }
}

/* --- Zeichnen --- */
function drawSurface() {
  const x0 = Math.max(0, camX - 2), x1 = Math.min(W, camX + VW + 2);
  for (let x = x0; x < x1; x++) {
    const w = Math.sin(x*0.09 + time*2.1) + Math.sin(x*0.033 - time*1.3)*0.6, y = SURF + Math.round(w*0.8);
    ctx.fillStyle = 'rgba(190,235,255,0.55)'; ctx.fillRect(x, y - 1, 1, 1);
    ctx.fillStyle = 'rgba(120,200,240,0.25)'; ctx.fillRect(x, y, 1, 2);
    if (((x*7 + Math.floor(time*3)) % 23) === 0) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y - 1, 2, 1); }
  }
}
function drawShip(s) {
  const t0 = ft();
  if (s.sunk) { // schräg absinken
    const a = Math.min(0.45, (t0 - s.sunk)*0.25) * (s.vx > 0 ? 1 : -1), cx = shipX(s, t0), cy = deckY(s, t0);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(a); ctx.translate(-cx, -cy);
    drawShipBody(s, true);
    ctx.restore(); return;
  }
  drawShipBody(s, false);
}
function drawShipBody(s, wreck) {
  const t = ft(), sx = Math.round(shipX(s, t)), dy = deckY(s, t), L = s.L, sd = s.vx > 0 ? 1 : -1, x0 = sx - L/2;
  if (!wreck && caught && caught.f === s && caught.by === 'ship' && sprReady('fisher')) { // Nahaufnahme: der Fischer isst dich
    const ct = caught.t, fr = ct < 0.45 ? 1 : ct < 0.8 ? 2 : ct < 1.2 ? 3 : ct < 1.65 ? 4 : 5;
    const fh = Math.min(SURF + 8, L*1.1*SPR.fisher.h/SPR.fisher.w); // passt in den Himmel
    drawSpr('fisher', fr, sx, SURF + 10, fh*SPR.fisher.w/SPR.fisher.h, sd < 0, 0.5, 1);
    return;
  }
  // Rumpf
  for (let y = 0; y < 9; y++) {
    const inset = Math.round(y*0.9) + (y > 6 ? 2 : 0);
    ctx.fillStyle = y === 0 ? '#c98a4b' : y === 1 ? '#3a1d0c' : y < 4 ? '#8a4a22' : y === 4 ? '#e9e2cf' : '#6b3518';
    ctx.fillRect(Math.round(x0 + inset - (sd > 0 ? 0 : 2)), dy + y, Math.round(L - inset*2 + 2), 1);
  }
  ctx.fillStyle = '#2a1408'; for (let i = 6; i < L - 6; i += 7) ctx.fillRect(Math.round(x0 + i), dy + 2, 2, 1);
  // Mast & Segel
  const mx = sx + sd*2;
  ctx.fillStyle = '#5a3418'; ctx.fillRect(mx, dy - 26, 1, 26);
  for (let y = 0; y < 18; y++) { const w = Math.round((y + 2)*0.75); ctx.fillStyle = y % 6 === 5 ? '#d8d2c0' : '#f4efe0'; ctx.fillRect(sd > 0 ? mx + 1 : mx - w, dy - 24 + y, w, 1); }
  ctx.fillStyle = '#ff4f8b'; ctx.fillRect(mx, dy - 29, sd*4 || 4, 2);
  // Kajüte hinten
  const cx = sx - sd*(L/2 - 10);
  ctx.fillStyle = '#7a3f1d'; ctx.fillRect(cx - 5, dy - 7, 10, 7);
  ctx.fillStyle = '#ffd25a'; ctx.fillRect(cx - 2, dy - 5, 3, 2);
  ctx.fillStyle = '#3a1d0c'; ctx.fillRect(cx - 6, dy - 8, 12, 1);
  // Goldkiste vorne
  const gx = sx + sd*(L/2 - 9);
  ctx.fillStyle = '#5a3a00'; ctx.fillRect(gx - 4, dy - 5, 8, 5);
  ctx.fillStyle = '#ffcf3a'; ctx.fillRect(gx - 3, dy - 6, 6, 2); ctx.fillRect(gx - 1, dy - 4, 2, 2);
  if (Math.floor(time*4 + s.x0) % 3 === 0) { ctx.fillStyle = '#fff6c0'; ctx.fillRect(gx + 2, dy - 9, 1, 2); ctx.fillRect(gx + 1, dy - 8, 3, 1); }
  // Fischer
  if (wreck) { ctx.fillStyle = '#04101f'; ctx.fillRect(sx - 3, dy + 2, 6, 4); ctx.fillRect(sx + 8, dy + 1, 3, 3); return; } // Leck, kein Fischer mehr
  const mine = player.ship === s || (caught && caught.f === s);
  const alert = mine && (caught || player.shipT >= SHIP_WARN);
  drawFisher(sx - sd*(L/2 - 4), dy, sd, alert, caught && caught.f === s ? caught.t : 0);
  if (mine && !caught && player.ship) { // Gefahrenanzeige über dem Fisch
    const k = clamp(player.shipT / SHIP_CATCH, 0, 1), bx = Math.round(player.x - 8), by = Math.round(player.y - player.r - 14);
    ctx.fillStyle = '#04101f'; ctx.fillRect(bx - 1, by - 1, 18, 4);
    ctx.fillStyle = k > SHIP_WARN / SHIP_CATCH ? (Math.floor(time*8) % 2 ? '#ff3b5c' : '#ffd25a') : '#ffd25a'; ctx.fillRect(bx, by, Math.round(16*k), 2);
  }
}
function drawFisher(x, dy, sd, alert, ct) {
  x = Math.round(x);
  const stand = alert ? 0 : 3, top = dy - 12 + stand;
  ctx.fillStyle = '#2b4c7e'; ctx.fillRect(x - 2, top + 5, 4, 7 - stand);       // Körper
  ctx.fillStyle = '#f0c49a'; ctx.fillRect(x - 2, top + 1, 4, 4);              // Kopf
  ctx.fillStyle = '#8a5a2b'; ctx.fillRect(x - 2, top + 4, 4, 1);              // Bart
  ctx.fillStyle = '#e8d24a'; ctx.fillRect(x - 3, top, 6, 1); ctx.fillRect(x - 2, top - 1, 4, 1); // Hut
  ctx.fillStyle = '#04101f'; ctx.fillRect(x + (sd > 0 ? 0 : -1), top + 2, 1, 1);
  if (alert) {
    ctx.fillStyle = '#f0c49a';
    const raise = ct > 0.45 ? -4 : 0;
    ctx.fillRect(x + sd*2, top + 5 + raise, sd*3 || 3, 1); // Arm
    if (ct > 1.0) { ctx.fillStyle = '#04101f'; ctx.fillRect(x + (sd > 0 ? 1 : -2), top + 3, 2, Math.floor(time*10) % 2 ? 2 : 1); } // kauender Mund
    if (ct === 0 && Math.floor(time*6) % 2 === 0) drawWarn(x, top - 9);
  }
}
function drawBird(f) {
  const b = birdPos(f, ft()), x = Math.round(b.x), y = Math.round(b.y), dir = f.ex > f.sx ? 1 : -1;
  const folded = b.dive && b.u > 0.55, flap = Math.floor(time*10) % 2;
  if (drawSpr('gull', f.carry ? 3 : folded ? 2 : flap, x, y, f.carry ? 26 : 22, dir < 0)) {
    if (b.dive && b.u < 0.8 && Math.floor(time*6) % 2 === 0) drawWarn(clamp(x, camX + 4, camX + VW - 6), clamp(y - 12, camY + 22, camY + VH - 10));
    return;
  }
  ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
  ctx.fillStyle = '#f4f6fa'; ctx.fillRect(-4, -1, 8, 3);                  // Körper
  ctx.fillStyle = '#c9d2de'; ctx.fillRect(-4, 1, 6, 1);
  ctx.fillStyle = '#f4f6fa'; ctx.fillRect(3, -3, 3, 3);                   // Kopf
  ctx.fillStyle = '#04101f'; ctx.fillRect(5, -2, 1, 1);
  ctx.fillStyle = '#ffa53a'; ctx.fillRect(6, -1, 2, 1);                   // Schnabel
  ctx.fillStyle = '#3a3f4a'; ctx.fillRect(-6, 0, 2, 1);                   // Schwanz
  ctx.fillStyle = '#9aa6b6';
  if (folded) ctx.fillRect(-3, -2, 6, 1);
  else if (flap) { ctx.fillRect(-3, -4, 2, 3); ctx.fillRect(-5, -6, 3, 2); ctx.fillStyle = '#3a3f4a'; ctx.fillRect(-7, -7, 2, 1); }
  else { ctx.fillRect(-3, 2, 2, 2); ctx.fillRect(-6, 3, 3, 1); ctx.fillStyle = '#3a3f4a'; ctx.fillRect(-8, 3, 2, 1); }
  ctx.restore();
  // Warnung: Möwe ausserhalb des Bildes oder im Anflug
  if (b.dive && b.u < 0.8 && Math.floor(time*6) % 2 === 0) drawWarn(clamp(x, camX + 4, camX + VW - 6), clamp(y - 10, camY + 22, camY + VH - 10));
}
// Ein Sprite um seinen Mittelpunkt gedreht zeichnen
function drawSprRot(name, i, x, y, w, ang, flipY) {
  const c = sprFrame(name, i, w); if (!c) return false;
  ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(ang); if (flipY) ctx.scale(1, -1);
  ctx.drawImage(c, -Math.round(c.width/2), -Math.round(c.height/2)); ctx.restore();
  return true;
}
const KSEG_TH = [40, 35, 30, 26, 22, 18, 14, 10]; // Dicke der Arm-Stücke im Bild
function drawKrakenSprites(f, k) {
  if (!sprReady('kseg') || !sprReady('kraken_head')) return false;
  const ks = k.ks, tau = k.tau, hx = Math.round(k.hx), hy = Math.round(k.hy), segW = SPR.kseg.w;
  // Sandwolke beim Auftauchen, Tinte beim Abtauchen, Schockwelle beim Angriff
  if (tau > 1.6 && tau < 3.4) drawSpr('kfx', Math.min(2, Math.floor((tau - 1.6)/0.5)), f.x, floorAt(f.x) + 4, 60*ks, false, 0.5, 1);
  if (tau > 10.4 && tau < 12.2) drawSpr('kfx', 3 + Math.min(2, Math.floor((tau - 10.4)/0.5)), hx, hy, 70*ks, false);
  // Arme: gerade Stücke entlang der Armpunkte, gedreht und von dünn nach dick gezeichnet
  for (const arm of k.arms) {
    if (arm.length < 3) continue;
    const base = {x: arm[0].x - (arm[1].x - arm[0].x), y: arm[0].y - (arm[1].y - arm[0].y)};
    const pts = [base].concat(arm), n = pts.length - 1, flipY = arm[arm.length - 1].x < hx; // Saugnäpfe nach innen
    for (let j = n - 1; j >= 1; j -= 2) {
      const a = pts[j - 1], b = pts[Math.min(n, j + 1)], ang = Math.atan2(b.y - a.y, b.x - a.x);
      const fr = Math.min(7, Math.floor((j / n) * 8)), th = pts[j].r * 3.1;
      drawSprRot('kseg', fr, pts[j].x, pts[j].y, segW * th / KSEG_TH[fr], ang, flipY);
    }
    const t1 = pts[n], t0 = pts[n - 2], ang = Math.atan2(t1.y - t0.y, t1.x - t0.x);
    drawSprRot('ktip', Math.floor(time*4 + arm[0].x) % 4, t1.x + Math.cos(ang)*2, t1.y + Math.sin(ang)*2, 14*ks, ang, flipY);
  }
  // Kopf, darüber die Augen: blinzeln, umherschauen, beim Angriff wütend
  drawSpr('kraken_head', 0, hx, hy + 4*ks, 50*ks, false, 0.5, 0.62);
  if (sprReady('keyes')) {
    const cyc = (time + f.x*0.01) % 5;
    const eyeFr = k.ext > 0.6 && k.rise > 0.9 ? (Math.floor(time*6) % 8 === 0 ? 4 : 5) : cyc < 0.12 ? 4 : cyc < 0.22 ? 3 : cyc < 1.6 ? 0 : cyc < 2.6 ? 1 : cyc < 3.6 ? 2 : 0;
    drawSpr('keyes', eyeFr, hx, hy + 4*ks + 50*ks*0.27, 50*ks*0.74, false);
  }
  if (tau > 4 && tau < 4.5) drawSpr('kfx', 7, hx, hy, (40 + (tau - 4)*160)*ks, false);
  return true;
}
function drawKraken(f) {
  const k = f._k || krakenAt(f, ft()), ks = k.ks;
  if (k.tau < 2.2) { // Warnung am Boden
    if (Math.floor(time*5) % 2 === 0) { ctx.save(); ctx.translate(Math.round(clamp(f.x, camX + 6, camX + VW - 9)), Math.round(Math.min(FLOOR - 14, camY + VH - 22))); ctx.scale(2, 2); drawWarn(1, 0); ctx.restore(); }
    return;
  }
  if (drawKrakenSprites(f, k)) return;
  const dark = '#3b0f2e', body = '#9b2c5c', light = '#d65a86', spot = '#f2b6c8';
  for (const arm of k.arms) {
    for (let j = 0; j < arm.length; j++) {
      const q = arm[j];
      ctx.fillStyle = dark; disc(Math.round(q.x), Math.round(q.y), q.r + 0.8);
    }
    for (let j = 0; j < arm.length; j++) {
      const q = arm[j];
      ctx.fillStyle = j % 3 === 0 ? light : body; disc(Math.round(q.x), Math.round(q.y), q.r);
      if (j % 2 === 0 && q.r > 2) { ctx.fillStyle = spot; ctx.fillRect(Math.round(q.x), Math.round(q.y + q.r*0.4), 1, 1); }
    }
  }
  const hx = Math.round(k.hx), hy = Math.round(k.hy), rx = 20*ks, ry = 16*ks;
  if (drawSpr('kraken_head', 0, hx, hy + 4*ks, 50*ks, false, 0.5, 0.62)) return;
  for (let y = -Math.ceil(ry*1.4); y <= Math.ceil(ry); y++) {
    const yy = y < 0 ? y / 1.4 : y, w = Math.floor(rx*Math.sqrt(Math.max(0, 1 - (yy*yy)/(ry*ry))));
    ctx.fillStyle = dark; ctx.fillRect(hx - w - 1, hy + y, w*2 + 3, 1);
    ctx.fillStyle = y < -ry*0.6 ? light : body; ctx.fillRect(hx - w, hy + y, w*2 + 1, 1);
  }
  ctx.fillStyle = spot; for (let i = 0; i < 6; i++) ctx.fillRect(hx - Math.round(rx*0.6) + i*Math.round(rx*0.24), hy - Math.round(ry*(0.9 + (i % 2)*0.25)), 2, 1);
  const eye = ex => {
    ctx.fillStyle = '#04101f'; disc(ex, hy, 4.5*ks);
    ctx.fillStyle = '#ffd25a'; disc(ex, hy, 3.6*ks);
    ctx.fillStyle = '#04101f'; ctx.fillRect(ex - 1, hy - Math.round(3*ks), 2, Math.round(6*ks));
  };
  eye(hx - Math.round(8*ks)); eye(hx + Math.round(8*ks));
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
    if (e.pal === 'geist') ctx.globalAlpha = 0.5 + Math.sin(time*3)*0.15;
    if (!((e.my || e.ll || e.rare) && drawFishSprite(e, x, y + bob, s.w, e.dir, e.ph))) {
      ctx.save(); ctx.translate(x, y + bob); if (e.dir < 0) ctx.scale(-1, 1);
      ctx.drawImage(s.c, -Math.round(s.cx), -Math.round(s.cy));
      if (e.ll) drawLandlord(s);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    if (e.rare) drawRareSparkle(x, y, s);
    if (e.gold) { ctx.fillStyle = '#fff6c0'; ctx.fillRect(x + Math.round(Math.sin(time*9)*s.a), y - Math.round(s.b) - 2, 1, 1); ctx.fillRect(x + Math.round(Math.cos(time*7)*s.a), y + Math.round(s.b) + 1, 1, 1); }
    if (e.alarm > 0 && Math.floor(time*10) % 2 === 0) drawWarn(x, y - Math.round(s.b) - 9); // Hai auf der Jagd
    else if (e.scared && Math.floor(time*6) % 2 === 0) { ctx.fillStyle = '#8ff4ff'; ctx.fillRect(x - e.dir*3, y - Math.round(s.b) - 4, 1, 2); ctx.fillRect(x - e.dir*6, y - Math.round(s.b) - 2, 1, 2); }
    else if (state === 'play' && !e.flee && !frenzy() && !e.gold && e.r >= player.r*EAT_RATIO) {
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
  } else if (e.type === 'chest') {
    ctx.fillStyle = 'rgba(255,210,90,0.18)'; disc(x, y, 9);
    ctx.fillStyle = '#3a1d0c'; ctx.fillRect(x - 6, y - 4, 12, 9);
    ctx.fillStyle = '#8a4a22'; ctx.fillRect(x - 5, y - 3, 10, 7);
    ctx.fillStyle = '#ffcf3a'; ctx.fillRect(x - 6, y - 1, 12, 1); ctx.fillRect(x - 1, y - 2, 2, 3);
    if (Math.floor(time*5) % 3 === 0) { ctx.fillStyle = '#fff6c0'; ctx.fillRect(x + 5, y - 7, 1, 3); ctx.fillRect(x + 4, y - 6, 3, 1); }
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
  if (caught && caught.scale < 0.15) return;
  if (caught && caught.by === 'ship' && sprReady('fisher')) return; // steckt in der Fischer-Animation
  if (caught && caught.by === 'kraken' && sprReady('kgrab')) { // der Arm wickelt dich ein
    const ct = caught.t; drawSpr('kgrab', ct < 0.25 ? 0 : ct < 0.55 ? 1 : ct < 0.95 ? 2 : 3, p.x, p.y, Math.max(30, p.r*5), p.x > caught.f.x); return;
  }
  drawPuffer({x: p.x, y: p.y + (p.sleep ? Math.sin(time*2) : 0), r: Math.max(2, p.r*(caught ? caught.scale : 1)), dir: p.dir, pal: mp ? mp.pal : 'puffer', sleep: p.sleep, dead: p.dead,
    sk: state === 'title' ? 'puffer' : effSkin(), ac: state === 'title' ? [] : stats.worn,
    puff: p.puff, glasses: nStage >= 6, blink: p.inv > 0 && state === 'play' && Math.floor(time*12) % 2 === 0, shield: p.shield, frz: frenzy()});
}
function drawPuffer(o) {
  const p = o, x = Math.round(o.x), y = Math.round(o.y);
  if (!o.blink) {
    const sd = skinDef(o.sk), spr = buildFish(p.r, sd.kind === 'puffer' ? o.pal : sd.pal, sd.kind, o.sleep), sc = 1 + (o.puff || 0)*0.9;
    ctx.save(); ctx.translate(x, y); ctx.scale(p.dir, p.dead ? -1 : 1);
    if (sd.pal === 'geist') ctx.globalAlpha = 0.6;
    if (sd.disco) ctx.filter = `hue-rotate(${Math.round(time*360) % 360}deg)`;
    let usedSpr = false;
    if (sd.img && faceImg) { const w = p.r*3.4*sc, h = w*N_ASPECT; ctx.drawImage(faceImg, -w*0.52, -h*0.55, w, h); } // Mini-Nurija
    else if ((sd.rare || sd.ll) && !p.dead) { // Sprite-Skins: in Weltkoordinaten zeichnen
      ctx.restore(); usedSpr = drawFishSprite(sd, x, y, spr.w*sc, p.dir, time); ctx.save(); ctx.translate(x, y); ctx.scale(p.dir, 1);
      if (!usedSpr) ctx.drawImage(spr.c, -spr.cx*sc, -spr.cy*sc, spr.w*sc, spr.h*sc);
    }
    else ctx.drawImage(spr.c, -spr.cx*sc, -spr.cy*sc, spr.w*sc, spr.h*sc);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    if (sd.ll && !usedSpr) drawLandlord({a: spr.a*sc, b: spr.b*sc});
    drawAccLocal(o.ac, spr, sc, p.r);
    if (sd.rare) { ctx.restore(); drawRareSparkle(x, y, {a: spr.a, b: spr.b}); ctx.save(); ctx.translate(x, y); ctx.scale(p.dir, 1); }
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
  if (!o.blink) drawAccWorld(o.ac, x, y, p.r);
}

function drawNurija() {
  const n = nurija; if (!n) return;
  const f = getFace(nStage);
  if (n.phase === 'warn') {
    const peek = clamp((2.4 - n.t) / 2.4, 0, 1);
    if (f) { const lx = n.dir > 0 ? -n.w + n.w*0.3*peek : W - n.w*0.3*peek; drawFace(f, lx, n.y - n.h/2, n.w, n.h, n.dir < 0); }
    if (Math.floor(time*5) % 2 === 0) {
      const wx = n.dir > 0 ? Math.max(Math.round(n.w*0.3*peek) + 6, camX + 6) : Math.min(Math.round(W - n.w*0.3*peek) - 9, camX + VW - 9);
      ctx.save(); ctx.translate(wx, clamp(Math.round(n.y) - 10, camY + 30, camY + VH - 20)); ctx.scale(2, 2); drawWarn(1, 0); ctx.restore();
    }
    return;
  }
  const wob = Math.sin(n.ph*8)*1.5, sc = 1 + Math.sin(n.ph*10)*0.03;
  if (f) drawFace(f, n.x - n.w*sc/2, n.y - n.h*sc/2 + wob, n.w*sc, n.h*sc, n.dir < 0);
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
  shX = shake > 0 ? Math.round(rnd(-shake, shake)) : 0; shY = shake > 0 ? Math.round(rnd(-shake, shake)) : 0;
  ctx.translate(shX, shY);
  hctx.clearRect(0, 0, hiCv.width, hiCv.height);
  ctx.translate(-camX, -camY);
  ctx.drawImage(bg, 0, 0);
  ctx.fillStyle = 'rgba(180,230,255,0.22)';
  for (const d of dust) ctx.fillRect(d.x | 0, d.y | 0, 1, 1);
  drawKelp();
  drawBuildings();
  for (const f of feats) if (f.type === 'loot') drawLoot(f);
  drawLootPops(1/60);
  for (const f of feats) if (f.type === 'kraken') drawKraken(f);
  ctx.fillStyle = 'rgba(200,240,255,0.35)';
  for (const s of streaks) ctx.fillRect(Math.round(s.x), Math.round(s.y), Math.round(s.len), 1);
  ents.sort((a, b) => a.r - b.r);
  for (const e of ents) drawEnt(e);
  drawSurface();
  for (const f of feats) if (f.type === 'ship') drawShip(f);
  for (const f of feats) if (f.type === 'sub') drawSub(f);
  if (mp) drawPeers();
  drawNurija();
  drawPlayer();
  for (const f of feats) if (f.type === 'bird') drawBird(f);
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
  const s = [score, lives, level, combo, g, p.shield > 0 ? 1 : 0, evTxt, mp ? mp.boardKey : '', stats.coins, runLoot].join('|');
  if (s === hudCache) return; hudCache = s;
  $('coinChip').textContent = '● ' + fmt(stats.coins);
  $('lootChip').hidden = !runLoot; $('lootChip').textContent = 'LOOTBOX ×' + runLoot;
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
  state = 'title'; level = 1; zoneIdx = 0; frzT = 0; ev = null; nurija = null; camX = camY = 0; resetDirector();
  Object.assign(player, {air: false, ship: null});
  resize(); bg = makeBG(); ents.length = 0;
  $('join').hidden = true; $('over').hidden = true; $('pause').hidden = true; $('blubbBtn').hidden = true; $('feed').innerHTML = '';
  for (let i = 0; i < 5; i++) { const e = spawnFish(); e.x = rnd(W*0.1, W*0.9); }
  $('title').hidden = false; $('hud').hidden = true; $('hiTitle').textContent = String(hi); $('menuCoins').textContent = fmt(stats.coins || 0);
  drawAlbum();
}
function newGame() {
  ensureAudio();
  state = 'play'; score = 0; level = 1; lives = 3; combo = 0; comboT = 0; nextLife = 15000; inputMode = 'point';
  ents.length = 0; parts.length = 0; pops.length = 0; streaks.length = 0;
  stats.games++; saveStats(); recBeaten = false; submittedBest = 0; fetchTop(); runSkin = null; runLoot = 0; digState.clear();
  runT = 0; ev = null; lastEv = ''; evT = rnd(16, 24); nurija = null; nurijaDone = false; killer = ''; frzT = 0; zoneIdx = 0; resetDirector();
  nurijaAt = summon ? 10 : rnd(45, 95); summon = false; // jede Runde gleiche Chance
  const p = player; Object.assign(p, {x: W*0.5, y: (SURF + FLOOR)/2, vx: 0, vy: 0, r: START_R, dir: 1, puff: 0, inv: 1.2, shield: 0, sleep: false, dead: false, air: false, ship: null});
  tgt.x = p.x; tgt.y = p.y; touchLast = null;
  bg = makeBG(); spawnT = 0.5; hudCache = '';
  $('title').hidden = true; $('over').hidden = true; $('pause').hidden = true; $('hud').hidden = false; hudCache = '';
  banner('LOS!', ZONES[0].name); sfx.start();
}
function showOver() {
  state = 'over'; ev = null;
  const newHi = score > hi;
  if (newHi) { hi = score; try { localStorage.setItem('blubberbiss-hi', String(hi)); } catch (e) {} }
  $('overTitle').textContent = {nurija: 'NURIJA HAT DICH!', ship: 'GEFISCHT!', bird: 'GESCHNAPPT!', kraken: 'VERSCHLUNGEN!'}[killer] || 'GEFRESSEN!';
  $('finalScore').textContent = score; $('finalLvl').textContent = level; $('finalHi').textContent = hi;
  $('lvlLabel').textContent = 'LEVEL'; $('hiPart').hidden = false; $('againBtn').textContent = 'NOCHMAL';
  $('finalAlbum').textContent = nStage + '/6';
  $('newHi').hidden = !newHi; $('hud').hidden = true; $('over').hidden = false;
  countBest(); overLeaderboard(); submitWealth(); openLoot();
  overReady = time + 0.7;
  try { $('againBtn').focus({preventScroll: true}); } catch (e) {}
}
function pause() {
  if (mp) { if (!mp.joined) return; mp.menu = true; $('pause').hidden = false; $('bountyBox').hidden = false; renderBountyList(); return; } // Der Ozean läuft weiter
  $('bountyBox').hidden = true;
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
// Testraum: nur mit ?debug&room=name, damit Tests nie im echten Ozean landen
const ROOM_PREFIX = (() => { const q = new URLSearchParams(location.search), r = (q.get('room') || '').replace(/[^a-z0-9]/gi, '').slice(0, 20); return q.has('debug') && r ? 'blubberbiss-test-' + r + '-' : 'blubberbiss-ozean-'; })();
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
      $('onlineHint').textContent = n === 0 ? 'gerade leer' : n === 1 ? '1 online' : n + ' online';
    });
    lobby.subscribe(st => { if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') $('onlineHint').textContent = 'offline'; });
  } catch (e) { $('onlineHint').textContent = 'offline'; }
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
  state = 'mpwait'; player.dead = true; ents.length = 0; resetDirector(); parts.length = 0; pops.length = 0; ev = null; nurija = null; frzT = 0; zoneIdx = 0; bg = null;
  resize();
  mpConnect(1);
}

function mpConnect(room) {
  if (!mp) return;
  const ch = mp.client.channel(ROOM_PREFIX + room, {config: {broadcast: {self: false}, presence: {key: myId}}});
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
  mpSpawnPlayer(); stats.mpGames++; saveStats(); recBeaten = false; submittedBest = 0; mp.peak = 0;
  mpSend('hello', {});
  banner('OZEAN' + (mp.room > 1 ? ' ' + mp.room : ''), mp.count > 1 ? mp.count + ' FISCHE IM WASSER' : 'NOCH ALLEIN · LADE LEUTE EIN');
  sfx.start();
}

function mpLeave() {
  if (!mp) return;
  const m = mp;
  if (m.peak > 0) submitScore(m.peak, 'multi', m.name);
  runSkin = null; runLoot = 0;
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
  const o = {}; for (const k of ['id', 'type', 'kind', 'pal', 'r', 'gold', 'x0', 'y0', 'vx', 'vy', 't0', 'bobA', 'bobF', 'ph0', 'sp', 'rare', 'll', 'my']) if (e[k] !== undefined) o[k] = e[k];
  return o;
}
function addNetEnt(d) {
  if (!d || !d.id || ents.some(e => e.id === d.id)) return;
  const e = Object.assign({}, d, {net: true, x: d.x0, y: d.y0, ph: 0}); if (e.my) e.rare = 1;
  if (e.type === 'fish') { e.spr = buildFish(e.r, e.pal, e.kind, false); e.margin = e.spr.w + 4; e.dir = e.vx > 0 ? 1 : -1; }
  else if (e.type === 'jelly') e.spr = buildJelly(e.r);
  else e.margin = 14;
  moveNetEnt(e);
  if (!e.dead) ents.push(e);
}
function moveNetEnt(e) {
  const tau = nowS() - e.t0; e.ph = Math.max(0, tau) + (e.ph0 || 0);
  if (e.type === 'jelly') { jellyAt(e); return; }
  if (e.type === 'chest') { chestAt(e); return; }
  e.x = e.x0 + e.vx*tau;
  e.y = clamp(e.y0 + (e.vy || 0)*tau + (e.bobA ? (e.bobA / e.bobF) * Math.sin(e.bobF*tau + (e.ph0 || 0)) : 0), WTOP() - 2, FLOOR - 4);
  e.dir = e.vx > 0 ? 1 : -1;
  e.alarm = Math.max(0, (e.alarm || 0) - 1/60);
  if (e.kind === 'shark' && tau > 80) e.dead = true; // kein ewiges Kreisen
  if ((e.vx > 0 && e.x > W + e.margin) || (e.vx < 0 && e.x < -e.margin)) e.dead = true;
}
function mkNetFish(o) {
  const fromLeft = o.fromLeft ?? Math.random() < 0.5, r = Math.round(clamp(o.r, 2.5, 36)*2)/2, w = Math.ceil(r*3.9) + 4, off = o.off || 0;
  return {id: nid(), type: 'fish', kind: o.kind, pal: o.pal, r, gold: o.gold ? 1 : 0, ...(o.rare ? {rare: 1} : {}), ...(o.ll ? {ll: 1, sp: o.sp} : {}),
    x0: fromLeft ? -w - off : W + w + off, y0: Math.round(o.y), vx: Math.round(fromLeft ? o.sp : -o.sp), t0: nowS(),
    bobA: o.bobA ?? Math.round(rnd(0, 10)), bobF: o.bobF ?? +rnd(1, 3).toFixed(2), ph0: +rnd(0, 6).toFixed(2)};
}
function hostSpawn(alive) {
  const live = ents.reduce((n, e) => n + (e.dead ? 0 : 1), 0), maxE = Math.min(60, 22 + alive.length*6);
  if (live >= maxE) return;
  const q = Math.random(), t = nowS(), out = [];
  const item = type => { const fl = Math.random() < 0.5; return {id: nid(), type, r: type === 'pearl' ? 3 : 6, x0: fl ? -10 : W + 10, y0: Math.round(rnd(WTOP() + 16, FLOOR - 24)), vx: Math.round((fl ? 1 : -1) * rnd(14, 22)), t0: t, bobA: 4, bobF: 2, ph0: +rnd(0, 6).toFixed(2)}; };
  if (q < 0.09) out.push({id: nid(), type: 'jelly', r: Math.round(rnd(5, 12)), x0: Math.round(rnd(20, W - 20)), y0: H + 30, vy: -Math.round(rnd(12, 20)), t0: t, ph0: 0});
  else if (q < 0.14) out.push(item('pearl'));
  else if (q < 0.165) out.push(item('shield'));
  else if (q < 0.4) {
    const r = rnd(2.5, 4.5), pal = pick(FISH_PALS), fromLeft = Math.random() < 0.5, sp = rnd(26, 40), y = rnd(WTOP() + 14, FLOOR - 20);
    const n = 3 + Math.floor(Math.random()*3);
    for (let i = 0; i < n; i++) out.push(mkNetFish({r, pal, kind: 'fish', fromLeft, sp, y: clamp(y + rnd(-9, 9), WTOP() + 4, FLOOR - 8), off: i*r*3.2}));
  } else {
    let r = npcR(), kind = 'fish', pal = pick(FISH_PALS);
    if (r > 14 && Math.random() < 0.55) { kind = 'shark'; pal = 'shark'; }
    else if (Math.random() < 0.22) kind = 'stripe';
    let sp = rnd(22, 44); if (kind === 'shark') sp *= 1.35; if (r < 5) sp *= 1.2;
    out.push(mkNetFish({r, pal, kind, sp, y: rnd(WTOP() + r, FLOOR - r*0.8)}));
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
      hostEmit({k: 'sp', e: [mkNetFish({r: 5, pal: 'gold', kind: 'fish', sp: 72, gold: 1, bobA: 45, bobF: 4, y: rnd(WTOP() + 24, FLOOR - 30)})]});
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
        ft: feats.map(f => { const o = Object.assign({}, f); delete o._k; delete o.carry; delete o.splashed; return o; }), ev: ev ? {type: ev.type, t0: ev.t0, max: ev.max, dir: ev.dir} : null, nur: nurija ? {t0: nurija.t0, dir: nurija.dir, y0: nurija.y0} : null});
      break;
    case 'sync':
      if (m.to !== myId) break;
      setClock(+m.t, true);
      for (const d of m.e || []) addNetEnt(d);
      for (const d of m.ft || []) if (d && typeof d.type === 'string' && !feats.some(f => f.id === d.id)) feats.push(d); // still, ohne Banner
      if (m.ev && !ev) applyEv(m.ev, false);
      if (m.nur && !nurija) applyNur(m.nur, false);
      break;
    case 'sp': for (const d of m.e || []) addNetEnt(d);
      if (m.ann === 'subdrop' && m.e && m.e[0]) announce('subdrop', '', +m.e[0].x0, +m.e[0].y0); else if (m.ann) announce(m.ann, cleanName(m.nm)); break;
    case 'tr': if (!mp.host) applyTr(m); break;
    case 'ft': if (m.d && typeof m.d.type === 'string') addFeat(m.d); break;
    case 'eat': {
      const e = ents.find(x => x.id === m.id); if (e && !e.dead) { e.dead = true; burst(e.x, e.y, e.pal ? PALS[e.pal].body : '#fff4d0', 5); }
      if (m.c && m.f !== myId) feedPush(`<b>${esc(peerName(m.f))}</b> schnappt sich den Schatz`);
      if (m.g) { const who = m.f === myId ? 'DU HAST' : peerName(m.f).toUpperCase() + ' HAT'; if (m.f !== myId) banner(who + ' IHN!', 'GOLDFISCH WEG'); feedPush(`<b>${esc(peerName(m.f))}</b> schnappt den Goldfisch`); }
      break;
    }
    case 'ev': applyEv(m, true); break;
    case 'nur': applyNur(m, true); break;
    case 'eaten': onEaten(m); break;
    case 'blubb': { const o = mp.peers.get(m.f); if (o) { o.emote = 1.8; for (let i = 0; i < 6; i++) bubbles.push({x: o.x + rnd(-o.r, o.r), y: o.y - rnd(0, o.r), s: 1 + (i % 2), vy: rnd(20, 34), ph: rnd(0, 6)}); } break; }
    case 'bye': mp.peers.delete(m.f); break;
    case 'fx': { const i = feats.findIndex(f => f.id === m.id); if (i >= 0) { feats.splice(i, 1); feedPush(`<b>${esc(peerName(m.f))}</b> gräbt eine Lootbox aus`); } break; }
    case 'ann': if (m.a === 'loot' || m.a === 'sub') announce(m.a); break;
    case 'sink': { const sh = feats.find(f => f.id === m.id); if (sh) sinkShip(sh, Object.assign(new Number(+m.t || nowS()), {f: m.f})); break; }
    case 'bounty': { mp.bounty = mp.bounty || {}; const a = clamp(Math.floor(+m.a || 0), 0, 1e6); mp.bounty[m.on] = (mp.bounty[m.on] || 0) + a;
      if (m.on === myId) banner('KOPFGELD AUF DICH!', '● ' + fmt(mp.bounty[m.on]) + ' · VON ' + peerName(m.f).toUpperCase());
      else feedPush(`<b>${esc(peerName(m.f))}</b> setzt ● ${fmt(a)} auf <b>${esc(peerName(m.on))}</b>`);
      if (!$('pause').hidden) renderBountyList(); break; }
    case 'rent': if (m.to === myId) { const a = clamp(Math.floor(+m.a || 0), 0, 50); if (a) { addCoins(a); popup(player.x, player.y - player.r - 10, 'MIETE VON ' + peerName(m.f).toUpperCase() + ' +' + a, '#ffd25a', 7); } } break;
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
  const {h, w} = nurijaSize(), dir = m.dir > 0 ? 1 : -1;
  nurija = {isNurija: true, phase: 'warn', t: 2.4, t0: +m.t0, dir, y0: +m.y0, w, h, x: dir > 0 ? -w*0.2 : W + w*0.2, y: +m.y0, ph: 0, siren: -1, survive: state === 'play'};
  if (announce) banner('NURIJA KOMMT!', 'FÜR ALLE · VON ' + (dir > 0 ? 'LINKS' : 'RECHTS'));
}
function updateNurijaMP() {
  const n = nurija; if (!n) return;
  const tau = nowS() - n.t0; n.ph = Math.max(0, tau);
  n.y = nurijaY(n.y0, Math.max(0, tau), n.h);
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
  o.sk = skinDef(String(m.sk || '')).k; o.ac = String(m.ac || '').split(',').filter(id => ACC[id]).slice(0, 9);
  o.prop = PROPS[m.pr] ? m.pr : ''; o.parcel = clamp(Math.floor(+m.pc || 0), 0, 6);
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
    const x = rnd(30, W - 30), y = rnd(SURF + 30, FLOOR - 30); let d = 1e9;
    for (const o of mp.peers.values()) if (!o.dead && o.r > START_R) d = Math.min(d, Math.hypot(o.x - x, o.y - y));
    for (const e of ents) if (e.type === 'fish' && e.r > START_R) d = Math.min(d, Math.hypot(e.x - x, e.y - y)*1.5);
    if (d > bd) { bd = d; best = {x, y}; }
  }
  Object.assign(p, {x: best.x, y: best.y, vx: 0, vy: 0, r: START_R, dir: 1, puff: 0, inv: 2.5, shield: 0, sleep: false, dead: false, air: false, ship: null});
  caught = null;
  tgt.x = p.x; tgt.y = p.y; touchLast = null; combo = 0; comboT = 0; frzT = 0; state = 'play';
  updateCam();
}
function mpHurt(src) {
  const p = player;
  if (src.isNurija || src.isPeer) { mpDie(src); return; }
  if (src.type === 'fish') { mpDie({isFeat: true, label: src.kind === 'shark' ? 'Hai' : 'Fisch'}); return; } // grösserer Fisch = gefressen
  p.r = Math.max(START_R, p.r*0.75); p.inv = 1.6; shake = 4; flash = 1; flashCol = '255,60,90'; combo = 0; comboT = 0;
  sfx.hurt(); burst(p.x, p.y, '#f2c14e', 10, 50); popup(p.x, p.y - p.r - 6, 'AUTSCH', '#ff7ab0');
}
// Multiplayer-Todesbildschirm: kein automatisches Wiedereinsteigen
function showMpOver() {
  const d = mp.lastDeath || {lost: 0, title: 'GEFRESSEN!'};
  $('overTitle').textContent = d.title;
  $('finalScore').textContent = d.lost; $('finalHi').textContent = stats.bestMulti || 0;
  $('lvlLabel').textContent = 'DEIN BESTER OZEAN-WERT'; $('finalLvl').textContent = stats.bestMulti || 0; $('hiPart').hidden = true;
  $('finalAlbum').textContent = nStage + '/6'; $('newHi').hidden = true; $('overRank').hidden = true; $('overEntry').hidden = true;
  $('againBtn').textContent = 'WIEDER INS WASSER';
  $('hud').hidden = true; $('blubbBtn').hidden = true; $('pause').hidden = true; mp.menu = false;
  $('over').hidden = false; overReady = time + 0.5;
  openLoot();
  try { $('againBtn').focus({preventScroll: true}); } catch (e) {}
}
function mpRespawn() {
  if (!mp || state !== 'mpdead') return;
  $('over').hidden = true; $('loot').hidden = true; $('hud').hidden = false; $('blubbBtn').hidden = false; hudCache = '';
  mpSpawnPlayer(); banner('ZURÜCK IM WASSER', 'VIEL GLÜCK');
}
function mpDie(src) {
  const p = player;
  if (mp.peak > 0) submitScore(mp.peak, 'multi', mp.name);
  const label = src.isNurija ? 'Nurija' : src.isFeat ? src.label : '';
  mpSend('eaten', {by: src.isPeer ? src.id : null, nur: src.isNurija ? 1 : 0, w: label, r: Math.round(p.r*10)/10, king: mp.kingId === myId ? 1 : 0, n: mp.name});
  feedPush(`<b>${esc(label || src.name)}</b> ${src.label === 'Fischer' ? 'isst' : 'frisst'} <b>dich</b>`);
  caught = null;
  state = 'mpdead'; mp.deadT = 1.4; p.dead = true; if (nurija) nurija.survive = false;
  runSkin = null; if (mp.bounty) mp.bounty[myId] = 0;
  mp.lastDeath = {lost: score, title: src.isNurija ? 'NURIJA HAT DICH!' : src.label === 'Fischer' ? 'GEFISCHT!' : src.label === 'Möwe' ? 'GESCHNAPPT!' : src.label === 'Krake' ? 'VERSCHLUNGEN!' : 'GEFRESSEN!'};
  const lost = score; score = 0; mp.peak = 0; combo = 0; comboT = 0; frzT = 0; // Tod = Punkte weg, Neustart bei 0
  shake = 5; flash = 1; flashCol = '255,60,90'; sfx.over(); burst(p.x, p.y, '#f2c14e', 16, 60);
  const by = src.isFeat ? ({Fischer: 'VOM FISCHER', 'Möwe': 'VON DER MÖWE', Krake: 'VOM KRAKEN', Hai: 'VOM HAI', Fisch: 'VON EINEM GRÖSSEREN FISCH'}[src.label] || '')
    : src.isPeer ? 'VON ' + src.name.toUpperCase() : src.isNurija ? 'VON NURIJA' : '';
  banner(src.isNurija ? 'NURIJA HAT DICH!' : src.label === 'Fischer' || src.label === 'Möwe' || src.label === 'Krake' ? 'ERWISCHT!' : 'GEFRESSEN!',
    (by ? by + ' · ' : '') + (lost > 0 ? fmt(lost) + ' PUNKTE WEG' : 'NEUSTART'));
  if (src.isPeer || src.label === 'Hai' || src.label === 'Fisch') BIGGER();
  submitWealth();
}
function onEaten(m) {
  const victim = cleanName(m.n) || '???', o = mp.peers.get(m.f);
  const bounty = bountyOn(m.f); if (mp.bounty) mp.bounty[m.f] = 0;
  if (bounty && m.by === myId) { addCoins(bounty); setTimeout(() => banner('KOPFGELD KASSIERT!', '● ' + fmt(bounty)), 1200); }
  if (o) { o.dead = true; burst(o.x, o.y, PALS[o.pal].body, 14, 55); }
  if (m.nur || m.w) { const w = m.nur ? 'Nurija' : cleanName(m.w); feedPush(`<b>${esc(w)}</b> ${w === 'Fischer' ? 'isst' : 'frisst'} <b>${esc(victim)}</b>`); return; }
  if (m.by === myId && state === 'play') {
    const p = player, r = clamp(+m.r || START_R, 2, CAP_R);
    const pts = Math.round((300 + r*r*8) / 5) * 5 + (m.king ? 2000 : 0);
    score += pts; p.r = Math.min(CAP_R, Math.sqrt(p.r*p.r + r*r*0.35)); p.puff = 0.3; countEat('player'); addCoins(m.king ? 250 : 25);
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
  if (mp.host && mp.joined) { const alive = [player].concat([...mp.peers.values()].filter(o => !o.dead)); hostTick(dt); directorTick(dt, alive); sharkHost(dt, alive.filter(o => o !== player || state === 'play')); }
  for (const e of ents) if (!e.dead) moveNetEnt(e);
  if (ev) { ev.t = ev.max - (t - ev.t0); if (ev.t <= 0 || (ev.type === 'gold' && !ents.some(e => e.gold && !e.dead) && t - ev.t0 > 1)) ev = null; }
  updatePeers(dt);
  if (state === 'play') {
    movePlayer(dt);
    if (p.r > 18) p.r = Math.max(18, p.r - (p.r - 18)*0.012*dt); // Riesen schrumpfen langsam, wenn sie nicht fressen
    collide(); peerCollide();
    comboT -= dt; if (comboT <= 0) combo = 0;
    if (p.shield > 0) p.shield = Math.max(0, p.shield - dt);
  } else if (state === 'caught') updateCaught(dt);
  else if (state === 'mpdead') { p.y -= 14*dt; if (mp.deadT > 0) { mp.deadT -= dt; if (mp.deadT <= 0) showMpOver(); } }
  updateFeats(dt); updateLoot(dt); propIncome(dt); visitorRent(dt);
  updateNurija(dt);
  p.inv = Math.max(0, p.inv - dt); p.puff = Math.max(0, p.puff - dt); frzT = Math.max(0, frzT - dt);
  mp.blubbCd = Math.max(0, mp.blubbCd - dt); mp.emote = Math.max(0, mp.emote - dt);
  for (let i = ents.length - 1; i >= 0; i--) if (ents[i].dead) ents.splice(i, 1);
  // Eigenen Zustand senden: 5x pro Sekunde, wenn sich nichts tut nur 1x
  mp.sendT -= dt; mp.idleT -= dt;
  if (mp.joined && mp.ch && !document.hidden && mp.sendT <= 0) {
    mp.sendT = SEND_EVERY;
    const msg = {x: Math.round(p.x*10)/10, y: Math.round(p.y*10)/10, vx: Math.round(p.vx), vy: Math.round(p.vy), r: Math.round(p.r*10)/10, d: p.dir,
      sc: score, sh: p.shield > 0 ? 1 : 0, fz: frenzy() ? 1 : 0, i: p.inv > 0 ? 1 : 0, dd: state === 'mpdead' ? 1 : 0, n: mp.name, p: mp.pal, g: nStage >= 6 ? 1 : 0,
      sk: effSkin(), ac: stats.worn.join(','), pr: bestProp(stats.owned), pc: myParcel()};
    const key = JSON.stringify(msg);
    if (key !== mp.lastSent || mp.idleT <= 0) { mp.lastSent = key; mp.idleT = 1; mpSend('s', msg); }
  }
  mp.boardT -= dt; if (mp.boardT <= 0) { mp.boardT = 0.4; mpBoard(); }
  if (score > (mp.peak || 0)) mp.peak = score;
  if (state !== 'mpwait') { countBest(); checkRecord(); }
  updateCam(); updateHUD();
}

/* --- Zeichnen (Multiplayer) --- */
function drawPeers() {
  for (const o of mp.peers.values()) {
    if (o.dead) continue;
    drawPuffer({x: o.x, y: o.y, r: o.r, dir: o.dir, pal: o.pal, sk: o.sk, ac: o.ac, glasses: o.glasses, shield: o.shield, frz: o.frz, blink: o.inv && Math.floor(time*12) % 2 === 0});
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
    const bt = bountyOn(id);
    const html = (emote > 0 ? '<span class="em">BLUBB!</span>' : '') + (bt ? `<span class="bt">KOPFGELD ● ${fmt(bt)}</span>` : '') + (king ? '<span class="crown">♛</span>' : '') + `<span class="nm">${esc(name)}</span>`;
    if (el._h !== html) { el._h = html; el.innerHTML = html; }
    el.classList.toggle('me', me);
    el.style.transform = `translate(${Math.round((x - camX)*PS)}px,${Math.round((y - r*0.95 - 2 - camY)*PS)}px) translate(-50%,-100%)`;
  };
  for (const sg of signs) { put(sg.id, sg.x, sg.y, 0, sg.name, sg.me, false, 0); tagEls.get(sg.id).classList.add('sign'); }
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

/* ---------- Persönliche Statistik (nur in diesem Browser) ---------- */
const SPECIES = [
  {k: 'fish-blue', n: 'Blauflosser', pal: 'blue', kind: 'fish'},
  {k: 'fish-orange', n: 'Clownling', pal: 'orange', kind: 'fish'},
  {k: 'fish-green', n: 'Grünling', pal: 'green', kind: 'fish'},
  {k: 'fish-pink', n: 'Rosabarbe', pal: 'pink', kind: 'fish'},
  {k: 'fish-purple', n: 'Lilafisch', pal: 'purple', kind: 'fish'},
  {k: 'fish-red', n: 'Rotbarsch', pal: 'red', kind: 'fish'},
  {k: 'fish-teal', n: 'Türkisling', pal: 'teal', kind: 'fish'},
  {k: 'sardine', n: 'Sardine', pal: 'sardine', kind: 'fish'},
  {k: 'stripe', n: 'Streifenfisch', pal: 'orange', kind: 'stripe'},
  {k: 'shark', n: 'Hai', pal: 'shark', kind: 'shark'},
  {k: 'landlord', n: 'Immobilienhai', pal: 'shark', kind: 'shark', ll: true},
  {k: 'jelly', n: 'Qualle', jelly: true},
  {k: 'gold', n: 'Goldfisch', pal: 'gold', kind: 'fish'},
  {k: 'rare-rainbow', n: 'Regenbogenfisch', pal: 'rainbow', kind: 'stripe', rare: true},
  {k: 'rare-kristall', n: 'Kristallfisch', pal: 'kristall', kind: 'fish', rare: true},
  {k: 'rare-lava', n: 'Lavafisch', pal: 'lava', kind: 'fish', rare: true},
  {k: 'rare-geist', n: 'Geisterfisch', pal: 'geist', kind: 'fish', rare: true},
  {k: 'rare-nacht', n: 'Mitternachtsfisch', pal: 'nacht', kind: 'stripe', rare: true},
  {k: 'player', n: 'Mitspieler', pal: 'pcoral', kind: 'puffer'},
];
let stats = {eaten: {}, games: 0, mpGames: 0, bestSolo: 0, bestMulti: 0, caughtBy: {}, gold: 0};
try { const s = JSON.parse(localStorage.getItem('blubberbiss-stats') || 'null'); if (s && typeof s === 'object') stats = Object.assign(stats, s, {eaten: Object.assign({}, s.eaten), caughtBy: Object.assign({}, s.caughtBy)}); } catch (e) {}
let statsSaveT = 0;
function saveStats() { clearTimeout(statsSaveT); statsSaveT = setTimeout(() => { try { localStorage.setItem('blubberbiss-stats', JSON.stringify(stats)); } catch (e) {} }, 400); }
const statKey = e => e.type === 'jelly' ? 'jelly' : e.my ? 'mystery' : e.gold ? 'gold' : e.ll ? 'landlord' : e.rare ? 'rare-' + e.pal : e.pal === 'sardine' ? 'sardine' : e.kind === 'shark' ? 'shark' : e.kind === 'stripe' ? 'stripe' : 'fish-' + e.pal;
function countEat(k) { stats.eaten[k] = (stats.eaten[k] || 0) + 1; saveStats(); }
function countCaught(label) { stats.caughtBy[label] = (stats.caughtBy[label] || 0) + 1; saveStats(); }
function countBest() {
  const key = mp ? 'bestMulti' : 'bestSolo';
  if (score > (stats[key] || 0)) { stats[key] = score; saveStats(); }
}

function spriteIcon(sd, c, unlocked) { // seltene Fische & Immobilienhai als Bild-Icon
  const g = c.getContext('2d'), saved = ctx; ctx = g;
  let ok = false;
  try { ok = drawFishSprite(sd, c.width/2, c.height/2, c.width*0.78, 1, 0); } finally { ctx = saved; }
  if (ok && !unlocked) { g.globalCompositeOperation = 'source-in'; g.fillStyle = '#234a73'; g.fillRect(0, 0, c.width, c.height); g.globalCompositeOperation = 'source-over'; }
  return ok;
}
function speciesIcon(sp) {
  const c = document.createElement('canvas'); c.width = 44; c.height = 30;
  if ((sp.rare || sp.ll) && spriteIcon(sp, c, stats.eaten[sp.k] > 0)) return c;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  const spr = sp.jelly ? buildJelly(9) : buildFish(9, sp.pal, sp.kind, false);
  const k = Math.min(40 / spr.w, 26 / spr.h);
  g.drawImage(spr.c, Math.round((44 - spr.w*k)/2), Math.round((30 - spr.h*k)/2), Math.round(spr.w*k), Math.round(spr.h*k));
  if (!(stats.eaten[sp.k] > 0)) { g.globalCompositeOperation = 'source-in'; g.fillStyle = '#234a73'; g.fillRect(0, 0, 44, 30); }
  return c;
}
function renderStats() {
  const grid = $('catchGrid'); grid.innerHTML = '';
  let total = 0, kinds = 0;
  for (const sp of SPECIES) {
    const n = stats.eaten[sp.k] || 0; total += n; if (n) kinds++;
    const card = document.createElement('div'); card.className = 'ccard' + (n ? '' : ' none');
    card.appendChild(speciesIcon(sp));
    const t = document.createElement('div');
    t.innerHTML = `<div class="cn">${n ? esc(sp.n) : '???'}</div><div class="cc">${n}</div>`;
    card.appendChild(t); grid.appendChild(card);
  }
  const cb = Object.entries(stats.caughtBy).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${esc(k)} <b>${v}</b>`).join(' · ');
  $('statTotals').innerHTML = `GEFRESSEN TOTAL <b>${total}</b> · ARTEN <b>${kinds}/${SPECIES.length}</b><br>`
    + `SOLO-SPIELE <b>${stats.games}</b> · BESTER SOLO <b>${stats.bestSolo}</b><br>`
    + `OZEAN-BESUCHE <b>${stats.mpGames}</b> · BESTER MULTI <b>${stats.bestMulti}</b><br>`
    + `MÜNZEN <b>● ${fmt(stats.coins || 0)}</b> · TOTAL VERDIENT <b>● ${fmt(stats.coinsEarned || 0)}</b>`
    + (cb ? `<br>ERWISCHT VON: ${cb}` : '');
  renderTop();
}
let statsFrom = 'title';
function showStats(from) {
  statsFrom = from; renderStats(); fetchTop();
  $('title').hidden = true; $('over').hidden = true; $('stats').hidden = false;
}
function hideStats() { $('stats').hidden = true; if (statsFrom === 'over') $('over').hidden = false; else $('title').hidden = false; }
$('statsBtn').addEventListener('click', e => { e.stopPropagation(); showStats('title'); });
$('overStatsBtn').addEventListener('click', () => showStats('over'));
$('statsBack').addEventListener('click', hideStats);

/* ---------- Allzeit-Bestenliste (Supabase, ohne Login) ---------- */
let topList = null, topT = 0, recBeaten = false, submittedBest = 0;
let scoreToken = '';
try { scoreToken = localStorage.getItem('blubberbiss-token') || ''; } catch (e) {}
if (scoreToken.length < 16) { scoreToken = myId + myId + String(Math.random()).slice(2, 10); try { localStorage.setItem('blubberbiss-token', scoreToken); } catch (e) {} }
async function fetchTop() {
  const c = sb(); if (!c) return;
  try {
    const {data, error} = await c.rpc('blubberbiss_top', {p_limit: 10});
    if (error) throw error;
    topList = Array.isArray(data) ? data : [];
  } catch (e) { topList = topList || null; }
  renderRec(); if (!$('stats').hidden) renderTop();
}
const record = () => topList && topList[0] ? topList[0] : null;
function renderRec() {
  const r = record();
  const txt = r ? `ALLZEIT-REKORD ${fmt(r.score)} · ${r.name}` : '';
  $('recTitle').hidden = !r; $('recTitle').textContent = txt;
  updateRecHud(true);
}
let recHudKey = '';
function updateRecHud(force) {
  const r = record(), el = $('recHud');
  if (!r) { el.hidden = true; return; }
  const mine = score > r.score;
  const key = mine ? 'me' + score : r.score + r.name;
  if (!force && key === recHudKey) return; recHudKey = key;
  el.hidden = false;
  el.textContent = mine ? 'ALLZEIT-REKORD: DU!' : `REKORD ${r.score} · ${r.name}`;
}
function renderTop() {
  const el = $('topList');
  if (!topList) { el.innerHTML = '<li><span></span><span>Bestenliste nicht erreichbar</span><span></span></li>'; return; }
  if (!topList.length) { el.innerHTML = '<li><span></span><span>Noch leer. Sei die Nummer 1!</span><span></span></li>'; return; }
  const me = cleanName(mpName);
  el.innerHTML = topList.map(r => `<li class="${me && r.name === me ? 'me' : ''}"><span>${esc(r.name)}<span class="md">${r.mode === 'multi' ? 'OZEAN' : 'SOLO'}</span></span><span>${r.score}</span></li>`).join('');
}
// Prüft während des Spiels, ob du gerade den Allzeit-Rekord knackst
function checkRecord() {
  const r = record();
  if (r && !recBeaten && score > r.score && score > 0) { recBeaten = true; banner('ALLZEIT-REKORD!', 'DU BIST DIE NUMMER 1'); sfx.level(); flash = 1; flashCol = '255,210,90'; }
  updateRecHud(false);
}
const qualifies = s => s > 0 && (!topList || topList.length < 10 || s > topList[topList.length - 1].score);
async function submitScore(s, mode, name) {
  const c = sb(); if (!c || !(s > 0) || s <= submittedBest) return null;
  submittedBest = s;
  try {
    const {data, error} = await c.rpc('blubberbiss_submit', {p_name: cleanName(name) || 'Anonym', p_score: Math.round(s), p_mode: mode, p_token: scoreToken});
    if (error) throw error;
    fetchTop();
    return data;
  } catch (e) { return null; }
}
// Solo: nach dem Spiel eintragen (mit gespeichertem Namen sofort, sonst Namensfeld)
function overLeaderboard() {
  $('overRank').hidden = true; $('overEntry').hidden = true;
  if (!(score > 0) || !qualifies(score)) return;
  if (mpName) soloSubmit(mpName);
  else { $('overEntry').hidden = false; $('overName').value = randName(); }
}
async function soloSubmit(name) {
  mpName = cleanName(name) || randName(); try { localStorage.setItem('blubberbiss-name', mpName); } catch (e) {}
  $('overEntry').hidden = true;
  const rank = await submitScore(score, 'solo', mpName);
  if (rank) { $('overRank').hidden = false; $('overRank').innerHTML = `PLATZ <b>${rank}</b> DER BESTENLISTE`; }
}
$('overSubmit').addEventListener('click', () => soloSubmit($('overName').value));
setInterval(() => { if (!document.hidden) fetchTop(); }, 60000);
fetchTop();

/* ---------- Haie: jagen ab und zu, fliehen vor Grösseren ---------- */
function sharkDesire(e, hunters, dt) {
  // 1. Grössere Spieler in der Nähe: abhauen
  let flee = null, fd = 1e9;
  for (const o of hunters) {
    if (o.dead) continue;
    const scared = o.r >= e.r*1.05 || (o.frz && o.r >= e.r*0.7);
    const d = Math.hypot(o.x - e.x, o.y - e.y);
    if (scared && d < 75 + e.r && d < fd) { flee = o; fd = d; }
  }
  const sp = e.sp || Math.abs(e.vx) || 30;
  if (flee) { e.hunt = null; const dx = e.x - flee.x, dy = e.y - flee.y, m = Math.hypot(dx, dy) || 1; e.scared = 1; return {vx: dx/m*sp*1.8, vy: dy/m*sp*1.2}; }
  e.scared = 0;
  // 2. Laufende Jagd
  const h = e.hunt;
  if (h) {
    h.t -= dt;
    const tg = h.ref, gone = !tg || tg.dead || (tg.type === undefined && (tg.air || tg.ship || tg.y < SURF + 4)) || tg.r >= e.r*EAT_RATIO;
    if (h.t <= 0 || gone) e.hunt = null;
    else { const dx = tg.x - e.x, dy = tg.y - e.y, m = Math.hypot(dx, dy) || 1; return {vx: dx/m*sp*1.45, vy: dy/m*sp*1.45, tg}; }
  }
  // 3. Ab und zu ein neues Opfer suchen
  e.huntCd = (e.huntCd ?? rnd(1, 3)) - dt;
  if (e.huntCd <= 0) {
    e.huntCd = e.ll ? 0.8 : rnd(2.5, 4.5);
    if (e.ll || Math.random() < 0.45) {
      let best = null, bd = 1e9;
      for (const o of hunters) { if (o.dead || (o === player && state !== 'play') || (e.ll && o === player && stats.coins <= 0 && Math.random() < 0.5) || o.air || o.ship || o.inv > 0 || o.y < SURF + 4 || o.r >= e.r*EAT_RATIO) continue; const d = Math.hypot(o.x - e.x, o.y - e.y); if (d < 130 && d < bd) { best = o; bd = d; } }
      if (!e.ll) for (const f of ents) { if (f === e || f.dead || f.type !== 'fish' || f.kind === 'shark' || f.gold || f.r >= e.r*0.7) continue; const d = Math.hypot(f.x - e.x, f.y - e.y); if (d < 100 && d < bd*1.2) { best = f; bd = d; } }
      if (best) { e.hunt = {ref: best, t: rnd(3, 5)}; e.alarm = 1.2; }
    }
  }
  return {vx: (Math.sign(e.vx) || 1)*sp, vy: 0};
}
// Hai frisst einen Fisch, den er erwischt
function sharkBite(e, tg) {
  if (!tg || tg.type !== 'fish' || tg.dead) return false;
  if (Math.hypot(tg.x - e.x, tg.y - e.y) > e.spr.a*0.7 + tg.r*0.5) return false;
  tg.dead = true; e.hunt = null;
  burst(tg.x, tg.y, PALS[tg.pal].body, 6); popup(tg.x, tg.y - 6, 'HAPP', '#ffffff');
  return true;
}
function sharkLocal(e, dt) { // Solo
  const want = sharkDesire(e, [player], dt), k = Math.min(1, dt*2.2);
  e.vx += (want.vx - e.vx)*k; e.vy = (e.vy || 0) + (want.vy - (e.vy || 0))*k;
  if (Math.abs(e.vx) > 3) e.dir = e.vx > 0 ? 1 : -1;
  e.y += e.vy*dt;
  if (want.tg) sharkBite(e, want.tg);
  e.alarm = Math.max(0, (e.alarm || 0) - dt);
}
// Multiplayer: nur der Host entscheidet und schickt neue Kurse
function sharkHost(dt, hunters) {
  const t = nowS();
  for (const e of ents) {
    if (e.dead || e.kind !== 'shark' || !e.net) continue;
    e.thinkT = (e.thinkT || 0) - dt;
    if (e.thinkT > 0) continue;
    e.thinkT = 0.4;
    if (!e.sp) e.sp = Math.abs(e.vx);
    const want = sharkDesire(e, hunters, 0.4);
    if (want.tg && sharkBite(e, want.tg)) mpSend('eat', {id: want.tg.id});
    const nvx = e.vx + (want.vx - e.vx)*0.6, nvy = (e.vy || 0) + (want.vy - (e.vy || 0))*0.6;
    const a0 = Math.atan2(e.vy || 0, e.vx), a1 = Math.atan2(nvy, nvx), sp0 = Math.hypot(e.vx, e.vy || 0), sp1 = Math.hypot(nvx, nvy);
    let da = Math.abs(a1 - a0); if (da > Math.PI) da = 2*Math.PI - da;
    if (da > 0.25 || Math.abs(sp1 - sp0) > sp0*0.25) {
      const m = {k: 'tr', id: e.id, x0: Math.round(e.x*10)/10, y0: Math.round(e.y*10)/10, vx: Math.round(nvx), vy: Math.round(nvy), t0: t, al: want.tg ? 1 : 0};
      applyTr(m); mpSend('tr', m);
    }
  }
}
function applyTr(m) {
  const e = ents.find(x => x.id === m.id); if (!e || e.dead) return;
  if (!e.sp) e.sp = Math.abs(e.vx);
  Object.assign(e, {x0: +m.x0, y0: +m.y0, vx: +m.vx || 1, vy: +m.vy || 0, t0: +m.t0, bobA: 0, ph0: 0});
  if (m.al) e.alarm = 1.2;
}

/* ---------- Münzen, Skins, Accessoires, seltene Ereignisse ----------
   Münzen bleiben über alle Leben und Spiele erhalten («generational wealth»).
   Ziel: reichster Fisch im Meer. Ausgeben kann man sie nur für sehr teure Accessoires (Status zeigen). */
const RARE = SPECIES.filter(s => s.rare);
const fmt = n => String(Math.max(0, Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
const ACC = {
  brille:   {n: 'Sonnenbrille',    p: 500,     slot: 'eyes'},
  monokel:  {n: 'Monokel',         p: 1500,    slot: 'eyes'},
  kette:    {n: 'Goldkette',       p: 3000,    slot: 'neck'},
  zylinder: {n: 'Zylinder',        p: 7500,    slot: 'head'},
  uhr:      {n: 'Goldene Uhr',     p: 15000,   slot: 'wrist'},
  grill:    {n: 'Diamant-Grill',   p: 40000,   slot: 'mouth'},
  kapitaen: {n: 'Kapitänsmütze',   p: 80000,   slot: 'head'},
  halo:     {n: 'Heiligenschein',  p: 200000,  slot: 'halo'},
  aura:     {n: 'Goldene Aura',    p: 1000000, slot: 'aura'},
};
if (!stats.coins) stats.coins = 0;
if (!stats.owned || typeof stats.owned !== 'object') stats.owned = {};
if (!Array.isArray(stats.worn)) stats.worn = [];
stats.worn = stats.worn.filter(id => ACC[id] && stats.owned[id]);
let mySkin = 'puffer';
try { mySkin = localStorage.getItem('blubberbiss-skin') || 'puffer'; } catch (e) {}
const netWorth = () => stats.coins + Object.keys(stats.owned).reduce((s, id) => s + (ACC[id] ? ACC[id].p : PROPS[id] ? PROPS[id].p : 0), 0);

function skinDef(k) {
  if (!k || k === 'puffer') return {k: 'puffer', n: 'Kugelfisch', kind: 'puffer'};
  if (k === 'nurija') return NURIJA_SKIN;
  if (k === 'disco') return DISCO_SKIN;
  const s = SPECIES.find(x => x.k === k);
  return s && !s.jelly && s.k !== 'player' ? s : {k: 'puffer', n: 'Kugelfisch', kind: 'puffer'};
}
const isSpecialSkin = sd => !!(sd.rare || sd.ll || sd.k === 'gold');
const skinOk = k => { // normale Fische sind immer frei, Spezialfische muss man erst fressen
  if (k === 'puffer') return true;
  const sd = skinDef(k); if (sd.k !== k || k === 'nurija' || k === 'disco') return false;
  return !isSpecialSkin(sd) || (stats.eaten[k] || 0) > 0 || !!(stats.unlocked && stats.unlocked[k]);
};
if (!skinOk(mySkin)) mySkin = 'puffer';
function setSkin(k) { if (!skinOk(k)) return; mySkin = k; try { localStorage.setItem('blubberbiss-skin', k); } catch (e) {} }

let coinPopT = 0;
function addCoins(n, x, y) {
  stats.coins += n; stats.coinsEarned = (stats.coinsEarned || 0) + n; saveStats(); wealthDirty = true;
  if (x !== undefined) popup(x, y, '+' + n + ' ●', '#ffd25a', 8);
  tone(1760, 2349, 0.05, 'square', 0.03);
}

/* --- Accessoires zeichnen (lokale Fisch-Koordinaten, Blick nach rechts) --- */
function drawAccLocal(list, spr, sc, r) {
  if (!list || !list.length) return;
  const a = spr.a*sc, b = spr.b*sc, u = Math.max(1, Math.round(r / 7)), ex = Math.round(a*0.5), ey = Math.round(-b*0.2);
  const has = id => list.includes(id);
  if (has('kette')) { ctx.fillStyle = '#ffd25a'; for (let x = -a*0.15; x < a*0.62; x += 2*u) { const yy = b*0.42 + Math.sin((x/a)*3.1)*b*0.12; ctx.fillRect(Math.round(x), Math.round(yy), u, u); } }
  if (has('uhr')) { ctx.fillStyle = '#5a3a00'; ctx.fillRect(Math.round(a*0.02) - u, Math.round(b*0.2) - u, 3*u, 3*u); ctx.fillStyle = '#ffd25a'; ctx.fillRect(Math.round(a*0.02) - u + 1, Math.round(b*0.2) - u + 1, 3*u - 2, 3*u - 2); ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(a*0.02), Math.round(b*0.2), 1, 1); }
  if (has('brille')) { ctx.fillStyle = '#0b0b12'; ctx.fillRect(ex - 3*u, ey - u, 6*u, 2*u + 1); ctx.fillRect(ex - 6*u, ey - u, 3*u, 1); ctx.fillStyle = 'rgba(120,200,255,0.8)'; ctx.fillRect(ex - 2*u, ey - u + 1, u, 1); }
  if (has('monokel')) { ctx.fillStyle = '#ffd25a'; ring(ex, ey, 2*u + 0.5); ctx.fillRect(ex, ey + 2*u + 1, 1, 4*u); }
  if (has('grill')) { const mx = Math.round(a*0.82), my = Math.round(b*0.18); ctx.fillStyle = Math.floor(time*6) % 2 ? '#ffffff' : '#8ff4ff'; ctx.fillRect(mx - u, my, 2*u, u); ctx.fillStyle = '#ffffff'; if (Math.floor(time*3) % 3 === 0) ctx.fillRect(mx + u, my - 2*u, 1, 1); }
  if (has('zylinder')) { const hx = Math.round(a*0.25), top = Math.round(-b - 6*u); ctx.fillStyle = '#0b0b12'; ctx.fillRect(hx - 3*u, top, 6*u, 6*u); ctx.fillRect(hx - 5*u, top + 6*u, 10*u, u); ctx.fillStyle = '#d9443c'; ctx.fillRect(hx - 3*u, top + 4*u, 6*u, u); }
  if (has('kapitaen')) { const hx = Math.round(a*0.25), top = Math.round(-b - 3*u); ctx.fillStyle = '#f4f6fa'; ctx.fillRect(hx - 4*u, top, 8*u, 3*u); ctx.fillStyle = '#0b0b12'; ctx.fillRect(hx - 4*u, top + 3*u, 10*u, u); ctx.fillStyle = '#ffd25a'; ctx.fillRect(hx, top + u, u, u); }
  if (has('halo')) { ctx.fillStyle = Math.floor(time*4) % 2 ? '#ffe98a' : '#ffd25a'; const cy = Math.round(-b - (has('zylinder') ? 9 : has('kapitaen') ? 6 : 4)*u); for (let i = 0; i < 24; i++) { const t = i / 24 * 6.283; ctx.fillRect(Math.round(a*0.2 + Math.cos(t)*4*u), Math.round(cy + Math.sin(t)*1.2*u), 1, 1); } }
}
function drawAccWorld(list, x, y, r) { // Effekte um den Fisch herum
  if (!list || !list.includes('aura')) return;
  for (let i = 0; i < 6; i++) {
    const t = time*1.3 + i*1.05, rr = r*1.5 + Math.sin(t*2.3)*3;
    ctx.fillStyle = i % 2 ? '#ffd25a' : '#fff6c0';
    ctx.fillRect(Math.round(x + Math.cos(t)*rr), Math.round(y + Math.sin(t)*rr*0.8), 1, 1);
  }
}
function drawRareSparkle(x, y, s) {
  ctx.fillStyle = Math.floor(time*8) % 2 ? '#ffffff' : '#ffe98a';
  ctx.fillRect(Math.round(x + Math.sin(time*7)*s.a), Math.round(y - s.b - 2), 1, 1);
  ctx.fillRect(Math.round(x + Math.cos(time*5)*s.a), Math.round(y + s.b + 1), 1, 1);
  ctx.fillRect(Math.round(x - Math.sin(time*6)*s.a*0.8), Math.round(y + Math.cos(time*4)*s.b), 1, 1);
}
function drawLandlord(s) { // Krawatte, Zylinder und Monokel für den Immobilienhai (lokale Koordinaten)
  const a = s.a, b = s.b, u = Math.max(1, Math.round(a / 16));
  ctx.fillStyle = '#d9443c'; ctx.fillRect(Math.round(a*0.25), Math.round(b*0.2), 2*u, 5*u); ctx.fillRect(Math.round(a*0.25) - u, Math.round(b*0.2), 4*u, u);
  const hx = Math.round(a*0.35), top = Math.round(-b - 7*u);
  ctx.fillStyle = '#0b0b12'; ctx.fillRect(hx - 3*u, top, 6*u, 7*u); ctx.fillRect(hx - 5*u, top + 7*u, 10*u, u);
  ctx.fillStyle = '#ffd25a'; ctx.fillRect(hx - 3*u, top + 5*u, 6*u, u); ring(Math.round(a*0.6), Math.round(-b*0.24), 2*u);
}

/* --- Seltene Ereignisse: alle angekündigt --- */
function announce(kind, nm) {
  if (kind === 'rare') { banner('SELTENER FISCH!', String(nm || '').toUpperCase() + ' · SCHNAPP IHN'); sfx.pearl(); tone(1319, 1760, 0.2, 'triangle', 0.06, 0.2); }
  else if (kind === 'sardine') { banner('SARDINENSCHWARM!', 'BÜFFET IST ERÖFFNET'); [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.08, 'square', 0.05, i*0.07)); }
  else if (kind === 'landlord') { banner('DER IMMOBILIENHAI!', 'MIETE FÄLLIG · HALT DEINE MÜNZEN FEST'); tone(220, 110, 0.6, 'sawtooth', 0.07); }
  else if (kind === 'chest') { banner('SCHATZ IN SICHT!', 'EINE TRUHE SINKT ZU BODEN'); sfx.pearl(); }
  else if (kind === 'mystery') { banner('MYSTERY-FISCH!', 'WER IHN FRISST, DREHT AM GLÜCKSRAD'); [392, 523, 392, 659, 392, 784].forEach((f, i) => tone(f, f, 0.1, 'triangle', 0.06, i*0.1)); }
  else if (kind === 'sub') { banner('FORSCHUNGS-U-BOOT', 'ES WIRFT AB UND ZU WAS RAUS'); tone(440, 440, 0.08, 'sine', 0.06); tone(660, 660, 0.08, 'sine', 0.06, 0.12); }
  else if (kind === 'subdrop') { if (nm !== undefined && arguments.length > 2) popup(arguments[2], arguments[3] - 8, 'ÜBERRASCHUNG!', '#fff6c0', 8); tone(880, 1320, 0.1, 'triangle', 0.05); }
  else if (kind === 'loot') { banner('LOOTBOX VERGRABEN!', 'FOLG DEM LICHT · AM BODEN DRÜBER REIBEN'); [262, 330, 392, 523, 659, 784].forEach((f, i) => tone(f, f, 0.12, 'triangle', 0.06, i*0.08)); }
}
function spawnSpecial(type) {
  const t = ft(), wy = () => rnd(WTOP() + 20, FLOOR - 30);
  if (type === 'rare') {
    const sp = pick(RARE), o = {r: +rnd(5, 8).toFixed(1), pal: sp.pal, kind: sp.kind, sp: Math.round(rnd(46, 58)), rare: 1, bobA: 22, bobF: 3};
    if (mp) hostEmit({k: 'sp', ann: 'rare', nm: sp.n, e: [mkNetFish(Object.assign({y: wy()}, o))]});
    else { const e = spawnFish(o); Object.assign(e, {rare: 1, bobA: 22, bobF: 3}); announce('rare', sp.n); }
  } else if (type === 'sardine') {
    const fromLeft = Math.random() < 0.5, y = rnd(WTOP() + 30, FLOOR - 40), n = 24 + Math.floor(Math.random()*10), out = [];
    for (let i = 0; i < n; i++) {
      const o = {r: +rnd(2.5, 3.2).toFixed(1), pal: 'sardine', kind: 'fish', fromLeft, sp: 36, y: clamp(y + rnd(-18, 18), WTOP() + 4, FLOOR - 8), off: rnd(0, 90), bobA: 4, bobF: 2};
      if (mp) out.push(mkNetFish(o)); else { const e = spawnFish(o); e.bobA = 4; e.bobF = 2; }
    }
    if (mp) hostEmit({k: 'sp', ann: 'sardine', e: out}); else announce('sardine');
  } else if (type === 'landlord') {
    const o = {r: +rnd(18, 23).toFixed(1), pal: 'shark', kind: 'shark', sp: 30, ll: 1, bobA: 0, bobF: 1};
    if (mp) hostEmit({k: 'sp', ann: 'landlord', e: [mkNetFish(Object.assign({y: wy()}, o))]});
    else { const e = spawnFish(o); Object.assign(e, {ll: 1, bobA: 0, huntCd: 0}); announce('landlord'); }
  } else if (type === 'mystery') {
    const o = {r: 6, pal: 'mystery', kind: 'fish', sp: 52, my: 1, bobA: 30, bobF: 3.5};
    if (mp) { const d = mkNetFish(Object.assign({y: wy()}, o)); d.my = 1; hostEmit({k: 'sp', ann: 'mystery', e: [d]}); }
    else { const e = spawnFish(o); Object.assign(e, {my: 1, rare: 1, bobA: 30, bobF: 3.5}); announce('mystery'); }
  } else if (type === 'chest') {
    const d = {id: mp ? nid() : 'c' + t, type: 'chest', r: 6, x0: Math.round(rnd(40, W - 40)), y0: SURF - 4, vy: 18, t0: t};
    if (mp) hostEmit({k: 'sp', ann: 'chest', e: [d]});
    else { ents.push(Object.assign(d, {x: d.x0, y: d.y0, ph: 0, local: 1})); announce('chest'); }
  }
}
function chestAt(e) { const tau = ft() - e.t0; e.x = e.x0; e.y = Math.min(FLOOR - 5, e.y0 + e.vy*tau); e.ph = tau; if (tau > 32) e.dead = true; }
// Qualle: steigt auf, bleibt knapp unter der Oberfläche stehen und treibt dann seitlich aus dem Bild
function jellyAt(e) {
  const tau = Math.max(0, ft() - e.t0), top = SURF + 8 + e.r*1.2, rise = 0.9*-e.vy;
  const tTop = Math.max(0, (e.y0 - top) / rise);
  e.squash = Math.max(0, Math.sin(tau*2.6));
  if (tau < tTop) { e.y = e.y0 - rise*tau + 0.2*e.vy*Math.cos(tau*2.6); e.x = e.x0 + Math.sin(tau*0.8)*10; }
  else {
    const k = tau - tTop, drift = e.x0 < W/2 ? -1 : 1;
    e.y = top + Math.sin(k*1.4)*3; e.x = e.x0 + Math.sin(tau*0.8)*10 + drift*Math.min(k, 3)*k*1.5 + drift*Math.max(0, k - 3)*9;
  }
  e.ph = tau;
  if (e.x < -30 || e.x > W + 30 || tau > 120) e.dead = true;
}

/* --- Immobilienhai: will Miete --- */
const RENT_JOKES = [['MIETE FÄLLIG!', 'ZAHLBAR SOFORT'], ['NEBENKOSTEN-ABRECHNUNG!', 'WASSER IST LEIDER TEURER GEWORDEN'],
  ['MIETERHÖHUNG!', 'WEGEN «WERTVERMEHRENDER INVESTITIONEN»'], ['EIGENBEDARF!', 'DAS RIFF WIRD SANIERT. SIE MÜSSEN RAUS'],
  ['REFERENZZINS GESTIEGEN!', 'MIETE RAUF. ER SANK? ZUFALL'], ['MIETE FÄLLIG!', '3 ZIMMER, 40\'000 MÜNZEN, SEESICHT']];
function payRent(e) {
  const p = player;
  if ((e.rentCd || 0) > time || p.inv > 0) return;
  e.rentCd = time + 3;
  const kx = Math.sign(p.x - e.x) || 1; p.vx = kx*110; p.vy = -30; p.inv = 1;
  if (stats.coins <= 0) { banner('KEIN GELD?', 'DANN WOHNEN SIE EBEN UNTER DER BRÜCKE'); tone(200, 120, 0.3, 'sawtooth', 0.06); return; }
  const rent = Math.max(5, Math.round(stats.coins*0.1));
  stats.coins -= rent; saveStats(); wealthDirty = true;
  popup(p.x, p.y - p.r - 8, 'MIETE -' + fmt(rent) + ' ●', '#ff7ab0', 9);
  const j = pick(RENT_JOKES); banner(j[0], j[1]);
  tone(523, 262, 0.25, 'square', 0.06); burst(p.x, p.y, '#ffd25a', 10, 50);
}
const BIGGER = () => { if (Math.random() < 0.45) setTimeout(() => banner('ES GIBT IMMER', 'EINEN GRÖSSEREN FISCH'), 900); };

/* --- Garderobe: Skins, Accessoires, reichste Fische --- */
let shopFrom = 'title';
function showShop(from) {
  shopFrom = from; renderShop(); fetchWealth();
  $('title').hidden = true; $('over').hidden = true; $('stats').hidden = true; $('shop').hidden = false;
}
function hideShop() { $('shop').hidden = true; if (shopFrom === 'over') $('over').hidden = false; else $('title').hidden = false; }
function renderPreview() {
  const c = $('shopPreview'), g = c.getContext('2d'), saved = ctx;
  g.clearRect(0, 0, c.width, c.height); g.imageSmoothingEnabled = false;
  ctx = g;
  try { drawPuffer({x: c.width/2, y: c.height/2 + 6, r: 14, dir: 1, pal: mpPal || 'puffer', sk: mySkin, ac: stats.worn, glasses: nStage >= 6}); drawAccWorld(stats.worn, c.width/2, c.height/2 + 6, 14); }
  finally { ctx = saved; }
}
function skinIcon(sd, unlocked) {
  const c = document.createElement('canvas'); c.width = 44; c.height = 30;
  if ((sd.rare || sd.ll) && spriteIcon(sd, c, unlocked)) return c;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  const spr = buildFish(9, sd.kind === 'puffer' ? (mpPal || 'puffer') : sd.pal, sd.kind, false);
  const k = Math.min(40 / spr.w, 26 / spr.h);
  g.drawImage(spr.c, Math.round((44 - spr.w*k)/2), Math.round((30 - spr.h*k)/2), Math.round(spr.w*k), Math.round(spr.h*k));
  if (!unlocked) { g.globalCompositeOperation = 'source-in'; g.fillStyle = '#234a73'; g.fillRect(0, 0, 44, 30); }
  return c;
}
function accIcon(id) {
  const c = document.createElement('canvas'); c.width = 44; c.height = 30;
  const g = c.getContext('2d'), saved = ctx; g.imageSmoothingEnabled = false;
  ctx = g;
  try {
    const i = Object.keys(ACC).indexOf(id);
    if (!drawSpr('acc', i, 22, 15, 38)) { drawPuffer({x: 22, y: 18, r: 8, dir: 1, pal: 'puffer', sk: 'puffer', ac: [id]}); drawAccWorld([id], 22, 18, 8); }
  } finally { ctx = saved; }
  return c;
}
function renderShop() {
  $('shopCoins').innerHTML = `MÜNZEN <b>● ${fmt(stats.coins)}</b> · VERMÖGEN <b>● ${fmt(netWorth())}</b>`;
  renderPreview();
  const sg = $('skinGrid'); sg.innerHTML = '';
  for (const sd of [skinDef('puffer')].concat(SPECIES.filter(s => !s.jelly && s.k !== 'player'))) {
    const ok = skinOk(sd.k), on = mySkin === sd.k;
    const b = document.createElement('button'); b.type = 'button';
    b.className = 'ccard' + (ok ? '' : ' none') + (on ? ' on' : '') + (sd.rare ? ' rare' : ''); b.disabled = !ok;
    b.appendChild(skinIcon(sd, ok));
    const t = document.createElement('div');
    t.innerHTML = `<div class="cn">${ok ? esc(sd.n) : '???'}${sd.rare ? ' <span class="rtag">SELTEN</span>' : ''}</div><div class="cc small">${on ? 'GEWÄHLT' : ok ? 'WÄHLEN' : 'ERST FRESSEN'}</div>`;
    b.appendChild(t);
    b.addEventListener('click', () => { setSkin(sd.k); tone(700, 1000, 0.06, 'square', 0.04); renderShop(); });
    sg.appendChild(b);
  }
  const ag = $('accGrid'); ag.innerHTML = '';
  for (const [id, a] of Object.entries(ACC)) {
    const own = !!stats.owned[id], worn = stats.worn.includes(id), afford = stats.coins >= a.p;
    const b = document.createElement('button'); b.type = 'button';
    b.className = 'ccard' + (worn ? ' on' : '') + (!own && !afford ? ' none' : '');
    b.appendChild(accIcon(id));
    const t = document.createElement('div');
    t.innerHTML = `<div class="cn">${esc(a.n)}</div><div class="cc small">${own ? (worn ? 'AN · ABLEGEN' : 'ANZIEHEN') : '● ' + fmt(a.p)}</div>`;
    b.appendChild(t);
    b.addEventListener('click', () => {
      if (!own) {
        if (!afford) { tone(200, 150, 0.12, 'square', 0.05); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
        stats.coins -= a.p; stats.owned[id] = true; sfx.level();
        banner('GEKAUFT!', a.n.toUpperCase() + (a.p >= 100000 ? ' · ABSOLUTER FLEX' : ' · SEHR STILVOLL'));
      }
      if (stats.worn.includes(id)) stats.worn = stats.worn.filter(x => x !== id);
      else stats.worn = stats.worn.filter(x => ACC[x].slot !== a.slot).concat(id);
      saveStats(); wealthDirty = true; submitWealth(); renderShop();
    });
    ag.appendChild(b);
  }
  renderWealth(); renderEstate();
}
$('shopBtn').addEventListener('click', e => { e.stopPropagation(); showShop('title'); });
$('overShopBtn').addEventListener('click', () => showShop('over'));
$('shopBack').addEventListener('click', hideShop);

/* --- Reichste Fische im Meer (Supabase) --- */
let wealthList = null, wealthDirty = false, wealthSentAt = 0;
async function fetchWealth() {
  const c = sb(); if (!c) return;
  try { const {data, error} = await c.rpc('blubberbiss_wealth_top', {p_limit: 10}); if (error) throw error; wealthList = Array.isArray(data) ? data : []; }
  catch (e) { wealthList = wealthList || null; }
  renderWealth(); renderRichRec();
}
function renderWealth() {
  const el = $('richList'); if (!el) return;
  if (!wealthList) { el.innerHTML = '<li><span></span><span>Liste nicht erreichbar</span><span></span></li>'; return; }
  if (!wealthList.length) { el.innerHTML = '<li><span></span><span>Noch niemand reich. Deine Chance!</span><span></span></li>'; return; }
  const me = cleanName(mpName);
  el.innerHTML = wealthList.map(r => {
    const acc = String(r.acc || '').split(',').filter(id => ACC[id]).map(id => ACC[id].n).join(', ');
    return `<li class="${me && r.name === me ? 'me' : ''}"><span>${esc(r.name)}${acc ? `<span class="md">${esc(acc)}</span>` : ''}</span><span>● ${fmt(r.wealth)}</span></li>`;
  }).join('');
}
function renderRichRec() {
  const r = wealthList && wealthList[0];
  $('richTitle').hidden = !r; if (r) $('richTitle').textContent = `REICHSTER FISCH IM MEER: ${r.name} · ● ${fmt(r.wealth)}`;
}
async function submitWealth() {
  const c = sb(); if (!c || !wealthDirty || Date.now() - wealthSentAt < 20000) return;
  const w = netWorth(); if (w <= 0 && !stats.donated) return;
  if (!mpName) { mpName = randName(); try { localStorage.setItem('blubberbiss-name', mpName); } catch (e) {} }
  wealthDirty = false; wealthSentAt = Date.now();
  try { await c.rpc('blubberbiss_wealth_submit', {p_name: mpName, p_wealth: w, p_acc: stats.worn.join(','), p_token: scoreToken, p_donated: stats.donated || 0}); fetchWealth(); fetchDonors(); } catch (e) { wealthDirty = true; }
}
setInterval(() => { if (!document.hidden) submitWealth(); }, 30000);
fetchWealth();

/* ---------- Lootboxen: im Meeresboden vergraben, durch Reiben freilegen, beim Tod öffnen ---------- */
if (!stats.unlocked || typeof stats.unlocked !== 'object') stats.unlocked = {};
let runLoot = 0;              // in diesem Leben ausgegrabene Lootboxen
const lootPops = [];          // Ausbruch-Animation beim Ausgraben
function drawLootPops(dt) {
  for (let i = lootPops.length - 1; i >= 0; i--) {
    const lp = lootPops[i]; lp.t += dt;
    if (lp.t > 1.6) { lootPops.splice(i, 1); continue; }
    const u = lp.t / 1.6, x = Math.round(lp.x), y = Math.round(lp.y - 10 - Math.sin(Math.min(1, u*1.6)*Math.PI*0.5)*40);
    ctx.save(); ctx.translate(x, y); ctx.rotate(lp.t*3);
    for (let k = 0; k < 8; k++) { ctx.rotate(Math.PI/4); ctx.fillStyle = `rgba(255,220,120,${(0.5*(1 - u)).toFixed(3)})`; ctx.fillRect(0, -1, 14 + u*26, 3); }
    ctx.restore();
    const s = 1 + Math.sin(lp.t*18)*0.12*(1 - u);
    if (drawSpr('lootbox', u < 0.5 ? 3 : 4 + Math.floor(lp.t*10) % 2, x, y, 30*s, false)) { if (Math.random() < 0.4) parts.push({x: x + rnd(-6, 6), y: y - 4, vx: rnd(-40, 40), vy: -rnd(20, 60), life: rnd(0.4, 0.8), c: '#ffd25a', s: 1}); continue; }
    ctx.fillStyle = '#3a1d0c'; ctx.fillRect(x - Math.round(7*s), y - Math.round(5*s), Math.round(14*s), Math.round(10*s));
    ctx.fillStyle = '#7d3fbf'; ctx.fillRect(x - Math.round(6*s), y - Math.round(4*s), Math.round(12*s), Math.round(8*s));
    ctx.fillStyle = '#ffcf3a'; ctx.fillRect(x - Math.round(7*s), y - 1, Math.round(14*s), 1); ctx.fillRect(x - 1, y - 2, 2, 3);
    if (Math.random() < 0.4) parts.push({x: x + rnd(-6, 6), y: y - 4, vx: rnd(-40, 40), vy: -rnd(20, 60), life: rnd(0.4, 0.8), c: '#ffd25a', s: Math.random() < 0.3 ? 2 : 1});
  }
}
const digState = new Map();   // Fortschritt pro Lootbox (nur lokal)
function updateLoot(dt) {
  const p = player, sp = Math.hypot(p.vx, p.vy);
  for (let i = feats.length - 1; i >= 0; i--) {
    const f = feats[i]; if (f.type !== 'loot') continue;
    if (ft() - f.t0 > 240) { feats.splice(i, 1); continue; }
    if (state !== 'play' || p.air || p.ship) continue;
    const fy = floorAt(f.x);
    if (Math.abs(p.x - f.x) < 10 + p.r*0.8 && p.y > fy - p.r - 12) {
      const d = (digState.get(f.id) || 0) + Math.min(1, sp / 60)*dt*0.38; // reiben = sich bewegen
      digState.set(f.id, d);
      if (sp > 15 && Math.random() < 0.6) parts.push({x: f.x + rnd(-6, 6), y: fy - 1, vx: rnd(-25, 25), vy: -rnd(15, 45), life: rnd(0.3, 0.6), c: '#c9b07a', s: 1});
      if (sp > 15 && Math.random() < dt*6) tone(90 + d*200, 60, 0.05, 'square', 0.025);
      if (d >= 1) {
        feats.splice(i, 1); digState.delete(f.id);
        if (mp) mpSend('fx', {id: f.id});
        runLoot++; sfx.level(); burst(f.x, fy - 4, '#ffd25a', 24, 70); flash = 0.7; flashCol = '255,220,120';
        lootPops.push({x: f.x, y: fy, t: 0});
        banner('LOOTBOX!', runLoot === 1 ? 'WIRD BEIM TOD GEÖFFNET' : runLoot + ' STÜCK · WERDEN BEIM TOD GEÖFFNET');
      }
    }
  }
}
function drawLoot(f) {
  const x = Math.round(f.x), fy = Math.round(floorAt(f.x)), d = clamp(digState.get(f.id) || 0, 0, 1), age = ft() - f.t0;
  // Lichtsäule von der Oberfläche: kurz nach dem Vergraben hell, danach pulsierend als Wegweiser
  const beam = age < 4 ? 1 - age/4*0.6 : 0.25 + Math.sin(time*2.5)*0.15;
  for (let y = SURF; y < fy; y += 2) {
    const w = 3 + Math.round((y - SURF) / (fy - SURF) * 6), a = beam * (0.12 + 0.18*((y + Math.floor(time*20)) % 6 === 0));
    ctx.fillStyle = `rgba(255,220,120,${a.toFixed(3)})`; ctx.fillRect(x - w, y, w*2, 2);
  }
  if (age < 1.2) { // Aufprall der Truhe
    ctx.fillStyle = `rgba(255,236,170,${(1.2 - age)*0.6})`; disc(x, fy - 2, 6 + age*16);
  }
  for (let i = 0; i < 3; i++) { // aufsteigende Funken
    const t = (time*0.8 + i/3) % 1; ctx.fillStyle = i % 2 ? '#fff6c0' : '#ffd25a';
    ctx.fillRect(Math.round(x + Math.sin(t*9 + i)*5), Math.round(fy - 4 - t*40), 1, 1);
  }
  if (drawSpr('lootbox', d < 0.33 ? 0 : d < 0.66 ? 1 : d < 1 ? 2 : 3, x, fy + 3, 30, false, 0.5, 1)) {
    if (d > 0 && d < 1) { ctx.fillStyle = '#04101f'; ctx.fillRect(x - 9, fy - 26, 18, 3); ctx.fillStyle = '#ffd25a'; ctx.fillRect(x - 8, fy - 25, Math.round(16*d), 1); }
    return;
  }
  const rise = Math.round(d*8); // Truhe kommt Stück für Stück aus dem Sand
  ctx.fillStyle = '#3a1d0c'; ctx.fillRect(x - 7, fy - rise - 1, 14, 10);
  ctx.fillStyle = '#6b2fa3'; ctx.fillRect(x - 6, fy - rise, 12, 8);
  ctx.fillStyle = '#ffcf3a'; ctx.fillRect(x - 7, fy - rise + 2, 14, 1); ctx.fillRect(x - 1, fy - rise + 1, 2, 3);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 3, fy - rise + 4, 1, 1);
  const mound = Math.round((1 - d)*9); // Sandhügel darüber
  for (let y = 0; y < mound; y++) { const w = Math.round((mound - y)*1.6 + 3); ctx.fillStyle = y % 3 === 0 ? '#b89a62' : '#a88a55'; ctx.fillRect(x - w, fy - y + 1, w*2, 1); }
  if (Math.floor(time*4 + f.x) % 4 === 0) { ctx.fillStyle = '#ffe98a'; ctx.fillRect(x + 6, fy - mound - rise - 3, 1, 2); }
  if (d > 0 && d < 1) { ctx.fillStyle = '#04101f'; ctx.fillRect(x - 9, fy - 22, 18, 3); ctx.fillStyle = '#ffd25a'; ctx.fillRect(x - 8, fy - 21, Math.round(16*d), 1); }
}
// Was in einer Lootbox steckt
function rollLoot() {
  const q = Math.random();
  if (q < 0.02) return {t: 'coins', n: 10000, label: 'JACKPOT!', big: true};
  if (q < 0.08) {
    const sp = pick(RARE); stats.unlocked[sp.k] = true;
    return {t: 'skin', label: 'SELTENER SKIN: ' + sp.n.toUpperCase(), big: true};
  }
  if (q < 0.24) {
    const ids = Object.keys(ACC), w = ids.map(id => 1 / Math.sqrt(ACC[id].p)), sum = w.reduce((a, b) => a + b, 0);
    let r = Math.random()*sum, id = ids[0];
    for (let i = 0; i < ids.length; i++) { r -= w[i]; if (r <= 0) { id = ids[i]; break; } }
    if (stats.owned[id]) { const n = Math.round(ACC[id].p*0.25); return {t: 'coins', n, label: ACC[id].n.toUpperCase() + ' (DOPPELT) → ● ' + fmt(n)}; }
    stats.owned[id] = true; return {t: 'acc', label: ACC[id].n.toUpperCase() + '!', big: ACC[id].p >= 40000};
  }
  if (q < 0.46) { const n = Math.round(rnd(800, 2500)); return {t: 'coins', n, label: 'GOLDHAUFEN · ● ' + fmt(n)}; }
  const n = Math.round(rnd(80, 400)); return {t: 'coins', n, label: '● ' + fmt(n)};
}
function openLoot(after) {
  if (runLoot <= 0) { if (after) after(); return; }
  let left = runLoot; runLoot = 0;
  const el = $('loot'), list = $('lootList'), box = $('lootBox'), hint = $('lootHint'), done = $('lootDone');
  list.innerHTML = ''; el.hidden = false; done.hidden = true; box.classList.remove('open', 'shaking');
  const useSpr = !!sprReady('lootbox'), lc = $('lootCanvas');
  const lootShow = i => { const s = SPR.lootbox, g = lc.getContext('2d'); g.clearRect(0, 0, lc.width, lc.height); g.imageSmoothingEnabled = false; g.drawImage(s.img, i*s.w, 0, s.w, s.h, 0, 0, lc.width, lc.height); };
  box.classList.toggle('spr', useSpr); lc.hidden = !useSpr; if (useSpr) lootShow(3);
  $('lootTitle').textContent = left === 1 ? 'LOOTBOX!' : left + ' LOOTBOXEN!';
  let busy = false;
  const showHint = () => { hint.textContent = left > 0 ? 'KLICK AUF DIE TRUHE ZUM ÖFFNEN' + (left > 1 ? ' · NOCH ' + left : '') : ''; };
  const finish = () => { saveStats(); wealthDirty = true; submitWealth(); done.hidden = false; done.focus({preventScroll: true}); };
  // Ein Klick öffnet genau eine Truhe
  const openOne = () => {
    if (busy || left <= 0) return;
    busy = true; left--; hint.textContent = '';
    box.classList.remove('open'); void box.offsetWidth; box.classList.add('shaking');
    [300, 340, 380, 420].forEach((f, k) => tone(f, f*1.2, 0.07, 'square', 0.05, k*0.12));
    if (useSpr) { let k = 0; const iv = setInterval(() => lootShow(4 + (k++ % 2)), 90); setTimeout(() => { clearInterval(iv); lootShow(6); }, 560); }
    setTimeout(() => {
      if (useSpr) lootShow(7);
      const r = rollLoot(); if (r.t === 'coins') addCoins(r.n);
      box.classList.remove('shaking'); box.classList.add('open');
      if (r.big) { sfx.level(); flash = 1; flashCol = '255,210,90'; confetti(60); } else sfx.pearl();
      const li = document.createElement('li'); li.className = r.big ? 'big' : ''; li.textContent = r.label; list.appendChild(li);
      busy = false;
      if (left > 0) setTimeout(() => { box.classList.remove('open'); if (useSpr) lootShow(3); showHint(); }, 900); else finish();
    }, 700);
  };
  box.onclick = openOne;
  box.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openOne(); } };
  done.onclick = () => { el.hidden = true; if (after) after(); };
  showHint();
  setTimeout(() => { try { box.focus({preventScroll: true}); } catch (e) {} }, 50);
}

/* ---------- Mystery-Fisch & Glücksrad: Skin für den Rest des Laufs ---------- */
let runSkin = null;
const effSkin = () => runSkin || mySkin;
const NURIJA_SKIN = {k: 'nurija', n: 'Mini-Nurija', kind: 'fish', img: true};
const DISCO_SKIN = {k: 'disco', n: 'Discofisch', pal: 'rainbow', kind: 'fish', disco: true};
const WHEEL = [NURIJA_SKIN, {k: 'gold', w: 1}, {k: 'rare-rainbow'}, {k: 'landlord'}, DISCO_SKIN, {k: 'rare-geist'}, {k: 'shark'}, {k: 'rare-lava'}, {k: 'rare-kristall'}, {k: 'rare-nacht'}]
  .map(s => s.n ? s : SPECIES.find(x => x.k === s.k));
let wheel = null;
function startWheel() {
  const won = Math.random() < 0.12 ? 0 : 1 + Math.floor(Math.random()*(WHEEL.length - 1));
  const segs = WHEEL.length, seg = 360 / segs;
  const target = 360*7 + (360 - (won*seg + seg/2)); // Zeiger oben
  wheel = {won, t: 0, dur: 4.6, target, last: -1, prevState: state};
  if (!mp && state === 'play') state = 'wheel';
  // Schild während des Glücksrads (Solo steht das Spiel still, darum dort kürzer)
  player.inv = Math.max(player.inv, mp ? 6.5 : 2); player.shield = Math.max(player.shield, mp ? 7.5 : 2.5);
  $('wheel').hidden = false; $('wheelWin').textContent = ''; $('wheelWin').classList.remove('show');
  drawWheel(0);
  banner('MYSTERY-FISCH!', 'DAS GLÜCKSRAD DREHT SICH');
  [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, f, 0.09, 'square', 0.06, i*0.06));
  confetti(60);
}
function wheelIcon(sd, size) {
  const c = document.createElement('canvas'); c.width = size; c.height = size*0.7;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  if (sd.img) { if (faceImg) { const k = Math.min(c.width / faceImg.width, c.height / faceImg.height); g.drawImage(faceImg, (c.width - faceImg.width*k)/2, (c.height - faceImg.height*k)/2, faceImg.width*k, faceImg.height*k); } return c; }
  if (wheelIconSprite(sd, c)) return c;
  const spr = buildFish(9, sd.pal, sd.kind, false), k = Math.min(c.width*0.9 / spr.w, c.height*0.9 / spr.h);
  g.drawImage(spr.c, (c.width - spr.w*k)/2, (c.height - spr.h*k)/2, spr.w*k, spr.h*k);
  return c;
}
const wheelIcons = new Map();
function drawWheel(rot) {
  const ring = sprReady('wheel');
  if (ring) { drawWheelSprite(rot, ring); return; }
  const c = $('wheelCanvas'), g = c.getContext('2d'), R = c.width/2, n = WHEEL.length, seg = 2*Math.PI / n;
  g.clearRect(0, 0, c.width, c.height);
  g.save(); g.translate(R, R); g.rotate(rot*Math.PI/180);
  for (let i = 0; i < n; i++) {
    g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R - 14, -Math.PI/2 + i*seg, -Math.PI/2 + (i + 1)*seg); g.closePath();
    g.fillStyle = WHEEL[i].img ? '#ff4f8b' : `hsl(${(i*360/n + time*40) % 360},85%,${i % 2 ? 55 : 45}%)`; g.fill();
    g.strokeStyle = '#03101f'; g.lineWidth = 4; g.stroke();
    g.save(); g.rotate(-Math.PI/2 + (i + 0.5)*seg); g.translate(R*0.62, 0); g.rotate(Math.PI/2);
    let ic = wheelIcons.get(WHEEL[i].k); if (!ic) { ic = wheelIcon(WHEEL[i], 64); wheelIcons.set(WHEEL[i].k, ic); }
    g.imageSmoothingEnabled = !!WHEEL[i].img; g.drawImage(ic, -32, -22, 64, 44);
    g.restore();
  }
  g.restore();
  // Lichterkette rundherum
  for (let i = 0; i < 28; i++) {
    const a = i / 28 * 2*Math.PI, on = (Math.floor(time*12) + i) % 2;
    g.beginPath(); g.arc(R + Math.cos(a)*(R - 7), R + Math.sin(a)*(R - 7), 5, 0, 7);
    g.fillStyle = on ? '#fff6c0' : '#ffb03a'; g.fill();
  }
  g.beginPath(); g.arc(R, R, 22, 0, 7); g.fillStyle = '#ffd25a'; g.fill(); g.strokeStyle = '#03101f'; g.lineWidth = 4; g.stroke();
  g.fillStyle = '#03101f'; g.font = '700 18px Silkscreen, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', R, R + 1);
  g.beginPath(); g.moveTo(R - 16, 2); g.lineTo(R + 16, 2); g.lineTo(R, 34); g.closePath(); g.fillStyle = '#ff3b5c'; g.fill(); g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.stroke();
}
function drawWheelSprite(rot, ring) {
  const c = $('wheelCanvas'), g = c.getContext('2d'), k = c.width / ring.w, cx = ring.cx*k, cy = ring.cy*k, R = (ring.r + 10)*k, n = WHEEL.length, seg = 2*Math.PI / n;
  g.clearRect(0, 0, c.width, c.height);
  g.save(); g.translate(cx, cy); g.rotate(rot*Math.PI/180);
  for (let i = 0; i < n; i++) {
    g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, -Math.PI/2 + i*seg, -Math.PI/2 + (i + 1)*seg); g.closePath();
    g.fillStyle = WHEEL[i].img ? '#ff4f8b' : `hsl(${(i*360/n + time*40) % 360},85%,${i % 2 ? 55 : 45}%)`; g.fill();
    g.strokeStyle = '#03101f'; g.lineWidth = 3; g.stroke();
    g.save(); g.rotate(-Math.PI/2 + (i + 0.5)*seg); g.translate(R*0.6, 0); g.rotate(Math.PI/2);
    let ic = wheelIcons.get(WHEEL[i].k); if (!ic) { ic = wheelIcon(WHEEL[i], 64); wheelIcons.set(WHEEL[i].k, ic); }
    g.imageSmoothingEnabled = !!WHEEL[i].img; g.drawImage(ic, -27, -19, 54, 38);
    g.restore();
  }
  g.restore();
  g.beginPath(); g.arc(cx, cy, 20*k*1.6, 0, 7); g.fillStyle = '#ffd25a'; g.fill(); g.strokeStyle = '#03101f'; g.lineWidth = 4; g.stroke();
  g.fillStyle = '#03101f'; g.font = '700 ' + Math.round(26*k) + 'px Silkscreen, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', cx, cy + 1);
  g.imageSmoothingEnabled = false;
  // Lichter blinken: Ring abwechselnd normal und heller zeichnen
  g.drawImage(ring.img, 0, 0, c.width, c.height);
  if (Math.floor(time*8) % 2) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.25; g.drawImage(ring.img, 0, 0, c.width, c.height); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
}
function wheelIconSprite(sd, c) { if (!(sd.rare || sd.ll)) return false; return spriteIcon(sd, c, true); }
function updateWheel(dt) {
  const w = wheel; if (!w) return;
  w.t += dt;
  const u = Math.min(1, w.t / w.dur), ease = 1 - Math.pow(1 - u, 4), rot = w.target*ease;
  drawWheel(rot);
  const segIdx = Math.floor(((rot % 360) + 360) % 360 / (360 / WHEEL.length));
  if (segIdx !== w.last) { w.last = segIdx; tone(1200, 900, 0.03, 'square', 0.04); }
  if (u >= 1 && !w.done) {
    w.done = true; const sd = WHEEL[w.won]; runSkin = sd.k;
    $('wheelWin').innerHTML = `DU BIST JETZT<br><b>${esc(sd.n.toUpperCase())}</b>`; $('wheelWin').classList.add('show');
    [784, 988, 1175, 1568, 1976, 2349].forEach((f, i) => tone(f, f, 0.14, 'square', 0.07, i*0.09));
    confetti(140); flash = 1; flashCol = '255,255,255';
  }
  if (w.done && w.t > w.dur + 1.8) {
    $('wheel').hidden = true; wheel = null;
    if (state === 'wheel') { state = 'play'; last = performance.now(); }
    banner('NEUER LOOK!', 'BIS ZUM NÄCHSTEN TOD');
  }
}
function confetti(n) {
  const box = $('confetti');
  for (let i = 0; i < n; i++) {
    const d = document.createElement('i');
    d.style.left = rnd(0, 100) + 'vw'; d.style.background = `hsl(${rnd(0, 360)},90%,60%)`;
    d.style.animationDuration = rnd(1.2, 2.6) + 's'; d.style.animationDelay = rnd(0, 0.4) + 's';
    d.style.setProperty('--dx', rnd(-30, 30) + 'vw'); d.style.setProperty('--rot', rnd(-720, 720) + 'deg');
    box.appendChild(d); setTimeout(() => d.remove(), 3200);
  }
}

/* ---------- Immobilien: passives Einkommen, im Multiplayer Miete von Besuchern ---------- */
const PROPS = {
  parzelle: {n: 'Riff-Parzelle',             p: 25000,  inc: 3},
  villa:    {n: 'Korallen-Villa',            p: 150000, inc: 15},
  turm:     {n: 'Unterwasser-Wolkenkratzer', p: 750000, inc: 60},
};
const bestProp = owned => ['turm', 'villa', 'parzelle'].find(id => owned[id]) || '';
const myParcel = () => { let h = 0; for (const ch of scoreToken) h = (h*31 + ch.charCodeAt(0)) >>> 0; return h % 7; };
const parcelX = i => Math.round((i + 0.5) * W / 7);
let incomeT = 10, rentStay = new Map();
function propIncome(dt) {
  if (state !== 'play') return;
  const inc = Object.keys(PROPS).reduce((s, id) => s + (stats.owned[id] ? PROPS[id].inc : 0), 0);
  if (!inc) return;
  incomeT -= dt;
  if (incomeT <= 0) { incomeT = 10; addCoins(inc); popup(player.x, player.y - player.r - 10, 'MIETEINNAHMEN +' + inc, '#ffd25a'); }
}
// Wer im Multiplayer bei einem fremden Gebäude herumschwimmt, zahlt dem Besitzer Miete
function visitorRent(dt) {
  if (!mp || state !== 'play') return;
  const p = player;
  for (const o of mp.peers.values()) {
    if (!o.prop) continue;
    const bx = parcelX(o.parcel), fy = floorAt(bx), inside = Math.abs(p.x - bx) < 26 && p.y > fy - 50;
    const t = inside ? (rentStay.get(o.id) || 0) + dt : 0; rentStay.set(o.id, t);
    if (t > 3 && stats.coins >= 5) {
      rentStay.set(o.id, 0); stats.coins -= 5; saveStats(); wealthDirty = true;
      mpSend('rent', {to: o.id, a: 5}); popup(p.x, p.y - p.r - 8, 'MIETE -5 → ' + o.name.toUpperCase(), '#ff7ab0', 7);
    }
  }
}
function drawBuilding(prop, bx, owner, mine) {
  const fy = Math.round(floorAt(bx)), x = Math.round(bx);
  if (prop === 'parzelle') {
    ctx.fillStyle = '#5a3418'; ctx.fillRect(x - 1, fy - 18, 2, 18);
    ctx.fillStyle = '#e9e2cf'; ctx.fillRect(x - 10, fy - 18, 20, 7); ctx.fillStyle = '#3a1d0c'; ctx.fillRect(x - 10, fy - 11, 20, 1);
    ctx.fillStyle = '#c4862a'; ctx.fillRect(x - 12, fy - 6, 24, 6); ctx.fillStyle = '#ffd25a'; ctx.fillRect(x - 3, fy - 4, 6, 4);
  } else if (prop === 'villa') {
    ctx.fillStyle = '#d65a86'; ctx.fillRect(x - 18, fy - 20, 36, 20);
    ctx.fillStyle = '#9b2c5c'; for (let i = 0; i < 9; i++) ctx.fillRect(x - 20 + i*1, fy - 21 - i, 40 - i*2, 1);
    ctx.fillStyle = '#ffd25a'; ctx.fillRect(x - 13, fy - 15, 5, 5); ctx.fillRect(x + 8, fy - 15, 5, 5); ctx.fillRect(x - 3, fy - 9, 6, 9);
    ctx.fillStyle = '#f2b6c8'; ctx.fillRect(x - 18, fy - 20, 36, 1);
  } else if (prop === 'turm') {
    ctx.fillStyle = '#1c2a44'; ctx.fillRect(x - 9, fy - 70, 18, 70); ctx.fillRect(x - 5, fy - 82, 10, 12); ctx.fillRect(x - 1, fy - 92, 2, 10);
    for (let yy = fy - 66; yy < fy - 4; yy += 6) for (let xx = -6; xx <= 4; xx += 5) { ctx.fillStyle = ((xx + yy + Math.floor(time*2)) % 3) ? '#ffd25a' : '#3a4d70'; ctx.fillRect(x + xx, yy, 2, 3); }
    ctx.fillStyle = Math.floor(time*3) % 2 ? '#ff3b5c' : '#5a0a1c'; ctx.fillRect(x - 1, fy - 94, 2, 2);
  }
  // Schild mit Besitzername (Status!) – als HTML-Schild, siehe syncTags
  signs.push({id: 'b' + (owner || 'me') + bx, x, y: fy + 14, name: mine ? 'Deine ' + PROPS[prop].n : PROPS[prop].n + ' · ' + owner, me: mine});
}
const signs = [];
function drawBuildings() {
  signs.length = 0;
  const mine = bestProp(stats.owned);
  if (mine && state !== 'title') drawBuilding(mine, parcelX(myParcel()), '', true);
  if (mp) for (const o of mp.peers.values()) if (o.prop && PROPS[o.prop]) drawBuilding(o.prop, parcelX(o.parcel), o.name, false);
}

/* ---------- Kopfgeld (Multiplayer) ---------- */
function bountyOn(id) { return (mp && mp.bounty && mp.bounty[id]) || 0; }
function placeBounty(id, a) {
  if (!mp || stats.coins < a) { tone(200, 150, 0.12, 'square', 0.05); return; }
  stats.coins -= a; saveStats(); wealthDirty = true;
  mp.bounty = mp.bounty || {}; mp.bounty[id] = (mp.bounty[id] || 0) + a;
  mpSend('bounty', {on: id, a});
  const o = mp.peers.get(id); banner('KOPFGELD!', (o ? o.name.toUpperCase() : '???') + ' · ● ' + fmt(mp.bounty[id]));
  renderBountyList();
}
function renderBountyList() {
  const el = $('bountyList'); if (!el) return;
  if (!mp || !mp.peers.size) { el.innerHTML = '<p class="hint">Niemand sonst im Ozean.</p>'; return; }
  el.innerHTML = '';
  for (const o of mp.peers.values()) {
    const row = document.createElement('div'); row.className = 'brow';
    row.innerHTML = `<span>${esc(o.name)}${bountyOn(o.id) ? ` <b>● ${fmt(bountyOn(o.id))}</b>` : ''}</span>`;
    for (const a of [100, 1000]) { const b = document.createElement('button'); b.className = 'pxbtn small'; b.textContent = '+' + fmt(a); b.disabled = stats.coins < a; b.onclick = () => placeBounty(o.id, a); row.appendChild(b); }
    el.appendChild(row);
  }
}

/* ---------- Nurija-Stiftung: Spenden (sinnlos, aber öffentlich) ---------- */
const DONATE_JOKES = ['NURIJA KAUFT SICH DAVON NEUE BRILLEN', 'STEUERLICH ABSETZBAR (NICHT WIRKLICH)', 'DEIN NAME STEHT JETZT AUF EINER BANK IM RIFF',
  'DAS GELD FLIESST IN «PROJEKTE»', 'NURIJA BEDANKT SICH MIT EINEM SCHREI', 'EFFEKTIVER ALTRUISMUS, ABER FÜR FISCHE'];
function donate(a) {
  if (stats.coins < a) { tone(200, 150, 0.12, 'square', 0.05); return; }
  stats.coins -= a; stats.donated = (stats.donated || 0) + a; saveStats(); wealthDirty = true; wealthSentAt = 0; submitWealth();
  banner('DANKE!', pick(DONATE_JOKES)); sfx.life(); renderShop();
}
let donorList = null;
async function fetchDonors() {
  const c = sb(); if (!c) return;
  try { const {data, error} = await c.rpc('blubberbiss_donors_top', {p_limit: 10}); if (error) throw error; donorList = Array.isArray(data) ? data : []; } catch (e) { donorList = donorList || null; }
  const el = $('donorList'); if (!el) return;
  if (!donorList) { el.innerHTML = '<li><span></span><span>Liste nicht erreichbar</span><span></span></li>'; return; }
  el.innerHTML = donorList.length ? donorList.map(r => `<li><span>${esc(r.name)}</span><span>● ${fmt(r.donated)}</span></li>`).join('') : '<li><span></span><span>Noch keine Spenden. Nurija weint.</span><span></span></li>';
}
function renderEstate() {
  const pg = $('propGrid'); if (!pg) return; pg.innerHTML = '';
  for (const [id, pr] of Object.entries(PROPS)) {
    const own = !!stats.owned[id], afford = stats.coins >= pr.p;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'ccard' + (own ? ' on' : '') + (!own && !afford ? ' none' : '');
    b.innerHTML = `<div style="grid-column:1/-1"><div class="cn">${esc(pr.n)}</div><div class="cc small">${own ? 'GEHÖRT DIR · +' + pr.inc + ' ● / 10 S' : '● ' + fmt(pr.p) + ' · +' + pr.inc + ' ● / 10 S'}</div></div>`;
    b.addEventListener('click', () => {
      if (own) return;
      if (!afford) { tone(200, 150, 0.12, 'square', 0.05); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
      stats.coins -= pr.p; stats.owned[id] = true; saveStats(); wealthDirty = true; submitWealth(); sfx.level();
      banner('GEKAUFT!', pr.n.toUpperCase() + ' · DU BIST JETZT VERMIETER'); renderShop();
    });
    pg.appendChild(b);
  }
  $('donateRow').querySelectorAll('button').forEach(b => { b.disabled = stats.coins < +b.dataset.a; b.onclick = () => donate(+b.dataset.a); });
  $('donatedMine').textContent = stats.donated ? 'DU HAST ● ' + fmt(stats.donated) + ' GESPENDET' : '';
  fetchDonors();
}

// Testzugang nur mit ?debug in der Adresse
if (/[?&]debug\b/.test(location.search)) window.__bb = {player, ents, feats, get mp() { return mp; }, get state() { return state; }, get score() { return score; }, get lives() { return lives; }, get SURF() { return SURF; }, get W() { return W; }, hostEmit, nowS, emitFeat, mkBird, ft, fid, keys, spawnFish, spawnSpecial, spawnJelly, startNurija, stats, startWheel, get runLoot() { return runLoot; }, digState};

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
function joyShow() {
  const el = $('joy');
  el.hidden = !joy.on; if (!joy.on) return;
  el.style.transform = `translate(${joy.bx}px,${joy.by}px)`;
  $('joyKnob').style.transform = `translate(${joy.dx*joy.m*JOY_R}px,${joy.dy*joy.m*JOY_R}px)`;
}
cv.addEventListener('pointerdown', e => {
  if (!steering() || joy.on) return;
  ensureAudio();
  Object.assign(joy, {on: true, id: e.pointerId, bx: e.clientX, by: e.clientY, dx: 0, dy: 0, m: 0});
  try { cv.setPointerCapture(e.pointerId); } catch (er) {}
  joyShow();
});
window.addEventListener('pointermove', e => {
  if (!joy.on || e.pointerId !== joy.id) return;
  let dx = e.clientX - joy.bx, dy = e.clientY - joy.by; const d = Math.hypot(dx, dy);
  if (d > JOY_R*1.6) { joy.bx = e.clientX - dx/d*JOY_R*1.6; joy.by = e.clientY - dy/d*JOY_R*1.6; } // Basis wandert mit
  joy.m = d < 6 ? 0 : Math.min(1, d / JOY_R); joy.dx = d ? dx/d : 0; joy.dy = d ? dy/d : 0;
  joyShow();
});
const joyEnd = e => { if (joy.on && e.pointerId === joy.id) { joy.on = false; joy.m = 0; joyShow(); } };
window.addEventListener('pointerup', joyEnd);
window.addEventListener('pointercancel', joyEnd);
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (e.target && e.target.tagName === 'INPUT') { if (k === 'enter') mpJoin(); else if (k === 'escape') setTitle(); return; }
  secretKey(k);
  if (['arrowleft','arrowright','arrowup','arrowdown',' '].includes(k)) e.preventDefault();
  if (mp) {
    if (k === 'escape' || k === 'p') { if (mp.menu) resume(); else pause(); return; }
    if (k === 'b' && !e.repeat) { blubb(); return; }
    if ((k === 'enter' || k === ' ') && state === 'mpdead' && !$('over').hidden && $('loot').hidden && time >= overReady) { mpRespawn(); return; }
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
window.addEventListener('blur', () => { keys.clear(); joy.on = false; joy.m = 0; joyShow(); });
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
$('againBtn').addEventListener('click', () => { if (time < overReady) return; if (mp) mpRespawn(); else newGame(); });
$('soundBtn').addEventListener('click', () => { muted = !muted; soundLabel(); try { localStorage.setItem('blubberbiss-mute', muted ? '1' : '0'); } catch (e) {} });
window.addEventListener('resize', resize);

/* ---------- Start ---------- */
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (state !== 'pause' && state !== 'wheel') update(dt);
  updateWheel(dt);
  draw();
  requestAnimationFrame(frame);
}
resize(); soundLabel(); setTitle(); mpPeek();
if (document.fonts && document.fonts.load) document.fonts.load('8px Silkscreen').catch(() => {});
requestAnimationFrame(frame);
})();
