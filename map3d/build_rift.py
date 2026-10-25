"""Generate a stylised low-poly 3D model of Summoner's Rift for the manager game.

Usage: python3 build_rift.py [OUT_DIR]

Writes:
  summoners_rift.glb   smooth terrain, water, trees/brush/rocks, plus one named node per
                       structure (Turret_Blue_Top_Outer, Inhibitor_Red_Mid, Nexus_Blue, ...)
                       so the game can hide a structure when it is destroyed. No monsters:
                       jungle camp and objective positions are in map_data.json.
  map_data.json        lane waypoints, structures, jungle camps and objectives in both
                       Leaguepedia/game coordinates and model coordinates.

Terrain layout (walls, jungle paths, lanes, river, pits) comes from layout.png, traced from
the wiki's colour-coded minimap by trace_layout.py. Game units run 0..14870 on each axis,
blue base at the bottom-left, red base at the top-right; structures on the red side are the
blue positions mirrored through the map centre.
"""
import json, math, os, sys

import numpy as np

from geometry import (Model, align_y, frustum, icosphere, octahedron, rot_y, scale, srgb_to_linear,
                      translate, write_glb)

W = 14870.0          # map size in game units
S = 192.0            # map size in model units (x and z span -S/2..S/2, y is up, north is -z)
G = 321              # terrain vertices per side (must match trace_layout.py)
K = (G - 1) / 240    # blur radii and noise sizes below are written for a 241-vertex grid
SEED = 7
CENTER = (W / 2, W / 2)

# --- layout (blue side, game units) ------------------------------------------------

def mirror(p):
    return (W - p[0], W - p[1])

LANES = {
    "Top": [(1100, 2500), (1100, 12500), (2350, 13750), (12370, 13770)],
    "Mid": [(2500, 2500), (12370, 12370)],
    "Bot": [(2500, 1100), (12500, 1100), (13750, 2350), (13770, 12370)],
}

RIVER = [(1500, 13400), (3000, 12000), (5000, 10450), (7435, 7435),
         (9870, 4420), (11870, 2870), (13370, 1470)]

BLUE_CAMPS = {
    "Blue_Sentinel": (3800, 7900), "Gromp": (2100, 8400), "Murk_Wolves": (3800, 6500),
    "Raptors": (7000, 5400), "Red_Brambleback": (7800, 4000), "Krugs": (8400, 2700),
}

OBJECTIVES = {
    "Baron_Pit": (4990, 10480), "Dragon_Pit": (9880, 4390),     # Dragon traced from the minimap, Baron mirrored
    "Scuttle_Top": (4400, 9800), "Scuttle_Bot": (10470, 5070),
}
PIT_RADIUS = 700

# Brushes picked off the top-down reference texture (1024 px = 14870 units, row 0 = north), as
# (x, y, radius) in texture pixels. One list per half of the map; each is also mirrored through the
# centre so both teams get the same brushes.
BRUSH_PX_DRAGON_HALF = [(625, 880, 14), (537, 970, 12), (570, 588, 12), (590, 610, 12), (590, 703, 12),
                        (700, 610, 12), (704, 630, 12), (552, 782, 14), (790, 766, 12), (880, 893, 15),
                        (852, 935, 15), (925, 855, 15), (715, 815, 12), (382, 790, 12), (468, 815, 14)]
BRUSH_PX_BARON_HALF = [(118, 152, 18), (172, 115, 16), (82, 190, 14), (237, 267, 12), (305, 232, 14),
                       (210, 412, 12), (415, 450, 12), (445, 475, 12), (330, 543, 12), (327, 440, 12)]


def _brushes():
    px = BRUSH_PX_DRAGON_HALF + BRUSH_PX_BARON_HALF
    px = px + [(1024 - x, 1024 - y, r) for x, y, r in px]
    out = []
    for x, y, r in px:                          # drop near-duplicates left by mirroring
        if all(math.dist((x, y), (ox, oy)) > 14 for ox, oy, _ in out):
            out.append((x, y, r))
    return [((x + 0.5) / 1024 * W, (1023.5 - y) / 1024 * W, r / 1024 * W * 1.4) for x, y, r in out]


BRUSHES = _brushes()                            # (game x, game y, radius)
TEXTURE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rift_texture.jpg")

BASE_CENTER = (0, 0)
BASE_SIZE = 5000     # bases are rounded squares this wide, filling the corner of the map
BASE_ROUND = 1500    # radius of the rounded corner that faces the map centre
FOUNTAIN = (900, 900)

BLUE_TURRETS = {
    "Top_Outer": (981, 10441), "Top_Inner": (1512, 6699), "Top_Inhibitor": (1169, 4287),
    "Mid_Outer": (5846, 6396), "Mid_Inner": (5048, 4812), "Mid_Inhibitor": (3651, 3696),
    "Bot_Outer": (10504, 1029), "Bot_Inner": (6919, 1483), "Bot_Inhibitor": (4281, 1253),
    "Nexus_Top": (1748, 2270), "Nexus_Bot": (2177, 1807),
}
BLUE_INHIBITORS = {"Top": (1171, 3571), "Mid": (3203, 3208), "Bot": (3452, 1236)}
BLUE_NEXUS = (1551, 1561)

# --- look --------------------------------------------------------------------------

WALL, GROUND, LANE, RIVER_C, PIT, BRUSH, BASE_B, BASE_R, FOUNT_B, FOUNT_R, OUTER = range(11)
HEIGHT = {WALL: 1.9, GROUND: 0.0, LANE: 0.0, RIVER_C: -0.9, PIT: -0.3, BRUSH: 0.0, BASE_B: 0.6, BASE_R: 0.6,
          FOUNT_B: 0.9, FOUNT_R: 0.9, OUTER: 2.2}
WATER_LEVEL = -0.45

TEAM = {"Blue": {"base": BASE_B, "fountain": FOUNT_B, "glow": "Glow_Blue", "trim": (52, 84, 150),
                 "tile": (120, 126, 132), "fountain_rgb": (110, 200, 235)},
        "Red": {"base": BASE_R, "fountain": FOUNT_R, "glow": "Glow_Red", "trim": (150, 52, 48),
                "tile": (132, 122, 118), "fountain_rgb": (236, 130, 104)}}
STONE, STONE_DARK, GOLD = (162, 160, 166), (112, 110, 118), (214, 180, 96)
CANOPY = [(38, 84, 44), (50, 98, 44), (32, 74, 50), (60, 104, 40), (44, 90, 58)]
TRUNK = (96, 70, 46)
GLOWS = {"Glow_Blue": (80, 180, 255), "Glow_Red": (255, 86, 70), "Glow_Purple": (190, 110, 255)}
MATERIALS = {
    "Ground": {"pbrMetallicRoughness": {"baseColorTexture": {"index": 0}, "metallicFactor": 0, "roughnessFactor": 1},
               "extensions": {"KHR_materials_unlit": {}}},
    "Base": {"pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, 1], "metallicFactor": 0, "roughnessFactor": 0.9}},
    "Water": {"pbrMetallicRoughness": {"baseColorFactor": [0.03, 0.12, 0.22, 0.78], "metallicFactor": 0,
                                       "roughnessFactor": 0.15}, "alphaMode": "BLEND"},
    **{name: {"pbrMetallicRoughness": {"baseColorFactor": srgb_to_linear(rgb).tolist() + [1], "metallicFactor": 0,
                                       "roughnessFactor": 0.4},
              "emissiveFactor": (srgb_to_linear(rgb) * 0.8).tolist()} for name, rgb in GLOWS.items()},
}

# --- coordinates -------------------------------------------------------------------

lin = np.linspace(0, W, G)
X, Y = np.meshgrid(lin, lin, indexing="ij")   # game coords of terrain vertex (i east, j north)
CELL = W / (G - 1)                             # game units between terrain vertices


def to_model(p):
    return p[0] / W * S - S / 2, S / 2 - p[1] / W * S


def dist_to(p):
    return np.hypot(X - p[0], Y - p[1])


def disc(p, r):
    return dist_to(p) <= r


def smooth_noise(scale_, seed):
    """Value noise in [0, 1] with features roughly `scale_` (241-grid) vertices wide."""
    scale_ = max(1, int(round(scale_ * K)))
    rng = np.random.default_rng(seed)
    k = G // scale_ + 3
    g = rng.random((k, k))
    t = np.arange(G) / scale_
    i0 = t.astype(int)
    f = t - i0
    f = f * f * (3 - 2 * f)
    a = g[i0][:, i0] * (1 - f)[:, None] + g[i0 + 1][:, i0] * f[:, None]
    b = g[i0][:, i0 + 1] * (1 - f)[:, None] + g[i0 + 1][:, i0 + 1] * f[:, None]
    return a * (1 - f)[None, :] + b * f[None, :]


def blur(a, sigma):
    sigma *= K
    r = int(3 * sigma) + 1
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    a = np.pad(a, [(r, r), (r, r)] + [(0, 0)] * (a.ndim - 2), mode="edge")
    a = np.apply_along_axis(lambda v: np.convolve(v, k, "valid"), 0, a)
    return np.apply_along_axis(lambda v: np.convolve(v, k, "valid"), 1, a)


def lerp(c1, c2, t):
    t = np.asarray(t, float)[..., None]
    return np.array(c1, float) * (1 - t) + np.array(c2, float) * t


# --- terrain -----------------------------------------------------------------------

def load_layout():
    """Classes traced from the minimap by trace_layout.py, indexed [i east, j north]."""
    from PIL import Image
    raw = np.asarray(Image.open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "layout.png")))
    raw = raw[::-1].T
    assert raw.shape == (G, G), "layout.png does not match G; rerun trace_layout.py"
    return raw


def base_mask(team):
    """Rounded square in the team's corner; the rounded corner points at the map centre."""
    u, v = (X, Y) if team == "Blue" else (W - X, W - Y)
    c = BASE_SIZE - BASE_ROUND
    inside = (u <= BASE_SIZE) & (v <= BASE_SIZE)
    return inside & ~((u > c) & (v > c) & (np.hypot(u - c, v - c) > BASE_ROUND))


def classify():
    traced = load_layout()
    cls = np.select([traced == 1, traced == 2, traced == 3, traced == 4, traced == 5],
                    [GROUND, RIVER_C, PIT, LANE, OUTER], WALL)
    if not os.path.exists(TEXTURE):
        # without the reference texture, make the layout point-symmetric like the real Rift: keep
        # the half east of the mid-lane diagonal (Dragon side) and rotate it onto the other half.
        # With the texture the traced layout is kept as is so the heights line up with the picture.
        i, j = np.meshgrid(np.arange(G), np.arange(G), indexing="ij")
        cls = np.where(i >= j, cls, cls[::-1, ::-1])
    # pits only where the Baron and Dragon pits are; stray white pixels elsewhere become river
    near_pit = disc(OBJECTIVES["Baron_Pit"], PIT_RADIUS * 1.6) | disc(OBJECTIVES["Dragon_Pit"], PIT_RADIUS * 1.6)
    cls[(cls == PIT) & ~near_pit] = RIVER_C
    river_soft = blur((cls == RIVER_C).astype(float), 4)
    cls[(cls == LANE) & (river_soft > 0.18)] = RIVER_C           # the river runs under mid lane
    for bx, by, br in BRUSHES:
        cls[disc((bx, by), br) & np.isin(cls, (GROUND, LANE, WALL))] = BRUSH
    rim = (X < 420) | (X > W - 420) | (Y < 420) | (Y > W - 420)    # forested cliff all round the island
    for team in ("Blue", "Red"):
        cls[base_mask(team)] = TEAM[team]["base"]
    cls[disc(FOUNTAIN, 520)] = FOUNT_B
    cls[disc(mirror(FOUNTAIN), 520)] = FOUNT_R
    cls[rim] = OUTER
    return cls


def build_terrain(rng):
    cls = classify()
    n1, n2, n3 = smooth_noise(14, SEED + 10), smooth_noise(5, SEED + 11), smooth_noise(30, SEED + 12)
    wall = (cls == WALL).astype(float)
    outer = (cls == OUTER).astype(float)
    river = (cls == RIVER_C).astype(float)

    # heights: low mossy cliffs in the jungle, rising forested ground outside the lanes
    h = np.vectorize(HEIGHT.get)(cls).astype(float)
    h[cls == WALL] += n3[cls == WALL] * 0.6
    depth_out = blur(outer, 3.0)
    h[cls == OUTER] += depth_out[cls == OUTER] * 2.5 + n1[cls == OUTER] * 1.5
    h[cls == RIVER_C] -= blur(river, 2.0)[cls == RIVER_C] * 0.6   # deeper in the middle of the river
    h = blur(h, 0.9)
    h += (n2 - 0.5) * np.where((cls == WALL) | (cls == OUTER), 0.5, 0.06)

    col = np.zeros((G, G, 3))
    m = cls == WALL
    col[m] = lerp((62, 102, 48), (44, 80, 40), (n2[m] > 0.55).astype(float) * 0.8)
    m = cls == OUTER
    col[m] = lerp((46, 72, 40), (60, 86, 44), n1[m])
    # jungle floor: grass near the walls, worn dirt along the middle of each path
    near_wall = blur(wall + outer, 2.0)
    m = (cls == GROUND) | (cls == BRUSH)
    col[m] = lerp((124, 98, 62), (76, 110, 50), np.clip(near_wall[m] * 3.2 + (n2[m] - 0.5) * 0.6, 0, 1))
    m = cls == BRUSH
    col[m] = col[m] * 0.6 + np.array((60, 112, 52)) * 0.4
    lane_soft = blur((cls == LANE).astype(float), 2.0)
    m = cls == LANE
    col[m] = lerp((84, 106, 52), (140, 112, 74), np.clip((lane_soft[m] - 0.45) * 3.5, 0, 1))
    col[m] = col[m] + (n2[m, None] - 0.5) * 18
    m = cls == RIVER_C
    col[m] = lerp((78, 100, 84), (30, 58, 74), np.clip(blur(river, 1.5)[m] * 1.3, 0, 1))
    for name, floor in (("Baron_Pit", (80, 64, 108)), ("Dragon_Pit", (66, 98, 96))):
        d = dist_to(OBJECTIVES[name])
        m = (cls == PIT) & (d <= PIT_RADIUS * 1.6)
        ring = (np.sin(d[m] / CELL * 1.4) > 0.55).astype(float)
        col[m] = lerp(floor, np.array(floor) * 1.25, ring)
    for team in ("Blue", "Red"):
        t = TEAM[team]
        m = cls == t["base"]
        u, v = (X, Y) if team == "Blue" else (W - X, W - Y)
        # stone plaza: square flagstones with moss in the joints, a paler causeway along the
        # diagonal from the fountain to mid lane, and a ring of slabs around the nexus
        joint = (np.abs((u / 440) % 1 - 0.5) > 0.42) | (np.abs((v / 440) % 1 - 0.5) > 0.42)
        checker = ((u // 440 + v // 440) % 2).astype(float)
        tiles = lerp(t["tile"], np.array(t["tile"]) * 0.88, checker * 0.6 + (n2 > 0.6) * 0.4)
        causeway = np.abs(u - v) < 700
        tiles[causeway] = tiles[causeway] * 1.12
        nexus = np.hypot(u - BLUE_NEXUS[0], v - BLUE_NEXUS[1])
        ring = (nexus > 560) & (nexus < 700)
        tiles[ring] = np.array(t["trim"]) * 0.6 + tiles[ring] * 0.4
        col[m] = np.where((joint & ~ring)[m, None], np.array((90, 104, 74)), tiles[m])
        col[cls == t["fountain"]] = t["fountain_rgb"]
    col = blur(col, 0.5)

    gx, gy = np.gradient(h, S / (G - 1))           # cliffs: steep slopes read as rock
    slope = np.clip((np.hypot(gx, gy) - 0.5) / 1.0, 0, 1)
    rock_col = lerp((92, 96, 88), (112, 110, 100), n1).reshape(-1, 3)
    col = (col.reshape(-1, 3) * (1 - slope.reshape(-1, 1)) + rock_col * slope.reshape(-1, 1)).reshape(G, G, 3)
    col += rng.integers(-5, 6, size=(G, G, 1))

    ii, jj = np.meshgrid(np.arange(G), np.arange(G), indexing="ij")
    mx = lin / W * S - S / 2
    mz = S / 2 - lin / W * S
    pos = np.stack([np.repeat(mx, G), h.reshape(-1), np.tile(mz, G)], -1)
    a = (ii[:-1, :-1] * G + jj[:-1, :-1]).reshape(-1)
    idx = np.concatenate([np.stack([a, a + G, a + 1], -1), np.stack([a + 1, a + G, a + G + 1], -1)])
    terrain = Model(rng)
    if os.path.exists(TEXTURE):     # paint the ground with the top-down reference picture
        uv = np.stack([np.repeat(lin / W, G), np.tile(1 - lin / W, G)], -1)
        terrain.add((pos, idx), (255, 255, 255), material="Ground", uv=uv)
    else:
        terrain.add((pos, idx), col.reshape(-1, 3))

    # skirt: cliffs under the floating island
    cliffs = Model(rng)
    grid = pos.reshape(G, G, 3)
    for line in (grid[:, 0], grid[:, -1][::-1], grid[0][::-1], grid[-1]):
        low = line.copy()
        low[:, 1] = -6.0 + rng.uniform(-1.5, 1.5, len(line))
        k = len(line)
        tri = [(t, k + t, t + 1) for t in range(k - 1)] + [(t + 1, k + t, k + t + 1) for t in range(k - 1)]
        cliffs.add((np.concatenate([line, low]), tri), (84, 82, 74), smooth=False, jitter=8)
    return cls, h, terrain, cliffs


def sampler(h):
    def height_at(p):
        fx, fy = p[0] / W * (G - 1), p[1] / W * (G - 1)
        i, j = min(int(fx), G - 2), min(int(fy), G - 2)
        u, v = fx - i, fy - j
        return float(h[i, j] * (1 - u) * (1 - v) + h[i + 1, j] * u * (1 - v) + h[i, j + 1] * (1 - u) * v
                     + h[i + 1, j + 1] * u * v)
    return height_at


def class_at(cls, p):
    return cls[min(G - 1, int(round(p[0] / W * (G - 1)))), min(G - 1, int(round(p[1] / W * (G - 1))))]


def scatter(spacing, rng):
    """Jittered grid of game-coordinate points `spacing` model units apart."""
    step = spacing / S * W
    g = np.arange(step / 2, W, step)
    pts = np.stack(np.meshgrid(g, g, indexing="ij"), -1).reshape(-1, 2)
    return np.clip(pts + rng.uniform(-0.45, 0.45, pts.shape) * step, 0, W)


def build_water():
    m = Model()
    s = S / 2 - 1
    pos = np.array([(-s, WATER_LEVEL, -s), (s, WATER_LEVEL, -s), (s, WATER_LEVEL, s), (-s, WATER_LEVEL, s)])
    m.add((pos, [(0, 2, 1), (0, 3, 2)]), (255, 255, 255), material="Water", normals=(0, 1, 0))
    return m


def tree(m, x, y, z, rng, pine_chance=0.55):
    s = rng.uniform(0.8, 1.35)
    canopy = np.array(CANOPY[rng.integers(len(CANOPY))]) + rng.integers(-8, 9)
    m.add(frustum(0.2 * s, 0.14 * s, 0.9 * s, 4, caps=False), TRUNK, smooth=False, m=translate(x, y - 0.2, z))
    if rng.random() < pine_chance:      # pine: stacked cones
        for k, (r, hgt, y0) in enumerate(((1.0, 1.8, 0.6), (0.75, 1.5, 1.5), (0.5, 1.2, 2.3))):
            m.add(frustum(r * s, 0, hgt * s, 7, caps=False), canopy * (1 + 0.06 * k), smooth=False, jitter=5,
                  m=translate(x, y + y0 * s, z) @ rot_y(rng.uniform(0, 6.3)))
    else:                               # broadleaf: two lumpy low-poly balls
        for dx, dy, dz, r in ((0, 1.6, 0, 1.2), (rng.uniform(-0.5, 0.5), 2.3, rng.uniform(-0.5, 0.5), 0.8)):
            p, f = icosphere(0)
            p = p * (1 + rng.uniform(-0.15, 0.15, (len(p), 1)))
            m.add((p, f), canopy * (1.08 if dy > 2 else 1), smooth=False, jitter=6,
                  m=translate(x + dx * s, y + dy * s, z + dz * s) @ rot_y(rng.uniform(0, 6.3)) @ scale(r * s, 0.9 * r * s, r * s))


def bush(m, x, y, z, rng):
    for _ in range(rng.integers(2, 4)):
        p, f = icosphere(0)
        p = p * (1 + rng.uniform(-0.2, 0.2, (len(p), 1)))
        r = rng.uniform(0.45, 0.8)
        m.add((p, f), np.array((58, 104, 48)) + rng.integers(-12, 13), smooth=False, jitter=6,
              m=translate(x + rng.uniform(-0.5, 0.5), y + r * 0.4, z + rng.uniform(-0.5, 0.5)) @ scale(r, r * 0.75, r))


def rock(m, x, y, z, size, rng, rgb=(112, 116, 106)):
    p, f = icosphere(0)
    p = p * (1 + rng.uniform(-0.25, 0.25, (len(p), 1)))
    m.add((p, f), np.array(rgb) + rng.integers(-10, 11), smooth=False, jitter=8,
          m=translate(x, y, z) @ rot_y(rng.uniform(0, 6.3)) @ scale(size, size * 0.7, size))


def stone_walls(cls, h, rng):
    """Stone ramparts with pillars: along the outer edge of the lanes and around both bases."""
    m = Model(rng)
    walk = np.isin(cls, (LANE, GROUND, BRUSH, RIVER_C))
    base = np.isin(cls, (BASE_B, BASE_R))
    blocked = np.isin(cls, (OUTER, WALL))
    pad = lambda a: np.pad(a, 1, constant_values=False)
    def touches(a):
        p = pad(a)
        return p[2:, 1:-1] | p[:-2, 1:-1] | p[1:-1, 2:] | p[1:-1, :-2]
    edge = ((cls == OUTER) & touches(walk | base)) | (base & touches(blocked) & ~touches(walk))
    soft = blur(blocked.astype(float), 1.5)
    gx, gy = np.gradient(soft)
    k = 0
    for i, j in zip(*np.nonzero(edge)):
        if (i + j) % 2:                        # every other cell keeps the wall from doubling up
            continue
        p = (i * CELL, j * CELL)
        x, z = to_model(p)
        y = float(h[i, j])
        ang = math.atan2(gy[i, j], gx[i, j])   # wall runs across the slope of the blocked area
        k += 1
        rot = rot_y(-ang)
        tone = np.array((118, 118, 112)) + rng.integers(-10, 11)
        m.add(frustum(0.85, 0.8, 1.5, 4), tone, smooth=False, jitter=5,
              m=translate(x, y - 0.3, z) @ rot @ rot_y(np.pi / 4) @ scale(1.0, 1.0, 0.6))
        if k % 6 == 0:                         # pillar with a cap
            m.add(frustum(0.55, 0.5, 2.6, 4), (138, 136, 128), smooth=False, jitter=4,
                  m=translate(x, y - 0.3, z) @ rot_y(np.pi / 4))
            m.add(frustum(0.7, 0.3, 0.5, 4), (150, 146, 136), smooth=False, m=translate(x, y + 2.3, z) @ rot_y(np.pi / 4))
    return m


def build_props(cls, h, rng):
    height_at = sampler(h)
    trees, brush, rocks, small = Model(rng), Model(rng), Model(rng), Model(rng)
    for p in scatter(1.7, rng):
        c = class_at(cls, p)
        hh = height_at(p)
        x, z = to_model(p)
        if c == OUTER and hh > 1.2 and rng.random() < 0.9:          # dense pine forest outside the lanes
            tree(trees, x, hh, z, rng, pine_chance=0.85)
        elif c == WALL and hh > 1.3:                                # mossy jungle walls: bushes, few trees
            r = rng.random()
            if r < 0.08:
                tree(trees, x, hh, z, rng, pine_chance=0.5)
            elif r < 0.2:
                bush(trees, x, hh, z, rng)
            elif r < 0.26:
                rock(rocks, x, hh, z, rng.uniform(0.5, 1.0), rng)
    for p in scatter(0.5, rng):
        if class_at(cls, p) == BRUSH:
            x, z = to_model(p)
            y = height_at(p)
            for _ in range(3):   # three grass blades per tuft
                a = rng.uniform(0, 6.3)
                lean = np.array([np.cos(a), 0, np.sin(a)]) * 0.25
                tip = np.array([x, y + rng.uniform(0.55, 0.95), z]) + lean
                side = np.array([-np.sin(a), 0, np.cos(a)]) * 0.12
                base = np.array([x, y - 0.05, z])
                brush.add(([base - side, base + side, tip], [(0, 1, 2)]),
                          np.array((52, 104, 44)) + rng.integers(-12, 13), normals=(0, 1, 0), double=True)
    for p in scatter(2.6, rng):
        c = class_at(cls, p)
        hh = height_at(p)
        x, z = to_model(p)
        if c == WALL and 0.3 < hh < 1.3 and rng.random() < 0.6:     # boulders at the foot of the cliffs
            rock(rocks, x, hh, z, rng.uniform(0.5, 1.2), rng)
        elif c == RIVER_C and rng.random() < 0.1:
            rock(rocks, x, hh + 0.2, z, rng.uniform(0.35, 0.7), rng, (104, 112, 110))
        elif c == GROUND and rng.random() < 0.2:                    # flowers
            col = [(240, 214, 80), (232, 130, 170), (244, 244, 236), (150, 130, 230)][rng.integers(4)]
            for _ in range(rng.integers(2, 5)):
                ox, oz = rng.uniform(-0.5, 0.5, 2)
                small.add(octahedron(), col, smooth=False,
                          m=translate(x + ox, hh + 0.15, z + oz) @ scale(0.12, 0.12, 0.12))
    lane_soft = blur((cls == LANE).astype(float), 1.5)
    river_soft = blur((cls == RIVER_C).astype(float), 1.5)
    soft_at = lambda a, p: a[min(G - 1, int(round(p[0] / W * (G - 1)))), min(G - 1, int(round(p[1] / W * (G - 1))))]
    for p in scatter(1.6, rng):                                     # loose stones along the lane edges
        if class_at(cls, p) == LANE and 0.3 < soft_at(lane_soft, p) < 0.65 and rng.random() < 0.35:
            x, z = to_model(p)
            rock(rocks, x, height_at(p), z, rng.uniform(0.18, 0.4), rng, (128, 120, 104))
    for p in scatter(0.55, rng):                                    # reeds on the river banks
        c = class_at(cls, p)
        if c in (GROUND, WALL, BRUSH) and 0.12 < soft_at(river_soft, p) < 0.5 and rng.random() < 0.45:
            x, z = to_model(p)
            y = height_at(p)
            for _ in range(4):
                a = rng.uniform(0, 6.3)
                tip = np.array([x + 0.15 * np.cos(a), y + rng.uniform(0.9, 1.6), z + 0.15 * np.sin(a)])
                side = np.array([-np.sin(a), 0, np.cos(a)]) * 0.06
                base = np.array([x, y - 0.05, z])
                brush.add(([base - side, base + side, tip], [(0, 1, 2)]),
                          np.array((96, 124, 60)) + rng.integers(-14, 15), normals=(0, 1, 0), double=True)
    crystals = Model(rng)
    for p in scatter(1.2, rng):                                     # purple crystals around the Baron pit
        d = math.dist(p, OBJECTIVES["Baron_Pit"])
        if PIT_RADIUS * 0.9 < d < PIT_RADIUS * 2.0 and class_at(cls, p) == WALL and rng.random() < 0.14:
            x, z = to_model(p)
            hh = height_at(p)
            for _ in range(rng.integers(1, 4)):
                tilt = rng.normal(0, 0.35, 2)
                crystals.add(octahedron(), (255, 255, 255), material="Glow_Purple", smooth=False,
                             m=translate(x + rng.uniform(-0.4, 0.4), hh + 0.3, z + rng.uniform(-0.4, 0.4))
                             @ rot_y(rng.uniform(0, 6.3)) @ scale(0.2, rng.uniform(0.5, 1.0), 0.2))
    return [("Trees", trees), ("Brush", brush), ("Rocks", rocks), ("Flowers", small),
            ("Walls", stone_walls(cls, h, rng)), ("Crystals", crystals)]


# --- structures --------------------------------------------------------------------

def strut(m, a, b, r0, r1, rgb, material="Base", seg=5):
    """Tapered bar from point a to point b."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    m.add(frustum(r0, r1, float(np.linalg.norm(b - a)), seg), rgb, material=material, smooth=False, jitter=4,
          m=translate(*a) @ align_y(b - a))


def claw(m, pts, r0, r1, rgb):
    """Curved prong through `pts`, built from tapered bars."""
    radii = np.linspace(r0, r1, len(pts))
    for k in range(len(pts) - 1):
        strut(m, pts[k], pts[k + 1], radii[k], radii[k + 1], rgb)


def ring_pts(r, y, n, phase=0.0):
    return [(r * np.cos(phase + 2 * np.pi * k / n), y, r * np.sin(phase + 2 * np.pi * k / n)) for k in range(n)]


def turret(team, rng):
    """Order (blue) turrets are pale stone with gold claws; Chaos (red) ones are dark iron with spikes.
    Both hold a glowing orb in a cage of four claws on top of a tapered tower."""
    t = TEAM[team]
    m = Model(rng)
    if team == "Blue":
        plinth, shaft, metal, accent = (104, 108, 116), (196, 192, 182), GOLD, t["trim"]
    else:
        plinth, shaft, metal, accent = (64, 58, 62), (98, 88, 92), (74, 64, 68), (120, 40, 36)
    m.add(frustum(2.0, 1.8, 0.35, 8), plinth, smooth=False, jitter=4, m=rot_y(np.pi / 8))
    m.add(frustum(1.65, 1.45, 0.4, 8), shaft, smooth=False, jitter=4, m=translate(0, 0.35, 0) @ rot_y(np.pi / 8))
    m.add(frustum(1.05, 0.78, 4.3, 8), shaft, smooth=False, jitter=4, m=translate(0, 0.75, 0) @ rot_y(np.pi / 8))
    for x, y, z in ring_pts(1.0, 0.75, 4, np.pi / 4):               # buttresses up the shaft
        strut(m, (x, y, z), (x * 0.72, 4.6, z * 0.72), 0.26, 0.12, metal if team == "Blue" else plinth, seg=4)
    for y in (2.0, 3.6):
        m.add(frustum(1.0 - 0.06 * y, 0.98 - 0.06 * y, 0.22, 8), accent, smooth=False, m=translate(0, y, 0))
    if team == "Red":                                                # glowing slits between the buttresses
        for x, _, z in ring_pts(0.93, 0, 4):
            m.add(frustum(0.09, 0.06, 2.4, 4), (255, 255, 255), material=t["glow"], smooth=False,
                  m=translate(x * 0.98, 1.4, z * 0.98))
        for x, y, z in ring_pts(1.7, 0.4, 8, np.pi / 8):             # spikes round the plinth
            strut(m, (x * 0.85, y, z * 0.85), (x * 1.25, y + 0.9, z * 1.25), 0.18, 0.0, metal, seg=4)
    m.add(frustum(0.8, 1.3, 0.55, 8), metal, smooth=False, m=translate(0, 5.0, 0) @ rot_y(np.pi / 8))   # collar
    m.add(frustum(1.3, 1.15, 0.45, 8), accent, smooth=False, m=translate(0, 5.55, 0) @ rot_y(np.pi / 8))
    for k, (x, y, z) in enumerate(ring_pts(1.0, 6.0, 4, np.pi / 4)):  # claws cradling the orb
        d = np.array((x, 0, z))
        flare = 1.45 if team == "Blue" else 1.7
        claw(m, [(x, y, z), tuple(d * 1.3 + (0, 6.9, 0)), tuple(d * flare * 0.8 + (0, 7.8, 0)),
                 tuple(d * 0.55 + (0, 8.4, 0))], 0.24, 0.05, metal)
        if team == "Red":
            strut(m, tuple(d * 1.3 + (0, 6.9, 0)), tuple(d * 2.0 + (0, 7.3, 0)), 0.12, 0.0, metal, seg=4)
    m.add(icosphere(1), (255, 255, 255), material=t["glow"], smooth=False,
          m=translate(0, 7.2, 0) @ scale(0.62, 0.62, 0.62))
    m.add(octahedron(), (255, 255, 255), material=t["glow"], smooth=False, m=translate(0, 8.9, 0) @ scale(0.18, 0.35, 0.18))
    return m


def inhibitor(team, rng):
    t = TEAM[team]
    m = Model(rng)
    metal = GOLD if team == "Blue" else (74, 64, 68)
    m.add(frustum(1.8, 1.6, 0.35, 12), STONE_DARK, smooth=False, jitter=4)
    m.add(frustum(1.45, 1.35, 0.3, 12), t["trim"], smooth=False, m=translate(0, 0.35, 0))
    for x, y, z in ring_pts(1.2, 0.65, 6):
        claw(m, [(x, y, z), (x * 1.15, 1.5, z * 1.15), (x * 0.8, 2.4, z * 0.8)], 0.14, 0.05, metal)
    m.add(icosphere(1), (255, 255, 255), material=t["glow"], smooth=False, m=translate(0, 1.75, 0) @ scale(0.72, 0.72, 0.72))
    for x, y, z in ring_pts(1.05, 1.75, 8):                          # floating rune ring
        m.add(octahedron(), (255, 255, 255), material=t["glow"], smooth=False, m=translate(x, y, z) @ scale(0.08, 0.14, 0.08))
    return m


def nexus(team, rng):
    t = TEAM[team]
    m = Model(rng)
    metal = GOLD if team == "Blue" else (74, 64, 68)
    for k, (r, hgt, c) in enumerate(((3.3, 0.45, STONE_DARK), (2.7, 0.45, STONE), (2.1, 0.4, t["trim"]))):
        m.add(frustum(r, r * 0.95, hgt, 6), c, smooth=False, jitter=4, m=translate(0, 0.45 * k, 0) @ rot_y(np.pi / 6))
    for x, y, z in ring_pts(2.5, 0.9, 6, np.pi / 6):                 # buttresses leaning on the crystal
        claw(m, [(x, y, z), (x * 1.05, 3.0, z * 1.05), (x * 0.6, 5.2, z * 0.6)], 0.32, 0.08, metal)
        m.add(octahedron(), (255, 255, 255), material=t["glow"], smooth=False,
              m=translate(x * 0.6, 5.5, z * 0.6) @ scale(0.2, 0.35, 0.2))
    m.add(octahedron(), (255, 255, 255), material=t["glow"], smooth=False,
          m=translate(0, 4.0, 0) @ rot_y(0.4) @ scale(1.35, 2.6, 1.35))
    for x, y, z in ring_pts(1.9, 4.0, 10):                           # orbiting shards
        m.add(octahedron(), (255, 255, 255), material=t["glow"], smooth=False, m=translate(x, y, z) @ scale(0.12, 0.3, 0.12))
    return m


def fountain(team, rng):
    t = TEAM[team]
    m = Model(rng)
    metal = GOLD if team == "Blue" else (74, 64, 68)
    for k, r in enumerate((3.4, 2.9, 2.4)):                          # stepped platform
        m.add(frustum(r, r - 0.1, 0.25, 16), STONE if k % 2 == 0 else STONE_DARK, smooth=False, jitter=4,
              m=translate(0, 0.25 * k, 0))
    m.add(frustum(2.0, 2.0, 0.04, 16), (255, 255, 255), material=t["glow"], smooth=False, m=translate(0, 0.75, 0))
    for x, y, z in ring_pts(2.6, 0.5, 6, np.pi / 6):                 # ring of pillars
        m.add(frustum(0.22, 0.18, 2.0, 6), STONE, smooth=False, jitter=4, m=translate(x, y, z))
        m.add(octahedron(), (255, 255, 255), material=t["glow"], smooth=False, m=translate(x, y + 2.3, z) @ scale(0.18, 0.3, 0.18))
    m.add(frustum(0.45, 0.3, 2.6, 8), metal, smooth=False, m=translate(0, 0.75, 0))
    m.add(octahedron(), (255, 255, 255), material=t["glow"], smooth=False, m=translate(0, 3.8, 0) @ scale(0.45, 0.8, 0.45))
    return m


def facing(p):
    """Rotation about y that turns a +x-facing structure toward the map centre."""
    dx = CENTER[0] - p[0]
    dz = -(CENTER[1] - p[1])          # game north is model -z
    return rot_y(math.atan2(-dz, dx))


# --- main --------------------------------------------------------------------------

def main(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    rng = np.random.default_rng(SEED)
    cls, h, terrain, cliffs = build_terrain(rng)
    height_at = sampler(h)
    nodes = [("Terrain", terrain), ("Cliffs", cliffs)] + build_props(cls, h, rng)
    if not os.path.exists(TEXTURE):     # the texture already shows the painted river
        nodes.insert(2, ("Water", build_water()))
    structures = []

    def model_pos(p):
        x, z = to_model(p)
        return [round(x, 3), round(height_at(p), 3), round(z, 3)]

    lane_cells = np.argwhere(cls == LANE) * CELL                     # game coords of every lane vertex

    def snap_to_lane(p):
        """Turret positions come from the game; nudge any that miss the traced lane onto its middle."""
        if class_at(cls, p) in (LANE, BASE_B, BASE_R):
            return p
        d = np.hypot(lane_cells[:, 0] - p[0], lane_cells[:, 1] - p[1])
        near = lane_cells[np.hypot(*(lane_cells - lane_cells[d.argmin()]).T) < 650]
        return tuple(near.mean(0))

    def place(name, mdl, p, kind, team):
        if kind == "Turret":
            p = snap_to_lane(p)
        x, y, z = model_pos(p)
        nodes.append((name, mdl.transform(translate(x, y, z) @ facing(p))))
        structures.append({"node": name, "kind": kind, "team": team,
                           "game_pos": [round(p[0]), round(p[1])], "model_pos": [x, y, z]})

    for team, f in (("Blue", lambda p: p), ("Red", mirror)):
        for name, p in BLUE_TURRETS.items():
            place(f"Turret_{team}_{name}", turret(team, rng), f(p), "Turret", team)
        for name, p in BLUE_INHIBITORS.items():
            place(f"Inhibitor_{team}_{name}", inhibitor(team, rng), f(p), "Inhibitor", team)
        place(f"Nexus_{team}", nexus(team, rng), f(BLUE_NEXUS), "Nexus", team)
        place(f"Fountain_{team}", fountain(team, rng), f(FOUNTAIN), "Fountain", team)

    write_glb(os.path.join(out_dir, "summoners_rift.glb"), nodes, MATERIALS,
              images=[TEXTURE] if os.path.exists(TEXTURE) else [])

    camps = [{"name": n, "side": side, "game_pos": [round(v) for v in f(p)], "model_pos": model_pos(f(p))}
             for side, f in (("Blue", lambda p: p), ("Red", mirror)) for n, p in BLUE_CAMPS.items()]
    data = {
        "description": "Summoner's Rift low-poly 3D map. Model units: the map spans -96..96 on x and z; "
                       "y is up, north (red side) is -z.",
        "model_units_per_game_unit": S / W, "map_game_units": W, "water_level": WATER_LEVEL,
        "lanes": {name: {"game": pts, "model": [model_pos(p) for p in pts]} for name, pts in LANES.items()},
        "river": {"game": RIVER, "model": [model_pos(p) for p in RIVER]},
        "fountains": {"Blue": model_pos(FOUNTAIN), "Red": model_pos(mirror(FOUNTAIN))},
        "objectives": {n: {"game_pos": list(p), "model_pos": model_pos(p)} for n, p in OBJECTIVES.items()},
        "jungle_camps": camps,
        "structures": structures,
    }
    with open(os.path.join(out_dir, "map_data.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1)
    tris = sum(m.triangles() for _, m in nodes)
    print(f"{len(nodes)} nodes, {tris} triangles -> {out_dir}")
    for name, m in nodes[:6]:
        print(f"  {name}: {m.triangles()}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__)))
