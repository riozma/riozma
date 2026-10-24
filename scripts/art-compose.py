"""Bereitet ein Gemälde-Foto für die Kunstwebsite auf (einheitlicher Galerie-Look).

Aufruf: python -I scripts/art-compose.py <original.jpg> <cutout.png> [--rect]
  original.jpg  Foto (max. ca. 1800 px, EXIF bereits gedreht)
  cutout.png    Adobe-Freisteller (image_remove_background) des gleichen Fotos, gleiche Pixelgrösse
  --rect        Freisteller trifft nur Teile des Bildes (z.B. weisse Leinwand auf weisser Wand):
                dann wird das Rechteck um die freigestellten Pixel verwendet.
Der Dateiname des Originals (ohne .jpg) ist die Bild-ID.

Was passiert:
  1. Vier Ecken des Gemäldes finden und perspektivisch begradigen (gerade, waagrechte/senkrechte Kanten).
     Unregelmässige Formen (z.B. ZigZag) bleiben unverändert und stehen freigestellt auf der Wand.
  2. Weissabgleich und Belichtung anhand der echten Wand im Foto (Wand = neutral, gleich hell).
  3. Auf flache Galeriewand (#ECE9E4) setzen, überall gleich breiter Rand, Seitenverhältnis 4:5 .. 5:4.
Schreibt src/img/artManuel/{highRes/<id>.jpg, lowRes/<id>-min.jpg, thumb/<id>-min.jpg, micro/<id>-min.jpg}
Siehe docs/kunst-bildworkflow.md
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "img", "artManuel")
WALL = (236, 233, 228)
MARGIN = 0.085                 # Rand je Seite, Anteil der langen Gemäldeseite
ASPECT = (0.8, 1.25)           # Breite/Höhe der fertigen Bilder (4:5 .. 5:4)
SIZES = {"highRes": (2000, "{id}.jpg", 92), "lowRes": (1250, "{id}-min.jpg", 85), "thumb": (650, "{id}-min.jpg", 82),
         "micro": (110, "{id}-min.jpg", 55)}   # micro: unscharfer Platzhalter für progressives Laden
WALL_LUM = 0.915               # Zielhelligkeit der (echten) Wand, linear-sRGB-nah


def srgb_to_lin(a):
    return np.power(np.clip(a, 0, 1), 2.2)


def lin_to_srgb(a):
    return np.power(np.clip(a, 0, 1), 1 / 2.2)


def mask_of(cut):
    return np.array(cut.getchannel("A")) > 128


def corners(mask):
    """Vier Eckpunkte über die extremen Randpunkte (x+y, x-y ...)."""
    ys, xs = np.nonzero(mask)
    out = []
    for f in (xs + ys, ys - xs, -(xs + ys), xs - ys):          # NW? sortiert unten
        k = max(50, len(f) // 4000)
        idx = np.argpartition(-f, k)[:k]
        out.append((xs[idx].mean(), ys[idx].mean()))
    se, sw, nw, ne = out
    return nw, sw, se, ne


def quad_iou(mask, quad):
    im = Image.new("L", (mask.shape[1], mask.shape[0]), 0)
    ImageDraw.Draw(im).polygon([tuple(p) for p in (quad[0], quad[3], quad[2], quad[1])], fill=1)
    q = np.array(im) > 0
    return (q & mask).sum() / max(1, (q | mask).sum())


def wall_gains(orig, wallmask):
    """Gain je Kanal (Weissabgleich) und Gesamtgain (Belichtung) aus echten Wandpixeln."""
    px = np.array(orig, np.float32)[wallmask] / 255.0
    if len(px) < 3000:
        return None
    lum = px.mean(axis=1)
    px = px[lum >= np.percentile(lum, 50)]              # Schatten ausschliessen
    ref = srgb_to_lin(np.median(px, axis=0))
    cast = ref.mean() / ref
    cast = np.clip(cast, 0.8, 1.25)
    gain = WALL_LUM ** 2.2 / (ref * cast).mean()
    return cast * np.clip(gain, 0.7, 1.5)


def grade(rgb, gains):
    a = srgb_to_lin(np.array(rgb, np.float32) / 255.0)
    if gains is None:                                   # kein Wandbezug: Weisspunkt/Schwarzpunkt strecken
        for c in range(3):
            lo, hi = np.percentile(a[..., c], [0.5, 99.5])
            a[..., c] = (a[..., c] - lo * 0.5) / max(hi - lo * 0.5, 1e-3)
    else:
        a = a * gains
    hi = 0.88                                           # weiche Highlights
    over = a > hi
    a[over] = hi + (1 - hi) * np.tanh((a[over] - hi) / (1 - hi))
    return Image.fromarray((lin_to_srgb(a) * 255 + 0.5).astype(np.uint8))


def compose(orig_path, cut_path, rect=False):
    id_ = os.path.splitext(os.path.basename(orig_path))[0]
    orig = Image.open(orig_path).convert("RGB")
    cut = Image.open(cut_path).convert("RGBA")
    assert orig.size == cut.size, "Original und Freisteller müssen gleich gross sein"
    mask = mask_of(cut)
    ys, xs = np.nonzero(mask)
    bbox = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)

    wallmask = ~np.array(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(41))).astype(bool)
    if rect:
        wallmask = np.ones_like(mask)
        wallmask[max(0, bbox[1] - 60):bbox[3] + 60, max(0, bbox[0] - 60):bbox[2] + 60] = False
    gains = wall_gains(orig, wallmask)
    graded = grade(orig, gains)

    shape = "alpha"
    if rect:
        paint = graded.crop(bbox).convert("RGBA")
        shape = "rect"
    else:
        nw, sw, se, ne = quad = corners(mask)
        if quad_iou(mask, quad) > 0.955:
            cx = sum(p[0] for p in quad) / 4
            cy = sum(p[1] for p in quad) / 4
            q = [(cx + (x - cx) * 0.994, cy + (y - cy) * 0.994) for x, y in quad]   # Randsaum abschneiden
            d = lambda a, b: math.hypot(a[0] - b[0], a[1] - b[1])
            w = round((d(q[0], q[3]) + d(q[1], q[2])) / 2)
            h = round((d(q[0], q[1]) + d(q[3], q[2])) / 2)
            data = (*q[0], *q[1], *q[2], *q[3])
            paint = graded.transform((w, h), Image.QUAD, data, Image.BICUBIC).convert("RGBA")
            shape = "quad"
        else:
            paint = graded.convert("RGBA")
            paint.putalpha(cut.getchannel("A"))
            paint = paint.crop(bbox)

    pw, ph = paint.size
    m = MARGIN * max(pw, ph)
    cw, ch = pw + 2 * m, ph + 2 * m
    asp = min(max(cw / ch, ASPECT[0]), ASPECT[1])
    if asp > cw / ch:
        cw = ch * asp
    else:
        ch = cw / asp

    for d, (long_side, pat, quality) in SIZES.items():
        k = long_side / max(cw, ch)
        W, H = round(cw * k), round(ch * k)
        p = paint.resize((max(1, round(pw * k)), max(1, round(ph * k))), Image.LANCZOS)
        bg = Image.new("RGBA", (W, H), WALL + (255,))
        x, y = (W - p.width) // 2, (H - p.height) // 2
        L = max(W, H)
        sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        sh.paste((60, 50, 40, 80), (x + round(L * 0.004), y + round(L * 0.010)), p.getchannel("A"))
        bg.alpha_composite(sh.filter(ImageFilter.GaussianBlur(L * 0.010)))
        bg.alpha_composite(p, (x, y))
        os.makedirs(os.path.join(ROOT, d), exist_ok=True)
        bg.convert("RGB").save(os.path.join(ROOT, d, pat.format(id=id_)), quality=quality, optimize=True, progressive=True)
    print(f"ok {id_} [{shape}{', WB' if gains is not None else ', kein Wandbezug'}]")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    compose(args[0], args[1], rect="--rect" in sys.argv)
