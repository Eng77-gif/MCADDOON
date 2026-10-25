"""Turn the angled Summoner's Rift screenshot into a top-down ground texture.

Usage: python3 reference_texture.py [SCREENSHOT] [SIZE]

The screenshot (reference/rift_reference.webp) is a slightly tilted overhead render of the
map. Structures whose game positions are known are used as control points to fit a
homography from game coordinates to screenshot pixels; the ground plane is then resampled
into rift_texture.jpg (north up, east right, covering game units 0..14870 on both axes).
"""
import os, sys

import numpy as np
from PIL import Image

W = 14870.0
HERE = os.path.dirname(os.path.abspath(__file__))

# (screenshot pixel, game position): nexuses, outer turrets of each lane on both teams
CONTROL_POINTS = [
    ((395, 1030), (1551, 1561)), ((1408, 190), (13319, 13309)),     # blue / red nexus
    ((1320, 1075), (10504, 1029)), ((725, 150), (4366, 13841)),     # bot / top outer, blue and red
    ((445, 335), (981, 10441)), ((1595, 770), (13889, 4429)),
    ((838, 615), (5846, 6396)), ((1105, 475), (9024, 8474)),        # mid outer
]


def fit_homography(points):
    rows = []
    for (u, v), (x, y) in points:
        rows.append([x, y, 1, 0, 0, 0, -u * x, -u * y, -u])
        rows.append([0, 0, 0, x, y, 1, -v * x, -v * y, -v])
    h = np.linalg.svd(np.array(rows, float))[2][-1].reshape(3, 3)
    return h / h[2, 2]


def rectify(src, size):
    img = np.asarray(src.convert("RGB")).astype(float)
    h = fit_homography(CONTROL_POINTS)
    g = (np.arange(size) + 0.5) / size * W
    gx, gy = np.meshgrid(g, g[::-1])                 # row 0 is the north edge
    p = h @ np.stack([gx.ravel(), gy.ravel(), np.ones(gx.size)])
    u = np.clip((p[0] / p[2]).reshape(size, size), 0, img.shape[1] - 1.001)
    v = np.clip((p[1] / p[2]).reshape(size, size), 0, img.shape[0] - 1.001)
    x0, y0 = u.astype(int), v.astype(int)
    fx, fy = (u - x0)[..., None], (v - y0)[..., None]
    out = (img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x0 + 1] * fx * (1 - fy)
           + img[y0 + 1, x0] * (1 - fx) * fy + img[y0 + 1, x0 + 1] * fx * fy)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def main(src=None, size=2048):
    src = src or os.path.join(HERE, "reference", "rift_reference.webp")
    out = os.path.join(HERE, "rift_texture.jpg")
    rectify(Image.open(src), int(size)).save(out, quality=90)
    print(out)


if __name__ == "__main__":
    main(*sys.argv[1:3])
