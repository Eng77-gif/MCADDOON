"""Generate a stylised low-poly 3D model of Summoner's Rift for the manager game.

Usage: python3 build_rift.py [OUT_DIR]

Writes:
  summoners_rift.glb   smooth terrain, water, trees/brush/rocks, plus one named node per
                       structure and monster camp (Turret_Blue_Top_Outer, Inhibitor_Red_Mid,
                       Nexus_Blue, Monster_Baron, Monster_Blue_Sentinel_Red, ...) so the game
                       can hide a structure when it is destroyed or a camp while it is dead.
  map_data.json        lane waypoints, structures, jungle camps and objectives in both
                       Leaguepedia/game coordinates and model coordinates.

Layout follows the real map in game units (0..14870 on each axis, blue base at the
bottom-left, red base at the top-right). The red half is the blue half mirrored
through the map centre, so both sides are identical.
"""
import json, math, os, sys

import numpy as np

from geometry import (Model, align_y, catmull_rom, fan, frustum, icosphere, octahedron, rot_y,
                      scale, srgb_to_linear, translate, tube, uv_sphere, write_glb)

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
GLOWS = {"Glow_Blue": (80, 180, 255), "Glow_Red": (255, 86, 70), "Glow_Purple": (200, 110, 255),
         "Glow_Yellow": (255, 220, 90), "Glow_Orange": (255, 140, 50), "Glow_Cyan": (150, 235, 255)}
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


# --- monsters ----------------------------------------------------------------------
# Built facing +x with the origin on the ground, then turned toward the map centre.

def ell(m, c, r, rgb, material="Base", seg=14, rings=10, jitter=3):
    m.add(uv_sphere(seg, rings), rgb, material=material, jitter=jitter, m=translate(*c) @ scale(*r))


def limb(m, ctrl, r0, r1, rgb, material="Base", n=10, seg=8):
    pts = catmull_rom(ctrl, n)
    m.add(tube(pts, np.linspace(r0, r1, n), seg), rgb, material=material, jitter=2)


def spike(m, base, direction, length, radius, rgb, material="Base", seg=6):
    m.add(frustum(radius, 0, length, seg), rgb, material=material, smooth=False,
          m=translate(*base) @ align_y(direction))


def crystal(m, c, r, h, direction, material):
    m.add(octahedron(), (255, 255, 255), material=material, smooth=False,
          m=translate(*c) @ align_y(direction) @ scale(r, h, r))


def rocky(m, c, r, rgb, rng, subdiv=1, rough=0.15):
    p, f = icosphere(subdiv)
    p = p * (1 + rng.uniform(-rough, rough, (len(p), 1)))
    m.add((p, f), rgb, smooth=False, jitter=8, m=translate(*c) @ rot_y(rng.uniform(0, 6.3)) @ scale(*r))


def glow_dot(m, c, r, material, seg=8):
    ell(m, c, (r, r, r), (255, 255, 255), material, seg, max(4, seg // 2 + 1), jitter=0)


def baron(rng):
    m = Model(rng)
    dark, body, light, belly, mouth = (64, 34, 94), (116, 62, 156), (146, 84, 186), (190, 146, 210), (120, 30, 78)
    a = np.linspace(0.2, 2.0 * np.pi, 12)       # coiled tail spiralling into the body
    coil = [(-1.6 + (3.6 - 0.25 * k) * np.cos(t), 0.7 + 0.05 * k, (3.6 - 0.25 * k) * np.sin(t)) for k, t in enumerate(a)]
    limb(m, coil[::-1] + [(-0.6, 1.0, 0)], 0.25, 1.4, dark, n=26, seg=10)
    limb(m, [(-0.6, 0.8, 0), (-0.4, 3.0, 0), (0.4, 5.6, 0), (1.6, 7.2, 0)], 2.2, 1.6, body, n=14, seg=14)
    spine = catmull_rom([(-0.6, 0.8, 0), (-0.4, 3.0, 0), (0.4, 5.6, 0), (1.6, 7.2, 0)], 9)
    for k, p in enumerate(spine[1:-1]):                              # armour plates down the back
        tan = spine[k + 2] - spine[k]
        back = np.array([-tan[1], tan[0], 0]) / np.linalg.norm(tan)
        r = 2.1 - 0.06 * k
        m.add(uv_sphere(10, 7), dark, jitter=3,
              m=translate(*(p + back * r * 0.75)) @ rot_y(0) @ align_y(tan) @ scale(r * 0.75, 0.55, r * 1.05))
    for k, p in enumerate(spine[1:-2]):                              # pale belly scales on the front
        tan = spine[k + 2] - spine[k]
        front = np.array([tan[1], -tan[0], 0]) / np.linalg.norm(tan)
        m.add(uv_sphere(10, 7), belly, jitter=3,
              m=translate(*(p + front * 1.55)) @ align_y(tan) @ scale(1.1, 0.5, 1.3))
    ell(m, (2.6, 7.9, 0), (2.5, 1.35, 1.8), light)                   # head
    ell(m, (3.1, 6.6, 0), (2.0, 0.55, 1.45), body)                   # lower jaw, hanging open
    ell(m, (3.4, 7.25, 0), (1.6, 0.45, 1.2), mouth)                  # inside of the mouth
    for k in range(7):                                               # teeth
        z = -0.9 + k * 0.3
        spike(m, (4.6 - abs(z) * 0.5, 7.6, z), (0.15, -1, 0), 0.5, 0.09, (246, 238, 226))
        spike(m, (4.4 - abs(z) * 0.5, 6.9, z), (0.15, 1, 0), 0.35, 0.08, (246, 238, 226))
    for s in (-1, 1):
        ell(m, (3.9, 8.45, s * 0.95), (0.34, 0.24, 0.3), (255, 255, 255), "Glow_Yellow", 10, 6, 0)
        limb(m, [(1.4, 8.8, s * 1.2), (0.6, 10.0, s * 1.8), (-0.8, 10.8, s * 2.0), (-2.0, 10.4, s * 1.6)],
             0.45, 0.05, dark, n=10, seg=7)                          # curved horns
    for k in range(9):                                               # spikes down the back
        t = k / 8
        base = (-0.6 - 1.4 * t, 8.6 - 7.2 * t, 0)
        spike(m, base, (-1, 0.6, 0), 1.2 - 0.6 * t, 0.32 - 0.12 * t, dark)
    for ang in (0.6, 1.9, 3.3, 4.4, 5.6):                            # tentacles around the pit
        x, z = 5.6 * np.cos(ang), 5.6 * np.sin(ang)
        tip = (x * 1.05 + 0.6 * np.cos(ang + 1), 3.6 + 0.6 * np.sin(ang * 3), z * 1.05 + 0.6 * np.sin(ang + 1))
        limb(m, [(x * 0.9, -0.3, z * 0.9), (x, 1.6, z), tip], 0.55, 0.12, dark, n=10, seg=8)
        glow_dot(m, tip, 0.22, "Glow_Purple")
    for _ in range(14):                                              # glowing spots on the body
        t = rng.uniform(0.15, 0.75)
        a2 = rng.uniform(-2.0, 2.0)
        cx = -0.6 + 2.2 * t * t
        glow_dot(m, (cx - 2.0 * np.cos(a2) * 0.9, 0.8 + 6.4 * t, 2.0 * np.sin(a2)), 0.16, "Glow_Purple", 6)
    return m


def dragon(rng):
    m = Model(rng)
    scale_, belly, wing, membrane, horn = (196, 88, 48), (238, 176, 98), (140, 50, 38), (214, 112, 66), (238, 226, 196)
    ell(m, (0, 2.8, 0), (2.7, 1.5, 1.55), scale_)                    # body
    ell(m, (0.3, 2.35, 0), (2.4, 1.05, 1.3), belly)
    limb(m, [(1.8, 3.2, 0), (2.9, 4.2, 0), (3.7, 4.8, 0)], 0.95, 0.6, scale_)   # neck
    ell(m, (4.3, 5.0, 0), (1.0, 0.68, 0.7), scale_)                  # head
    ell(m, (5.3, 4.78, 0), (0.75, 0.38, 0.46), scale_)               # snout
    ell(m, (5.0, 4.5, 0), (0.8, 0.22, 0.42), belly)                  # jaw
    for s in (-1, 1):
        glow_dot(m, (4.65, 5.25, s * 0.48), 0.15, "Glow_Yellow")
        spike(m, (3.9, 5.4, s * 0.35), (-1, 0.7, s * 0.25), 1.2, 0.17, horn)
        spike(m, (4.3, 5.55, s * 0.25), (-0.6, 1, s * 0.2), 0.6, 0.1, horn)
        shoulder, elbow, tip = (0.6, 3.9, s * 1.2), (-0.3, 5.8, s * 3.6), (-1.6, 6.4, s * 6.8)
        limb(m, [shoulder, elbow, tip], 0.28, 0.06, wing, n=10, seg=6)        # wing bone
        trail = [(-2.8, 4.6, s * 5.6), (-2.4, 4.1, s * 3.4), (-1.4, 3.7, s * 1.5)]
        m.add(fan([elbow, tip] + trail + [shoulder]), membrane, smooth=False, jitter=6, double=True)
        for k in range(3):                                           # wing fingers
            limb(m, [elbow, trail[k]], 0.1, 0.04, wing, n=4, seg=5)
        for lx in (-1.3, 1.2):                                       # legs and claws
            limb(m, [(lx, 2.2, s * 0.9), (lx + 0.3, 1.1, s * 1.2), (lx + 0.2, 0.25, s * 1.15)], 0.42, 0.26, scale_, n=8)
            for c in (-0.15, 0.15):
                spike(m, (lx + 0.35, 0.15, s * 1.15 + c), (1, -0.2, 0), 0.4, 0.08, horn, seg=4)
    limb(m, [(-2.3, 2.6, 0), (-4.5, 2.0, 0.7), (-6.4, 1.2, -0.4), (-8.3, 0.7, 0.4)], 0.95, 0.12, scale_, n=16)
    spike(m, (-8.3, 0.7, 0.4), (-1, 0.3, 0), 0.9, 0.3, (255, 255, 255), "Glow_Orange")
    for k in range(10):                                              # spine plates
        x = 3.2 - k * 0.75
        y = 4.7 - k * 0.12 if k < 3 else 4.3 - (k - 3) * 0.32
        spike(m, (x, y, 0), (-0.3, 1, 0), 0.6 - 0.03 * k, 0.2, wing, seg=4)
    return m


def blue_sentinel(rng):
    m = Model(rng)
    stone, rock_, moss = (104, 116, 140), (84, 94, 116), (90, 130, 90)
    for s in (-1, 1):
        rocky(m, (0, 0.6, s * 1.1), (0.75, 0.9, 0.7), rock_, rng)                 # legs
        rocky(m, (0.6, 3.5, s * 2.7), (0.9, 1.1, 0.8), rock_, rng)                # shoulders
        rocky(m, (0.9, 2.1, s * 2.9), (0.8, 1.0, 0.75), stone, rng)               # forearms
        rocky(m, (1.4, 0.8, s * 2.9), (1.0, 0.8, 0.9), stone, rng)                # fists on the ground
    rocky(m, (0, 3.4, 0), (2.0, 1.8, 2.2), stone, rng, subdiv=2, rough=0.08)     # torso
    rocky(m, (-0.4, 4.6, 0), (1.5, 0.6, 1.7), moss, rng, rough=0.1)              # moss on the back
    rocky(m, (1.9, 4.8, 0), (0.9, 0.75, 0.95), stone, rng)                        # head
    for s in (-1, 1):
        glow_dot(m, (2.7, 4.95, s * 0.38), 0.13, "Glow_Cyan")
    for c, d, r, hh in (((-0.6, 5.2, 0), (0, 1, 0), 0.38, 1.6), ((-1.0, 4.9, -0.7), (-0.4, 1, -0.5), 0.3, 1.2),
                        ((-0.9, 5.0, 0.8), (-0.3, 1, 0.6), 0.32, 1.3), ((-1.6, 4.4, 0), (-1, 0.8, 0), 0.26, 1.0),
                        ((0.0, 5.1, 0.5), (0.3, 1, 0.3), 0.22, 0.8), ((0.0, 5.1, -0.5), (0.3, 1, -0.4), 0.2, 0.7)):
        crystal(m, c, r, hh, d, "Glow_Blue")
    ell(m, (1.95, 3.3, 0), (0.25, 0.4, 0.4), (255, 255, 255), "Glow_Blue", 8, 6, 0)   # chest rune
    return m


def red_brambleback(rng):
    m = Model(rng)
    hide, dark, thorn, tusk = (154, 60, 42), (100, 40, 30), (122, 46, 34), (238, 228, 204)
    for lx in (-1.4, 1.2):
        for s in (-1, 1):
            limb(m, [(lx, 2.0, s * 1.0), (lx + 0.2, 1.0, s * 1.15), (lx + 0.1, 0.2, s * 1.1)], 0.5, 0.36, dark, n=7)
    ell(m, (-0.2, 2.6, 0), (2.5, 1.55, 1.7), hide)                    # body
    ell(m, (2.4, 2.5, 0), (1.15, 1.0, 1.0), hide)                     # head
    ell(m, (3.4, 2.2, 0), (0.6, 0.5, 0.62), dark)                     # snout
    for s in (-1, 1):
        glow_dot(m, (3.1, 2.95, s * 0.55), 0.14, "Glow_Yellow")
        limb(m, [(3.6, 2.0, s * 0.5), (4.1, 2.3, s * 0.65), (4.3, 2.9, s * 0.55)], 0.16, 0.03, tusk, n=6, seg=6)
        spike(m, (2.2, 3.3, s * 0.6), (-0.6, 1, s * 0.5), 0.8, 0.18, dark)   # ears
    for _ in range(18):                                               # thorns with glowing tips
        a = rng.uniform(-1.1, 1.1)
        x = rng.uniform(-2.2, 1.4)
        k = np.sqrt(max(0.0, 1 - ((x + 0.2) / 2.5) ** 2))
        base = np.array((x, 2.6 + 1.45 * np.cos(a) * k, 1.6 * np.sin(a) * k))
        d = np.array((-0.5, np.cos(a), np.sin(a)))
        d /= np.linalg.norm(d)
        L = rng.uniform(0.6, 1.1)
        spike(m, base, d, L, 0.16, thorn)
        glow_dot(m, base + d * L, 0.09, "Glow_Orange", 6)
    limb(m, [(-2.6, 2.6, 0), (-3.3, 2.9, 0), (-3.7, 2.4, 0)], 0.25, 0.06, dark, n=6)
    return m


def gromp(rng):
    m = Model(rng)
    skin, belly = (88, 122, 58), (162, 176, 104)
    ell(m, (0, 1.4, 0), (2.0, 1.4, 1.9), skin)
    ell(m, (0.5, 1.0, 0), (1.6, 0.95, 1.6), belly)
    for s in (-1, 1):
        ell(m, (1.2, 2.6, s * 0.85), (0.45, 0.45, 0.45), (255, 255, 255), "Glow_Yellow", 10, 6, 0)
        ell(m, (1.6, 2.65, s * 0.85), (0.12, 0.22, 0.15), (30, 20, 20), seg=8, rings=5)
        limb(m, [(-0.8, 0.8, s * 1.4), (-0.6, 0.2, s * 2.0), (0.2, 0.1, s * 2.1)], 0.45, 0.3, skin, n=6)
        limb(m, [(1.3, 0.8, s * 1.0), (1.8, 0.1, s * 1.2)], 0.3, 0.22, skin, n=4)
    for _ in range(12):                                               # warts
        a, b = rng.uniform(0, 6.3), rng.uniform(0.2, 1.2)
        ell(m, (1.9 * np.cos(a) * np.sin(b), 1.4 + 1.3 * np.cos(b), 1.8 * np.sin(a) * np.sin(b)),
            (0.18, 0.12, 0.18), (70, 98, 46), seg=8, rings=5)
    return m


def wolf(m, ox, oz, s, fur, eye):
    ell(m, (ox, 1.2 * s, oz), (1.1 * s, 0.55 * s, 0.5 * s), fur)
    ell(m, (ox + 1.2 * s, 1.55 * s, oz), (0.45 * s, 0.4 * s, 0.38 * s), fur)
    ell(m, (ox + 1.65 * s, 1.45 * s, oz), (0.35 * s, 0.18 * s, 0.2 * s), fur)
    for z in (-0.18, 0.18):
        spike(m, (ox + 1.1 * s, 1.85 * s, oz + z * s), (0, 1, z), 0.4 * s, 0.12 * s, fur, seg=4)
        glow_dot(m, (ox + 1.55 * s, 1.65 * s, oz + z * 1.2 * s), 0.07 * s, eye, 6)
    for lx in (-0.7, 0.7):
        for z in (-0.25, 0.25):
            limb(m, [(ox + lx * s, 1.0 * s, oz + z * s), (ox + lx * s, 0.0, oz + z * s)], 0.14 * s, 0.1 * s, fur, n=3, seg=5)
    limb(m, [(ox - 1.0 * s, 1.3 * s, oz), (ox - 1.6 * s, 1.5 * s, oz), (ox - 1.9 * s, 1.2 * s, oz)],
         0.18 * s, 0.05 * s, fur, n=6, seg=5)


def wolves(rng):
    m = Model(rng)
    wolf(m, 0, 0, 1.5, (80, 82, 100), "Glow_Cyan")
    wolf(m, -2.6, -2.0, 1.0, (104, 104, 120), "Glow_Cyan")
    wolf(m, -2.6, 2.0, 1.0, (104, 104, 120), "Glow_Cyan")
    return m


def raptor(m, ox, oz, s, body, crest):
    ell(m, (ox, 1.3 * s, oz), (0.8 * s, 0.55 * s, 0.5 * s), body)
    limb(m, [(ox + 0.5 * s, 1.5 * s, oz), (ox + 0.9 * s, 2.0 * s, oz)], 0.25 * s, 0.2 * s, body, n=4, seg=6)
    ell(m, (ox + 1.05 * s, 2.15 * s, oz), (0.32 * s, 0.26 * s, 0.24 * s), body)
    spike(m, (ox + 1.3 * s, 2.1 * s, oz), (1, -0.3, 0), 0.4 * s, 0.1 * s, (236, 200, 90), seg=4)
    for k in range(3):
        spike(m, (ox + (0.95 - 0.2 * k) * s, 2.3 * s, oz), (-0.5, 1, 0), (0.5 - 0.1 * k) * s, 0.08 * s, crest, seg=4)
    for z in (-0.2, 0.2):
        limb(m, [(ox, 1.0 * s, oz + z * s), (ox - 0.1 * s, 0.5 * s, oz + z * s), (ox + 0.1 * s, 0, oz + z * s)],
             0.1 * s, 0.07 * s, (200, 150, 80), n=4, seg=5)
    limb(m, [(ox - 0.7 * s, 1.35 * s, oz), (ox - 1.4 * s, 1.6 * s, oz)], 0.2 * s, 0.05 * s, crest, n=4, seg=5)


def raptors(rng):
    m = Model(rng)
    raptor(m, 0, 0, 1.6, (232, 230, 238), (214, 62, 58))
    for ox, oz in ((-2.4, -1.8), (-2.4, 1.8), (-1.2, -3.4), (-1.2, 3.4), (-3.8, 0)):
        raptor(m, ox, oz, 0.9, (220, 218, 228), (200, 60, 60))
    return m


def krugs(rng):
    m = Model(rng)
    rock_ = (128, 108, 88)
    for c, r in (((0, 1.6, 0), 1.8), ((-2.6, 0.9, 2.0), 1.0)):
        rocky(m, c, (r, r * 0.9, r), rock_, rng, subdiv=1, rough=0.18)
        for _ in range(7):                                            # glowing lava cracks
            a, b = rng.uniform(0, 6.3), rng.uniform(0.3, 1.4)
            ell(m, (c[0] + r * np.cos(a) * np.sin(b), c[1] + r * 0.85 * np.cos(b), c[2] + r * np.sin(a) * np.sin(b)),
                (0.2, 0.08, 0.2), (255, 255, 255), "Glow_Orange", 6, 4, 0)
    for s in (-1, 1):
        glow_dot(m, (1.75, 2.0, s * 0.5), 0.14, "Glow_Yellow", 6)
    return m


def scuttle(rng):
    m = Model(rng)
    shell, top, leg = (82, 170, 166), (238, 198, 222), (210, 150, 170)
    ell(m, (0, 1.0, 0), (1.6, 0.65, 1.3), shell)
    ell(m, (0, 1.45, 0), (0.95, 0.4, 0.8), top)
    for x in (-0.6, 0, 0.6):
        for s in (-1, 1):
            limb(m, [(x, 0.8, s * 1.0), (x, 0.7, s * 1.7), (x + 0.1, 0.0, s * 1.9)], 0.11, 0.06, leg, n=5, seg=5)
    for s in (-1, 1):
        limb(m, [(1.2, 1.3, s * 0.4), (1.6, 1.8, s * 0.45)], 0.06, 0.05, leg, n=3, seg=4)
        glow_dot(m, (1.6, 1.85, s * 0.45), 0.13, "Glow_Yellow", 6)
    return m


MONSTERS = {"Baron": baron, "Dragon": dragon, "Blue_Sentinel": blue_sentinel,
            "Red_Brambleback": red_brambleback, "Gromp": gromp, "Murk_Wolves": wolves,
            "Raptors": raptors, "Krugs": krugs, "Scuttle": scuttle}


def facing(p):
    """Rotation about y that turns a +x-facing model toward the map centre."""
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
    structures, monsters = [], []

    def model_pos(p):
        x, z = to_model(p)
        return [round(x, 3), round(height_at(p), 3), round(z, 3)]

    def place(name, mdl, p, kind, team, record, key):
        x, y, z = model_pos(p)
        nodes.append((name, mdl.transform(translate(x, y, z) @ facing(p))))
        record.append({"node": name, "kind": kind, key: team,
                       "game_pos": [round(p[0]), round(p[1])], "model_pos": [x, y, z]})

    for team, f in (("Blue", lambda p: p), ("Red", mirror)):
        for name, p in BLUE_TURRETS.items():
            place(f"Turret_{team}_{name}", turret(team, rng), f(p), "Turret", team, structures, "team")
        for name, p in BLUE_INHIBITORS.items():
            place(f"Inhibitor_{team}_{name}", inhibitor(team, rng), f(p), "Inhibitor", team, structures, "team")
        place(f"Nexus_{team}", nexus(team, rng), f(BLUE_NEXUS), "Nexus", team, structures, "team")
        place(f"Fountain_{team}", fountain(team, rng), f(FOUNTAIN), "Fountain", team, structures, "team")
        for name, p in BLUE_CAMPS.items():
            place(f"Monster_{name}_{team}", MONSTERS[name](rng), f(p), name, team, monsters, "side")
    for node, kind, p in (("Monster_Baron", "Baron", OBJECTIVES["Baron_Pit"]),
                          ("Monster_Dragon", "Dragon", OBJECTIVES["Dragon_Pit"]),
                          ("Monster_Scuttle_Top", "Scuttle", OBJECTIVES["Scuttle_Top"]),
                          ("Monster_Scuttle_Bot", "Scuttle", OBJECTIVES["Scuttle_Bot"])):
        place(node, MONSTERS[kind](rng), p, kind, "Neutral", monsters, "side")

    write_glb(os.path.join(out_dir, "summoners_rift.glb"), nodes, MATERIALS)

    camps = [{"name": n, "side": side, "game_pos": [round(v) for v in f(p)], "model_pos": model_pos(f(p)),
              "node": f"Monster_{n}_{side}"}
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
        "monsters": monsters,
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
