"""Setzt einen von Adobe freigestellten Gemälde-PNG (RGBA) auf die einheitliche Galeriewand.

Aufruf: python -I scripts/art-compose.py <cutout.png> [<cutout2.png> ...]
        python -I scripts/art-compose.py --rect <original.jpg> <cutout.png>   (weisse Leinwand auf weisser Wand:
        der Freisteller trifft nur die Striche, daher wird das Rechteck aus dem Original genommen)
Der Dateiname (ohne .png) ist die Bild-ID, z.B. PXL_20241205_152322236.png
Schreibt src/img/artManuel/{highRes/<id>.jpg, lowRes/<id>-min.jpg, thumb/<id>-min.jpg}
Siehe docs/kunst-bildworkflow.md
"""
import os, sys
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "img", "artManuel")
CANVAS = (1600, 2000)          # 4:5
BOX = (1180, 1480)             # max. Fläche des Gemäldes
WALL = (238, 235, 230)         # warmes Off-White
SIZES = {"highRes": ((1600, 2000), "{id}.jpg", 92), "lowRes": ((1000, 1250), "{id}-min.jpg", 85), "thumb": ((520, 650), "{id}-min.jpg", 82)}


def wall():
    w, h = CANVAS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.sqrt(((x - w / 2) / (w * 0.75)) ** 2 + ((y - h * 0.46) / (h * 0.75)) ** 2)
    k = 1.0 + 0.025 * (0.35 - np.clip(d, 0, 1))       # sehr dezenter Verlauf
    arr = np.clip(np.array(WALL, np.float32)[None, None, :] * k[..., None], 0, 255)
    return Image.fromarray(arr.astype(np.uint8)).convert("RGBA")


def tone(im):
    """Sanfte Tonwertkorrektur nur auf den Gemälde-Pixeln."""
    a = np.array(im, np.float32)
    m = a[..., 3] > 200
    for c in range(3):
        lo, hi = np.percentile(a[..., c][m], [0.5, 99.5])
        lo, hi = min(lo, 25), max(hi, 235)              # nie zu hart strecken
        a[..., c] = np.clip((a[..., c] - lo) / (hi - lo) * 255, 0, 255)
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def compose(cut_path, rect_src=None):
    id_ = os.path.splitext(os.path.basename(cut_path))[0]
    im = Image.open(cut_path).convert("RGBA")
    if rect_src:
        bb = im.getchannel("A").point(lambda v: 255 if v > 128 else 0).getbbox()
        im = Image.open(rect_src).convert("RGBA")
        im.putalpha(Image.new("L", im.size, 0))
        im.paste((0, 0, 0, 255), bb, Image.new("L", (bb[2] - bb[0], bb[3] - bb[1]), 255))
        im = Image.open(rect_src).convert("RGBA").crop(bb)
    im = im.crop(im.getchannel("A").point(lambda v: 255 if v > 128 else 0).getbbox())
    im = tone(im)
    s = min(BOX[0] / im.width, BOX[1] / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    bg = wall()
    x, y = (CANVAS[0] - im.width) // 2, round((CANVAS[1] - im.height) * 0.47)
    sh = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    sh.paste((60, 50, 40, 90), (x + 10, y + 22), im.getchannel("A"))
    bg.alpha_composite(sh.filter(ImageFilter.GaussianBlur(22)))
    bg.alpha_composite(im, (x, y))
    out = bg.convert("RGB")
    for d, (size, pat, q) in SIZES.items():
        os.makedirs(os.path.join(ROOT, d), exist_ok=True)
        out.resize(size, Image.LANCZOS).save(os.path.join(ROOT, d, pat.format(id=id_)), quality=q, optimize=True, progressive=True)
    print("ok", id_)


if __name__ == "__main__":
    a = sys.argv[1:]
    if a and a[0] == "--rect":
        compose(a[2], a[1])
    else:
        for p in a:
            compose(p)
