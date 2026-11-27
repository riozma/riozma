#!/usr/bin/env python3
"""Spritesheet (eine Reihe gleich breiter Bilder) zuschneiden, Magenta entfernen, als Streifen speichern.

Aufruf:
  python3 -I slice_sprites.py <bild> <name> <anzahl> [--out blubberbiss/sprites] [--x0 0 --x1 W --y0 0 --y1 H] [--pad 2] [--full]

- <anzahl>: Bilder in der Reihe (das Bild wird in gleich breite Zellen geteilt).
- Magenta (#FF00FF und ähnlich) wird transparent; ist das Bild schon transparent, bleibt es so.
- Alle Bilder bekommen denselben Ausschnitt (Vereinigung), damit die Animation nicht springt.
- --full: nicht zuschneiden (z.B. wenn Koordinaten im Bild wichtig sind, wie beim Glücksrad).
- Ergebnis: <out>/<name>.png als Streifen und Eintrag {n, w, h} in <out>/sprites.json.
  Danach SPRITE_META in game.js aus sprites.json übernehmen.
"""
import argparse, json, os
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('name'); ap.add_argument('n', type=int)
ap.add_argument('--out', default='blubberbiss/sprites')
ap.add_argument('--x0', type=int, default=0); ap.add_argument('--x1', type=int)
ap.add_argument('--y0', type=int, default=0); ap.add_argument('--y1', type=int)
ap.add_argument('--pad', type=int, default=2); ap.add_argument('--full', action='store_true')
a = ap.parse_args()

im = Image.open(a.src).convert('RGBA')
px = np.asarray(im).astype(int)
r, g, b, al = px[..., 0], px[..., 1], px[..., 2], px[..., 3]
mag = np.minimum(r, b) - g
alpha = np.where((mag > 95) | (al < 100), 0, 255)
edge = (mag > 45) & (mag <= 95)               # rosa Kompressions-Ränder entfärben
rgb = px[..., :3].copy()
rgb[edge, 0] = np.minimum(r[edge], g[edge] + 60); rgb[edge, 2] = np.minimum(b[edge], g[edge] + 60)
rgba = np.dstack([rgb, alpha]).astype(np.uint8)

x1 = a.x1 or rgba.shape[1]; y1 = a.y1 or rgba.shape[0]
fw = (x1 - a.x0) / a.n
frames = [rgba[a.y0:y1, int(round(a.x0 + i*fw)):int(round(a.x0 + (i + 1)*fw))] for i in range(a.n)]
h = min(f.shape[0] for f in frames); w = min(f.shape[1] for f in frames)
frames = [f[:h, :w] for f in frames]
if not a.full:
    m = np.zeros((h, w), bool)
    for f in frames: m |= f[..., 3] > 0
    ys, xs = np.where(m)
    yy0, yy1 = max(0, ys.min() - a.pad), min(h, ys.max() + 1 + a.pad)
    xx0, xx1 = max(0, xs.min() - a.pad), min(w, xs.max() + 1 + a.pad)
    frames = [f[yy0:yy1, xx0:xx1] for f in frames]
fh, fw2 = frames[0].shape[:2]
out = np.zeros((fh, fw2*len(frames), 4), np.uint8)
for i, f in enumerate(frames): out[:, i*fw2:(i + 1)*fw2] = f
os.makedirs(a.out, exist_ok=True)
Image.fromarray(out, 'RGBA').save(os.path.join(a.out, a.name + '.png'), optimize=True)
mp = os.path.join(a.out, 'sprites.json')
meta = json.load(open(mp)) if os.path.exists(mp) else {}
meta[a.name] = {'n': len(frames), 'w': int(fw2), 'h': int(fh)}
json.dump(meta, open(mp, 'w'))
print(a.name, meta[a.name])
