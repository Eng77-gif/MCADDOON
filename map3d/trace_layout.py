"""Trace the Summoner's Rift layout from the wiki's colour-coded minimap into layout.png.

Usage: python3 trace_layout.py [MINIMAP.png]

Without an argument the minimap ("Lanes (Minimap).png" on lol.fandom.com) is downloaded.
The minimap paints lanes pink, jungle paths orange, the river blue, the Baron/Dragon pits
white and terrain walls dark green. Each terrain vertex of build_rift.py gets the class of
the minimap colour under it; walls connected to the map border become OUTER (the forest
outside the lanes) so they can be dressed differently from jungle walls.

layout.png is a G x G greyscale image (north up, east right) whose pixel values are the
class codes below. build_rift.py reads it.
"""
import io, os, sys, urllib.request

import numpy as np
from PIL import Image

MINIMAP_URL = ("https://static.wikia.nocookie.net/lolesports_gamepedia_en/images/8/8c/"
               "Lanes_%28Minimap%29.png/revision/latest?format=original")
W = 14870.0
G = 241
# minimap pixel -> game units; offsets line the lanes and Dragon pit up with the game coordinates
SCALE = W / 512
OFFSET_X, OFFSET_Y = -350.0, -160.0

WALL, PATH, RIVER, PIT, LANE, OUTER = range(6)


def classify_pixels(rgb):
    r, g, b = (rgb[..., k].astype(int) for k in range(3))
    cls = np.full(r.shape, WALL)
    lane = ((r > 170) & (b > 140) & (g < 170)) | ((r > 130) & (g < 70) & (b < 70))
    cls[(r > 150) & (g > 95) & (g < 200) & (b < 120) & ~lane] = PATH
    cls[(b > r + 15) & (g > 95) & (b > 110)] = RIVER
    cls[(r > 140) & (g > 140) & (b > 140) & (abs(r - b) < 25)] = PIT
    cls[lane] = LANE
    return cls


def blur(a, sigma):
    rad = int(3 * sigma) + 1
    k = np.exp(-0.5 * (np.arange(-rad, rad + 1) / sigma) ** 2)
    k /= k.sum()
    a = np.pad(a, rad, mode="edge")
    a = np.apply_along_axis(lambda v: np.convolve(v, k, "valid"), 0, a)
    return np.apply_along_axis(lambda v: np.convolve(v, k, "valid"), 1, a)


def flood_from_border(mask):
    """Cells of `mask` 4-connected to the grid border."""
    out = np.zeros_like(mask)
    stack = [(i, j) for i in range(mask.shape[0]) for j in (0, mask.shape[1] - 1)]
    stack += [(i, j) for j in range(mask.shape[1]) for i in (0, mask.shape[0] - 1)]
    while stack:
        i, j = stack.pop()
        if 0 <= i < mask.shape[0] and 0 <= j < mask.shape[1] and mask[i, j] and not out[i, j]:
            out[i, j] = True
            stack += [(i + 1, j), (i - 1, j), (i, j + 1), (i, j - 1)]
    return out


def trace(rgb):
    cls = classify_pixels(rgb)
    h, w = cls.shape
    # soft-resample: blur each class mask, sample at every terrain vertex, keep the strongest
    lin = np.linspace(0, W, G)
    gx, gy = np.meshgrid(lin, lin, indexing="ij")           # vertex (i east, j north)
    px = np.clip((gx - OFFSET_X) / SCALE, 0, w - 1)
    py = np.clip(h - (gy - OFFSET_Y) / SCALE, 0, h - 1)
    x0, y0 = np.floor(px).astype(int).clip(0, w - 2), np.floor(py).astype(int).clip(0, h - 2)
    fx, fy = px - x0, py - y0
    scores = []
    for c in range(OUTER):
        m = blur((cls == c).astype(float), 1.5)
        scores.append(m[y0, x0] * (1 - fx) * (1 - fy) + m[y0, x0 + 1] * fx * (1 - fy)
                      + m[y0 + 1, x0] * (1 - fx) * fy + m[y0 + 1, x0 + 1] * fx * fy)
    grid = np.argmax(scores, axis=0)
    grid[flood_from_border(grid == WALL)] = OUTER
    return grid


def main(src=None):
    if src:
        img = Image.open(src)
    else:
        req = urllib.request.Request(MINIMAP_URL, headers={"User-Agent": "MCADDOON-layout/1.0"})
        img = Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=60).read()))
    grid = trace(np.asarray(img.convert("RGB")))
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "layout.png")
    Image.fromarray(grid.T[::-1].astype(np.uint8)).save(out)   # rows north -> south
    print(out, np.bincount(grid.ravel(), minlength=OUTER + 1))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
