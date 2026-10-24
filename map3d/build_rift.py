"""Generate a stylised low-poly 3D model of Summoner's Rift for the manager game.

Usage: python3 build_rift.py [OUT_DIR]

Writes:
  summoners_rift.glb   smooth terrain, water, trees/brush/rocks, plus one named node per
                       structure (Turret_Blue_Top_Outer, Inhibitor_Red_Mid, Nexus_Blue, ...)
                       so the game can hide a structure when it is destroyed. No monsters:
                       jungle camp and objective positions are in map_data.json.
  map_data.json        lane waypoints, structures, jungle camps and objectives in both
                       Leaguepedia/game coordinates and model coordinates.

Layout follows the real map in game units (0..14870 on each axis, blue base at the
bottom-left, red base at the top-right). The red half is the blue half mirrored
through the map centre, so both sides are identical.
"""
import json, math, os, sys

import numpy as np

from geometry import (Model, frustum, icosphere, octahedron, rot_y, scale, srgb_to_linear, translate,
                      write_glb)

W = 14870.0          # map size in game units
S = 192.0            # map size in model units (x and z span -S/2..S/2, y is up, north is -z)
G = 241              # terrain vertices per side
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
LANE_RADIUS = 400

RIVER = [(1500, 13400), (3000, 12000), (5000, 10450), (7435, 7435),
         (9870, 4420), (11870, 2870), (13370, 1470)]
RIVER_RADIUS = 640

BLUE_JUNGLE_PATHS = [
    [(1100, 5200), (2600, 5600), (3800, 6500)],
    [(3800, 6500), (3800, 7900)],
    [(3800, 7900), (2100, 8400), (1100, 8700)],
    [(3800, 7900), (4700, 8900), (5300, 9600)],
    [(3800, 6500), (5000, 6100), (5800, 5800)],
    [(5200, 1100), (5700, 2700), (7800, 4000)],
    [(7800, 4000), (8400, 2700), (8700, 1100)],
    [(7800, 4000), (7000, 5400)],
    [(7000, 5400), (6000, 5900)],
    [(7000, 5400), (8300, 6300)],
    [(7800, 4000), (9000, 4900), (9700, 5100)],
    [(4600, 4300), (5500, 3300), (5700, 2700)],
]
PATH_RADIUS = 300

BLUE_CAMPS = {
    "Blue_Sentinel": (3800, 7900), "Gromp": (2100, 8400), "Murk_Wolves": (3800, 6500),
    "Raptors": (7000, 5400), "Red_Brambleback": (7800, 4000), "Krugs": (8400, 2700),
}
CAMP_RADIUS = 560

OBJECTIVES = {
    "Baron_Pit": (5000, 10450), "Dragon_Pit": (9870, 4420),
    "Scuttle_Top": (4400, 9800), "Scuttle_Bot": (10470, 5070),
}
PIT_RADIUS = 800

BLUE_BRUSH = [(4500, 8700), (2600, 8100), (6200, 5600), (8800, 5300), (9300, 3000),
              (2200, 9900), (3200, 11400), (6400, 8000), (1700, 10800), (10800, 1700),
              (8100, 6700), (11400, 3200)]
BRUSH_RADIUS = 320

BASE_CENTER = (300, 300)
BASE_RADIUS = 4300
FOUNTAIN = (550, 550)

BLUE_TURRETS = {
    "Top_Outer": (981, 10441), "Top_Inner": (1512, 6699), "Top_Inhibitor": (1169, 4287),
    "Mid_Outer": (5846, 6396), "Mid_Inner": (5048, 4812), "Mid_Inhibitor": (3651, 3696),
    "Bot_Outer": (10504, 1029), "Bot_Inner": (6919, 1483), "Bot_Inhibitor": (4281, 1253),
    "Nexus_Top": (1748, 2270), "Nexus_Bot": (2177, 1807),
}
BLUE_INHIBITORS = {"Top": (1171, 3571), "Mid": (3203, 3208), "Bot": (3452, 1236)}
BLUE_NEXUS = (1551, 1561)

# --- look --------------------------------------------------------------------------

WALL, GROUND, LANE, RIVER_C, PIT, BRUSH, BASE_B, BASE_R, FOUNT_B, FOUNT_R, BASE_WALL, EDGE = range(12)
HEIGHT = {WALL: 2.4, GROUND: 0.0, LANE: 0.05, RIVER_C: -1.0, PIT: -0.2, BRUSH: 0.0, BASE_B: 0.5, BASE_R: 0.5,
          FOUNT_B: 0.7, FOUNT_R: 0.7, BASE_WALL: 2.6, EDGE: 5.0}
WATER_LEVEL = -0.45

TEAM = {"Blue": {"base": BASE_B, "fountain": FOUNT_B, "glow": "Glow_Blue", "trim": (52, 84, 150),
                 "tile": (104, 120, 148), "fountain_rgb": (110, 200, 235)},
        "Red": {"base": BASE_R, "fountain": FOUNT_R, "glow": "Glow_Red", "trim": (150, 52, 48),
                "tile": (150, 112, 104), "fountain_rgb": (236, 130, 104)}}
STONE, STONE_DARK, GOLD = (162, 160, 166), (112, 110, 118), (214, 180, 96)
CANOPY = [(48, 104, 54), (62, 120, 52), (40, 92, 64), (78, 126, 48), (56, 112, 72)]
TRUNK = (96, 70, 46)
GLOWS = {"Glow_Blue": (80, 180, 255), "Glow_Red": (255, 86, 70)}
MATERIALS = {
    "Base": {"pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, 1], "metallicFactor": 0, "roughnessFactor": 0.9}},
    "Water": {"pbrMetallicRoughness": {"baseColorFactor": [0.08, 0.3, 0.55, 0.7], "metallicFactor": 0,
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


def dist_to_polyline(pts):
    d = np.full(X.shape, np.inf)
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        dx, dy = x2 - x1, y2 - y1
        t = np.clip(((X - x1) * dx + (Y - y1) * dy) / (dx * dx + dy * dy), 0, 1)
        d = np.minimum(d, np.hypot(X - (x1 + t * dx), Y - (y1 + t * dy)))
    return d


def dist_to(p):
    return np.hypot(X - p[0], Y - p[1])


def disc(p, r):
    return dist_to(p) <= r


def both_sides(points):
    return list(points) + [mirror(p) for p in points]


def smooth_noise(scale_, seed):
    """Value noise in [0, 1] with features roughly `scale_` vertices wide."""
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

def classify():
    cls = np.full((G, G), WALL)
    for path in BLUE_JUNGLE_PATHS:
        cls[dist_to_polyline(path) <= PATH_RADIUS] = GROUND
        cls[dist_to_polyline([mirror(p) for p in path]) <= PATH_RADIUS] = GROUND
    for p in both_sides(BLUE_CAMPS.values()):
        cls[disc(p, CAMP_RADIUS)] = GROUND
    river_d = dist_to_polyline(RIVER)
    cls[river_d <= RIVER_RADIUS] = RIVER_C
    for name in ("Baron_Pit", "Dragon_Pit"):
        cls[disc(OBJECTIVES[name], PIT_RADIUS)] = PIT
    for p in both_sides(BLUE_BRUSH):
        cls[disc(p, BRUSH_RADIUS) & (cls != RIVER_C) & (cls != PIT)] = BRUSH
    lane_d = np.minimum.reduce([dist_to_polyline(path) for path in LANES.values()])
    cls[lane_d <= LANE_RADIUS] = LANE
    before_base = cls.copy()
    for team, centre in (("Blue", BASE_CENTER), ("Red", mirror(BASE_CENTER))):
        d = dist_to(centre)
        cls[d <= BASE_RADIUS] = TEAM[team]["base"]
        cls[(d <= BASE_RADIUS) & (d > BASE_RADIUS - 2.5 * CELL) & (before_base == WALL)] = BASE_WALL
    cls[disc(FOUNTAIN, 480)] = FOUNT_B
    cls[disc(mirror(FOUNTAIN), 480)] = FOUNT_R
    edge = (X < 260) | (X > W - 260) | (Y < 260) | (Y > W - 260)
    cls[edge] = EDGE
    return cls, river_d, lane_d


def build_terrain(rng):
    cls, river_d, lane_d = classify()
    n1, n2, n3 = smooth_noise(14, SEED + 10), smooth_noise(5, SEED + 11), smooth_noise(30, SEED + 12)

    h = np.vectorize(HEIGHT.get)(cls).astype(float)
    h[cls == WALL] += n3[cls == WALL] * 1.2
    h[cls == EDGE] += n1[cls == EDGE] * 2.0
    for name in ("Baron_Pit", "Dragon_Pit"):        # raised rocky rim around each pit
        d = dist_to(OBJECTIVES[name])
        rim = (d > PIT_RADIUS - 2 * CELL) & (d <= PIT_RADIUS + CELL)
        h[rim] = 0.7
    h = blur(h, 1.3)
    rough = (cls == WALL) | (cls == EDGE)
    h += (n2 - 0.5) * np.where(rough, 0.8, 0.08)

    col = np.zeros((G, G, 3))
    col[cls == WALL] = lerp((58, 84, 44), (82, 74, 50), n1[cls == WALL])
    m = cls == GROUND
    col[m] = lerp((96, 134, 64), (134, 108, 70), np.clip((n2[m] - 0.45) * 3, 0, 1))
    m = cls == BRUSH
    col[m] = (70, 128, 62)
    m = cls == LANE
    col[m] = lerp((188, 172, 132), (150, 132, 98), np.clip((lane_d[m] - LANE_RADIUS * 0.6) / (LANE_RADIUS * 0.4), 0, 1))
    m = cls == RIVER_C
    col[m] = lerp((170, 160, 120), (64, 96, 104), np.clip(1 - river_d[m] / RIVER_RADIUS, 0, 1) ** 0.6)
    for name, floor in (("Baron_Pit", (108, 92, 132)), ("Dragon_Pit", (150, 112, 84))):
        d = dist_to(OBJECTIVES[name])
        m = (cls == PIT) & (d <= PIT_RADIUS)
        ring = (np.sin(d[m] / CELL * 1.6) > 0.6).astype(float)
        col[m] = lerp(floor, np.array(floor) * 1.18, ring)
    ii, jj = np.meshgrid(np.arange(G), np.arange(G), indexing="ij")
    grout = ((ii % 4 == 0) | (jj % 4 == 0)).astype(float)
    for team in ("Blue", "Red"):
        t = TEAM[team]
        m = cls == t["base"]
        col[m] = lerp(t["tile"], np.array(t["tile"]) * 0.84, grout[m])
        col[cls == t["fountain"]] = t["fountain_rgb"]
    col[cls == BASE_WALL] = (150, 148, 152)
    col[cls == EDGE] = lerp((118, 116, 110), (78, 108, 62), n2[cls == EDGE])
    col = blur(col, 0.6)

    # cliffs: steep slopes read as rock
    gx, gy = np.gradient(h, S / (G - 1))
    slope = np.clip((np.hypot(gx, gy) - 0.6) / 1.2, 0, 1)
    col = lerp(col.reshape(-1, 3), (112, 102, 92), slope.reshape(-1)).reshape(G, G, 3)
    col += rng.integers(-6, 7, size=(G, G, 1))

    # mesh: vertex (i, j) -> model (x, h, z)
    mx = lin / W * S - S / 2
    mz = S / 2 - lin / W * S
    pos = np.stack([np.repeat(mx, G), h.reshape(-1), np.tile(mz, G)], -1)
    a = (ii[:-1, :-1] * G + jj[:-1, :-1]).reshape(-1)
    idx = np.concatenate([np.stack([a, a + G, a + 1], -1), np.stack([a + 1, a + G, a + G + 1], -1)])
    terrain = Model(rng)
    terrain.add((pos, idx), col.reshape(-1, 3))

    # skirt: rock sides so the map reads as a solid slab
    grid = pos.reshape(G, G, 3)
    for line in (grid[:, 0], grid[:, -1][::-1], grid[0][::-1], grid[-1]):
        low = line.copy()
        low[:, 1] = -4.0
        k = len(line)
        tri = [(t, k + t, t + 1) for t in range(k - 1)] + [(t + 1, k + t, k + t + 1) for t in range(k - 1)]
        terrain.add((np.concatenate([line, low]), tri), (92, 84, 76), smooth=False, jitter=6)
    return cls, h, terrain


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


def tree(m, x, y, z, rng):
    s = rng.uniform(0.8, 1.35)
    canopy = np.array(CANOPY[rng.integers(len(CANOPY))]) + rng.integers(-8, 9)
    m.add(frustum(0.2 * s, 0.14 * s, 0.9 * s, 4, caps=False), TRUNK, smooth=False, m=translate(x, y - 0.2, z))
    if rng.random() < 0.55:      # pine: stacked cones
        for k, (r, hgt, y0) in enumerate(((1.15, 1.8, 0.6), (0.85, 1.5, 1.5), (0.55, 1.1, 2.3))):
            m.add(frustum(r * s, 0, hgt * s, 7, caps=False), canopy * (1 + 0.06 * k), smooth=False, jitter=5,
                  m=translate(x, y + y0 * s, z) @ rot_y(rng.uniform(0, 6.3)))
    else:                        # broadleaf: two lumpy low-poly balls
        for dx, dy, dz, r in ((0, 1.6, 0, 1.2), (rng.uniform(-0.5, 0.5), 2.3, rng.uniform(-0.5, 0.5), 0.8)):
            p, f = icosphere(0)
            p = p * (1 + rng.uniform(-0.15, 0.15, (len(p), 1)))
            m.add((p, f), canopy * (1.08 if dy > 2 else 1), smooth=False, jitter=6,
                  m=translate(x + dx * s, y + dy * s, z + dz * s) @ rot_y(rng.uniform(0, 6.3)) @ scale(r * s, 0.9 * r * s, r * s))


def rock(m, x, y, z, size, rng, rgb=(124, 120, 116)):
    p, f = icosphere(0)
    p = p * (1 + rng.uniform(-0.25, 0.25, (len(p), 1)))
    m.add((p, f), np.array(rgb) + rng.integers(-10, 11), smooth=False, jitter=8,
          m=translate(x, y, z) @ rot_y(rng.uniform(0, 6.3)) @ scale(size, size * 0.7, size))


def build_props(cls, h, rng):
    height_at = sampler(h)
    trees, brush, rocks, small = Model(rng), Model(rng), Model(rng), Model(rng)
    for p in scatter(2.1, rng):
        c = class_at(cls, p)
        hh = height_at(p)
        if (c == WALL and hh > 1.7) or (c == EDGE and rng.random() < 0.7):
            x, z = to_model(p)
            tree(trees, x, hh, z, rng)
    for p in scatter(0.5, rng):
        if class_at(cls, p) == BRUSH:
            x, z = to_model(p)
            y = height_at(p)
            for _ in range(3):   # three grass blades per tuft
                a = rng.uniform(0, 6.3)
                lean = np.array([np.cos(a), 0, np.sin(a)]) * 0.25
                tip = np.array([x, y + rng.uniform(0.7, 1.2), z]) + lean
                side = np.array([-np.sin(a), 0, np.cos(a)]) * 0.12
                base = np.array([x, y - 0.05, z])
                brush.add(([base - side, base + side, tip], [(0, 1, 2)]),
                          np.array((64, 150, 70)) + rng.integers(-14, 15), normals=(0, 1, 0), double=True)
    for p in scatter(2.6, rng):
        c = class_at(cls, p)
        hh = height_at(p)
        x, z = to_model(p)
        if c == WALL and 0.4 < hh < 1.7 and rng.random() < 0.5:
            rock(rocks, x, hh, z, rng.uniform(0.5, 1.1), rng)
        elif c == RIVER_C and rng.random() < 0.12:
            rock(rocks, x, hh + 0.2, z, rng.uniform(0.35, 0.7), rng, (130, 134, 132))
        elif c == RIVER_C and rng.random() < 0.15:     # lily pads
            a = np.linspace(0, 2 * np.pi, 8)[:-1]
            r = rng.uniform(0.25, 0.45)
            pts = [(x, WATER_LEVEL + 0.02, z)] + [(x + r * np.cos(t), WATER_LEVEL + 0.02, z + r * np.sin(t)) for t in a]
            small.add((pts, [(0, k % 7 + 1, k) for k in range(1, 8)]), (70, 150, 70), normals=(0, 1, 0))
        elif c == GROUND and rng.random() < 0.35:     # flowers
            col = [(240, 214, 80), (232, 130, 170), (244, 244, 236), (150, 130, 230)][rng.integers(4)]
            for _ in range(rng.integers(2, 5)):
                ox, oz = rng.uniform(-0.5, 0.5, 2)
                small.add(octahedron(), col, smooth=False,
                          m=translate(x + ox, hh + 0.15, z + oz) @ scale(0.13, 0.13, 0.13))
    return [("Trees", trees), ("Brush", brush), ("Rocks", rocks), ("Flowers", small)]


# --- structures --------------------------------------------------------------------

def turret(team, rng):
    t = TEAM[team]
    m = Model(rng)
    m.add(frustum(1.7, 1.45, 0.6, 8), STONE_DARK, smooth=False, jitter=4)
    m.add(frustum(1.15, 0.9, 4.6, 8), STONE, smooth=False, jitter=4, m=translate(0, 0.6, 0))
    for y in (1.6, 3.2):
        m.add(frustum(1.12, 1.08, 0.25, 8), t["trim"], smooth=False, m=translate(0, y, 0))
    m.add(frustum(0.95, 1.5, 0.7, 8), t["trim"], smooth=False, m=translate(0, 5.2, 0))
    m.add(frustum(1.5, 1.2, 0.35, 8), GOLD, smooth=False, m=translate(0, 5.9, 0))
    for k in range(4):           # corner spikes
        a = k * np.pi / 2 + np.pi / 4
        m.add(frustum(0.18, 0, 0.9, 4), GOLD, smooth=False, m=translate(1.2 * np.cos(a), 6.2, 1.2 * np.sin(a)))
    m.add(octahedron(), (255, 255, 255), material=t["glow"], smooth=False,
          m=translate(0, 7.4, 0) @ scale(0.55, 0.9, 0.55))
    return m


def inhibitor(team, rng):
    t = TEAM[team]
    m = Model(rng)
    m.add(frustum(1.6, 1.4, 0.4, 10), STONE_DARK, smooth=False, jitter=4)
    m.add(frustum(1.3, 1.2, 0.3, 10), t["trim"], smooth=False, m=translate(0, 0.4, 0))
    for k in range(6):
        a = k * np.pi / 3
        m.add(frustum(0.14, 0.08, 1.3, 5), GOLD, smooth=False, m=translate(1.05 * np.cos(a), 0.7, 1.05 * np.sin(a)))
    m.add(icosphere(1), (255, 255, 255), material=t["glow"], smooth=False, m=translate(0, 1.7, 0) @ scale(0.75, 0.75, 0.75))
    return m


def nexus(team, rng):
    t = TEAM[team]
    m = Model(rng)
    for k, (r, hgt, c) in enumerate(((3.0, 0.5, STONE_DARK), (2.4, 0.5, STONE), (1.8, 0.4, t["trim"]))):
        m.add(frustum(r, r * 0.95, hgt, 12), c, smooth=False, jitter=4, m=translate(0, 0.5 * k, 0))
    for k in range(4):
        a = k * np.pi / 2 + np.pi / 4
        m.add(frustum(0.25, 0.18, 2.6, 6), GOLD, smooth=False, m=translate(2.2 * np.cos(a), 1.0, 2.2 * np.sin(a)))
        m.add(octahedron(), (255, 255, 255), material=t["glow"], smooth=False,
              m=translate(2.2 * np.cos(a), 4.0, 2.2 * np.sin(a)) @ scale(0.3, 0.5, 0.3))
    m.add(octahedron(), (255, 255, 255), material=t["glow"], smooth=False,
          m=translate(0, 4.2, 0) @ rot_y(0.4) @ scale(1.4, 2.8, 1.4))
    return m


def fountain(team, rng):
    t = TEAM[team]
    m = Model(rng)
    m.add(frustum(2.8, 2.6, 0.3, 16), STONE, smooth=False)
    m.add(frustum(2.4, 2.4, 0.05, 16), (255, 255, 255), material=t["glow"], smooth=False, m=translate(0, 0.3, 0))
    m.add(frustum(0.5, 0.35, 2.4, 8), GOLD, smooth=False, m=translate(0, 0.3, 0))
    m.add(octahedron(), (255, 255, 255), material=t["glow"], smooth=False, m=translate(0, 3.2, 0) @ scale(0.5, 0.8, 0.5))
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
    cls, h, terrain = build_terrain(rng)
    height_at = sampler(h)
    nodes = [("Terrain", terrain), ("Water", build_water())] + build_props(cls, h, rng)
    structures = []

    def model_pos(p):
        x, z = to_model(p)
        return [round(x, 3), round(height_at(p), 3), round(z, 3)]

    def place(name, mdl, p, kind, team):
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

    write_glb(os.path.join(out_dir, "summoners_rift.glb"), nodes, MATERIALS)

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
