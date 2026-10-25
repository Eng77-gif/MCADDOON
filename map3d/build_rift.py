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

RIVER = [(1500, 13400), (3000, 12000), (5000, 10450), (7435, 7435),
         (9870, 4420), (11870, 2870), (13370, 1470)]

BLUE_CAMPS = {
    "Blue_Sentinel": (3800, 7900), "Gromp": (2100, 8400), "Murk_Wolves": (3800, 6500),
    "Raptors": (7000, 5400), "Red_Brambleback": (7800, 4000), "Krugs": (8400, 2700),
}

OBJECTIVES = {
    "Baron_Pit": (4690, 10160), "Dragon_Pit": (9880, 4390),     # pit centres traced from the minimap
    "Scuttle_Top": (4400, 9800), "Scuttle_Bot": (10470, 5070),
}
PIT_RADIUS = 700

BLUE_BRUSH = [(4500, 8700), (2600, 8100), (6200, 5600), (8800, 5300), (9300, 3000),
              (2200, 9900), (3200, 11400), (6400, 8000), (1700, 10800), (10800, 1700),
              (8100, 6700), (11400, 3200)]
BRUSH_RADIUS = 320

BASE_CENTER = (0, 0)
BASE_RADIUS = 5200
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

def load_layout():
    """Classes traced from the minimap by trace_layout.py, indexed [i east, j north]."""
    from PIL import Image
    raw = np.asarray(Image.open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "layout.png")))
    raw = raw[::-1].T
    assert raw.shape == (G, G), "layout.png does not match G; rerun trace_layout.py"
    return raw


def classify():
    traced = load_layout()
    cls = np.select([traced == 1, traced == 2, traced == 3, traced == 4, traced == 5],
                    [GROUND, RIVER_C, PIT, LANE, OUTER], WALL)
    # pits only where the Baron and Dragon pits are; stray white pixels elsewhere become river
    near_pit = disc(OBJECTIVES["Baron_Pit"], PIT_RADIUS * 1.6) | disc(OBJECTIVES["Dragon_Pit"], PIT_RADIUS * 1.6)
    cls[(cls == PIT) & ~near_pit] = RIVER_C
    river_soft = blur((cls == RIVER_C).astype(float), 4)
    cls[(cls == LANE) & (river_soft > 0.18)] = RIVER_C           # the river runs under mid lane
    for p in both_sides(BLUE_BRUSH):
        cls[disc(p, BRUSH_RADIUS) & (cls == GROUND)] = BRUSH
    rim = (X < 420) | (X > W - 420) | (Y < 420) | (Y > W - 420)    # forested cliff all round the island
    for team, centre in (("Blue", BASE_CENTER), ("Red", mirror(BASE_CENTER))):
        cls[disc(centre, BASE_RADIUS)] = TEAM[team]["base"]
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
    for team, centre in (("Blue", BASE_CENTER), ("Red", mirror(BASE_CENTER))):
        t = TEAM[team]
        m = cls == t["base"]
        d = dist_to(centre)
        ang = np.degrees(np.arctan2(np.abs(Y - centre[1]), np.abs(X - centre[0])))
        # stone plaza: concentric rings and radial joints with moss in the gaps
        joint = (np.abs((d / 900) % 1 - 0.5) > 0.46) | (np.abs((ang / 7.5) % 1 - 0.5) > 0.45)
        tiles = lerp(t["tile"], np.array(t["tile"]) * 0.9, (n2 > 0.5).astype(float))
        col[m] = np.where(joint[m, None], np.array((88, 104, 72)), tiles[m])
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
    terrain.add((pos, idx), col.reshape(-1, 3))

    # skirt: cliffs under the floating island
    grid = pos.reshape(G, G, 3)
    for line in (grid[:, 0], grid[:, -1][::-1], grid[0][::-1], grid[-1]):
        low = line.copy()
        low[:, 1] = -6.0 + rng.uniform(-1.5, 1.5, len(line))
        k = len(line)
        tri = [(t, k + t, t + 1) for t in range(k - 1)] + [(t + 1, k + t, k + t + 1) for t in range(k - 1)]
        terrain.add((np.concatenate([line, low]), tri), (84, 82, 74), smooth=False, jitter=8)
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
        y = float(min(h[i, j], 1.2))
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
            if r < 0.16:
                tree(trees, x, hh, z, rng, pine_chance=0.5)
            elif r < 0.6:
                bush(trees, x, hh, z, rng)
            elif r < 0.75:
                rock(rocks, x, hh, z, rng.uniform(0.5, 1.0), rng)
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
                          np.array((64, 140, 62)) + rng.integers(-14, 15), normals=(0, 1, 0), double=True)
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
