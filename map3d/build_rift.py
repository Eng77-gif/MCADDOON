"""Generate a voxel (pixel-art 3D) model of Summoner's Rift for the manager game.

Usage: python3 build_rift.py [OUT_DIR]

Writes:
  summoners_rift.glb   terrain mesh + one named node per structure and per monster camp
                       (Turret_Blue_Top_Outer, Inhibitor_Red_Mid, Nexus_Blue, Monster_Baron,
                       Monster_Blue_Sentinel_Red, ...) so the game can hide a structure when it
                       is destroyed or a monster while it is dead.
  map_data.json        lane waypoints, structures, jungle camps and objectives in
                       both Leaguepedia/game coordinates and model coordinates.

Layout follows the real map in game units (0..14870 on each axis, blue base at the
bottom-left, red base at the top-right). The red half is the blue half mirrored
through the map centre, so both sides are identical.
"""
import json, os, struct, sys

import numpy as np

W = 14870.0          # map size in game units
N = 192              # voxels per side
CELL = W / N         # game units per voxel
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
LANE_RADIUS = 380

RIVER = [(1500, 13400), (3000, 12000), (5000, 10450), (7435, 7435),
         (9870, 4420), (11870, 2870), (13370, 1470)]
RIVER_RADIUS = 620

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
PATH_RADIUS = 260

BLUE_CAMPS = {
    "Blue_Sentinel": (3800, 7900), "Gromp": (2100, 8400), "Murk_Wolves": (3800, 6500),
    "Raptors": (7000, 5400), "Red_Brambleback": (7800, 4000), "Krugs": (8400, 2700),
}
CAMP_RADIUS = 520

OBJECTIVES = {
    "Baron_Pit": (5000, 10450), "Dragon_Pit": (9870, 4420),
    "Scuttle_Top": (4400, 9800), "Scuttle_Bot": (10470, 5070),
}
PIT_RADIUS = 760

BLUE_BRUSH = [(4500, 8700), (2600, 8100), (6200, 5600), (8800, 5300), (9300, 3000),
              (2200, 9900), (3200, 11400), (6400, 8000), (1700, 10800), (10800, 1700),
              (8100, 6700), (11400, 3200)]
BRUSH_RADIUS = 300

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

# --- terrain classes ---------------------------------------------------------------

WALL, GROUND, LANE, RIVER_C, PIT, BRUSH, BASE_B, BASE_R, FOUNT_B, FOUNT_R, BASE_WALL, EDGE = range(12)
HEIGHT = {WALL: 4, GROUND: 2, LANE: 2, RIVER_C: 1, PIT: 1, BRUSH: 3, BASE_B: 3, BASE_R: 3,
          FOUNT_B: 3, FOUNT_R: 3, BASE_WALL: 5, EDGE: 7}

TEAM = {"Blue": {"base": BASE_B, "fountain": FOUNT_B, "crystal": (70, 170, 255), "trim": (40, 70, 140),
                 "tile": (120, 140, 168), "glow": (96, 196, 230)},
        "Red": {"base": BASE_R, "fountain": FOUNT_R, "crystal": (255, 80, 70), "trim": (140, 40, 40),
                "tile": (168, 128, 120), "glow": (236, 120, 96)}}
STONE = (150, 150, 158)
EARTH = (100, 76, 52)
CANOPY = [(46, 98, 52), (58, 112, 50), (38, 86, 58), (72, 118, 46)]


def cell_centers():
    c = (np.arange(N) + 0.5) * CELL
    return np.meshgrid(c, c, indexing="ij")  # X[i, j] = x of column i, Y[i, j] = y of row j


X, Y = cell_centers()


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


def smooth_noise(scale, seed):
    """Value noise in [0, 1] with features roughly `scale` voxels wide."""
    rng = np.random.default_rng(seed)
    k = N // scale + 2
    g = rng.random((k, k))
    t = np.arange(N) / scale
    i0 = t.astype(int)
    f = t - i0
    f = f * f * (3 - 2 * f)
    a = g[i0][:, i0] * (1 - f)[:, None] + g[i0 + 1][:, i0] * f[:, None]
    b = g[i0][:, i0 + 1] * (1 - f)[:, None] + g[i0 + 1][:, i0 + 1] * f[:, None]
    return a * (1 - f)[None, :] + b * f[None, :]


def lerp(c1, c2, t):
    t = np.asarray(t)[..., None]
    return np.array(c1) * (1 - t) + np.array(c2) * t


def build_terrain():
    """Returns class map, column heights, top colours, side colours and how many top
    layers of each column use the top colour on their sides (tree canopy, grass)."""
    rng = np.random.default_rng(SEED)
    cls = np.full((N, N), WALL)
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
        # stone rampart where the base meets jungle wall; lanes and jungle paths stay open
        cls[(d <= BASE_RADIUS) & (d > BASE_RADIUS - 2.2 * CELL) & (before_base == WALL)] = BASE_WALL
    cls[disc(FOUNTAIN, 450)] = FOUNT_B
    cls[disc(mirror(FOUNTAIN), 450)] = FOUNT_R
    edge = np.zeros((N, N), bool)
    edge[:2, :] = edge[-2:, :] = edge[:, :2] = edge[:, -2:] = True
    cls[edge] = EDGE

    height = np.vectorize(HEIGHT.get)(cls).astype(int)
    top = np.zeros((N, N, 3))
    side = np.zeros((N, N, 3))
    cap = np.zeros((N, N), int)
    r = rng.random((N, N))
    n1, n2, n3 = smooth_noise(12, SEED + 10), smooth_noise(6, SEED + 11), smooth_noise(20, SEED + 12)

    # jungle walls: rolling height, clustered tree colours, scattered rocks
    m = cls == WALL
    height[m] += (n3[m] * 2.4).astype(int)
    tone = (n1 * len(CANOPY)).astype(int).clip(0, len(CANOPY) - 1)
    top[m] = np.array(CANOPY)[tone[m]]
    side[m] = EARTH
    trees = m & (rng.random((N, N)) < 0.22)
    grow = rng.integers(1, 3, size=(N, N))
    height[trees] += grow[trees]
    top[trees] = np.array(CANOPY)[(tone[trees] + 1) % len(CANOPY)] * 0.9
    cap[m] = 1
    cap[trees] = grow[trees] + 1
    rocks = m & ~trees & (r < 0.035)
    top[rocks] = (122, 120, 116)
    side[rocks] = (104, 102, 100)
    cap[rocks] = 2

    # jungle floor: grass and dirt patches with a few flowers
    m = cls == GROUND
    top[m] = lerp((92, 132, 62), (130, 104, 66), (n2[m] > 0.62).astype(float) * 0.8)
    side[m] = EARTH
    flowers = m & (r < 0.025)
    top[flowers] = np.array([(236, 214, 80), (230, 130, 170), (240, 240, 230)])[rng.integers(0, 3, flowers.sum())]

    # brush: tall grass with uneven tufts
    m = cls == BRUSH
    top[m] = lerp((62, 146, 84), (88, 168, 92), n2[m])
    side[m] = (52, 112, 64)
    tufts = m & (r < 0.35)
    height[tufts] += 1
    cap[m] = 1
    cap[tufts] = 2

    # lanes: checker stone tiles, darker worn shoulders
    m = cls == LANE
    ii, jj = np.meshgrid(np.arange(N), np.arange(N), indexing="ij")
    checker = ((ii // 3 + jj // 3) % 2).astype(float)
    top[m] = lerp((182, 166, 124), (168, 152, 112), checker[m])
    shoulder = m & (lane_d > LANE_RADIUS - 1.4 * CELL)
    top[shoulder] = (140, 124, 92)
    cracks = m & (r < 0.03)
    top[cracks] = (128, 114, 86)
    side[m] = (126, 108, 80)

    # river: deep channel, light shallows, rocks and lily pads
    m = cls == RIVER_C
    depth = np.clip(1 - river_d / RIVER_RADIUS, 0, 1)
    top[m] = lerp((92, 168, 196), (40, 92, 150), depth[m] ** 0.7)
    side[m] = (48, 88, 120)
    stones = m & (r < 0.012) & (depth < 0.6)
    height[stones] = 2
    top[stones] = (128, 132, 136)
    side[stones] = (100, 104, 108)
    pads = m & ~stones & (r > 0.988)
    top[pads] = (70, 150, 70)

    # Baron and Dragon pits: patterned floor inside a raised rock rim
    for name, floor, rim in (("Baron_Pit", (98, 82, 126), (84, 70, 104)),
                             ("Dragon_Pit", (134, 100, 76), (112, 80, 60))):
        d = dist_to(OBJECTIVES[name])
        m = (cls == PIT) & (d <= PIT_RADIUS)
        ring = ((d / CELL).astype(int) % 3 == 0).astype(float)
        top[m] = lerp(floor, np.array(floor) * 1.15, ring[m])
        side[m] = rim
        rim_m = m & (d > PIT_RADIUS - 1.6 * CELL)
        height[rim_m] = 2 + (r[rim_m] < 0.4)
        top[rim_m] = rim
        cap[rim_m] = 1

    # bases: tiled floor with grout lines, glowing fountains, stone ramparts
    for team in ("Blue", "Red"):
        t = TEAM[team]
        m = cls == t["base"]
        grout = ((ii % 5 == 0) | (jj % 5 == 0)).astype(float)
        top[m] = lerp(t["tile"], np.array(t["tile"]) * 0.82, grout[m])
        side[m] = np.array(t["tile"]) * 0.7
        m = cls == t["fountain"]
        centre = FOUNTAIN if team == "Blue" else mirror(FOUNTAIN)
        d = dist_to(centre)
        top[m] = t["glow"]
        side[m] = np.array(t["glow"]) * 0.75
        rim_m = m & (d > 450 - 1.2 * CELL)
        top[rim_m] = t["trim"]
        core = m & (d < 1.6 * CELL)
        height[core] = 4
        top[core] = (240, 250, 255)
    m = cls == BASE_WALL
    top[m] = lerp((150, 150, 156), (124, 124, 132), n2[m])
    side[m] = (118, 118, 126)
    crenel = m & ((ii + jj) % 2 == 0)
    height[crenel] += 1

    # outer cliffs: mossy stone
    m = cls == EDGE
    height[m] += (r[m] < 0.3)
    top[m] = lerp((112, 116, 110), (70, 110, 60), (n2[m] > 0.5).astype(float))
    side[m] = (96, 92, 88)

    # per-voxel pixel noise so large areas don't look flat
    top = top + rng.integers(-7, 8, size=(N, N, 1))
    return cls, height, np.clip(top, 0, 255).astype(int), np.clip(side, 0, 255).astype(int), cap


# --- meshing ---------------------------------------------------------------------

class Mesh:
    def __init__(self):
        self.pos, self.nrm, self.col, self.idx = [], [], [], []

    def quad(self, corners, normal, rgb):
        base = len(self.pos)
        self.pos.extend(corners)
        self.nrm.extend([normal] * 4)
        self.col.extend([tuple(int(c) for c in rgb) + (255,)] * 4)
        self.idx.extend([base, base + 1, base + 2, base, base + 2, base + 3])

    def cube_face(self, x, y, z, face, rgb, size=1):
        """Voxel of side `size` with its min corner at model coords (x, y, z), y up.
        face in +x -x +y -y +z -z."""
        X0, Y0, Z0, X1, Y1, Z1 = x, y, z, x + size, y + size, z + size
        f = {
            "+y": ([(X0, Y1, Z0), (X0, Y1, Z1), (X1, Y1, Z1), (X1, Y1, Z0)], (0, 1, 0)),
            "-y": ([(X0, Y0, Z0), (X1, Y0, Z0), (X1, Y0, Z1), (X0, Y0, Z1)], (0, -1, 0)),
            "+x": ([(X1, Y0, Z0), (X1, Y1, Z0), (X1, Y1, Z1), (X1, Y0, Z1)], (1, 0, 0)),
            "-x": ([(X0, Y0, Z0), (X0, Y0, Z1), (X0, Y1, Z1), (X0, Y1, Z0)], (-1, 0, 0)),
            "+z": ([(X0, Y0, Z1), (X1, Y0, Z1), (X1, Y1, Z1), (X0, Y1, Z1)], (0, 0, 1)),
            "-z": ([(X0, Y0, Z0), (X0, Y1, Z0), (X1, Y1, Z0), (X1, Y0, Z0)], (0, 0, -1)),
        }[face]
        self.quad(f[0], f[1], rgb)


def to_model(i, j):
    """Grid column i (east) / row j (north) -> model x, z. North is -z, origin at map centre."""
    return i - N / 2, (N / 2) - j - 1


def terrain_mesh(height, top, side, cap):
    rng = np.random.default_rng(SEED + 1)
    m = Mesh()
    padded = np.pad(height, 1, constant_values=0)
    for i in range(N):
        for j in range(N):
            h = int(height[i, j])
            x, z = to_model(i, j)
            m.cube_face(x, h - 1, z, "+y", top[i, j])
            # neighbours: east (+x) is i+1, west i-1, north (-z) is j+1, south (+z) j-1
            for face, (di, dj) in (("+x", (1, 0)), ("-x", (-1, 0)), ("-z", (0, 1)), ("+z", (0, -1))):
                nh = int(padded[i + 1 + di, j + 1 + dj])
                for y in range(nh, h):
                    rgb = top[i, j] if y >= h - cap[i, j] else side[i, j]
                    shade = 0.82 if face in ("+x", "-x") else 0.92
                    rgb = np.clip(np.array(rgb) * shade + rng.integers(-5, 6), 0, 255)
                    m.cube_face(x, y, z, face, rgb)
    return m


DIRS = {"+x": (1, 0, 0), "-x": (-1, 0, 0), "+y": (0, 1, 0), "-y": (0, -1, 0), "+z": (0, 0, 1), "-z": (0, 0, -1)}


def voxel_object(voxels, scale=1.0, offset=(0, 0, 0)):
    """voxels: dict {(x, y, z): rgb} on an integer grid -> Mesh with hidden faces removed.
    Each voxel becomes a cube of side `scale` placed at offset + (x, y, z) * scale."""
    m = Mesh()
    for (x, y, z), rgb in voxels.items():
        for face, (dx, dy, dz) in DIRS.items():
            if (x + dx, y + dy, z + dz) not in voxels:
                shade = {"+y": 1.0, "-y": 0.6, "+x": 0.8, "-x": 0.8}.get(face, 0.9)
                m.cube_face(offset[0] + x * scale, offset[1] + y * scale, offset[2] + z * scale, face,
                            np.clip(np.array(rgb) * shade, 0, 255).astype(int), scale)
    return m


def grid_index(p):
    return min(N - 1, int(p[0] / CELL)), min(N - 1, int(p[1] / CELL))


class Voxels(dict):
    """Voxel sculpting helpers. Coordinates are in terrain-voxel units; the model is stored
    on a grid `res` times finer, so monsters get more detail than the terrain.
    The front of a model faces +x."""

    def __init__(self, res=1):
        super().__init__()
        self.res = res

    def _fill(self, x0, x1, y0, y1, z0, z1, rgb):
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                for z in range(z0, z1 + 1):
                    self[(x, y, z)] = rgb

    def box(self, x0, x1, y0, y1, z0, z1, rgb):
        r = self.res
        self._fill(x0 * r, (x1 + 1) * r - 1, y0 * r, (y1 + 1) * r - 1, z0 * r, (z1 + 1) * r - 1, rgb)

    def put(self, pts, rgb):
        """Whole terrain-sized voxels."""
        for x, y, z in pts:
            self.box(x, x, y, y, z, z, rgb)

    def fine(self, pts, rgb):
        """Single fine voxels at terrain-unit coordinates (e.g. 3.5 = second half of voxel 3)."""
        for x, y, z in pts:
            self[(int(np.floor(x * self.res)), int(np.floor(y * self.res)), int(np.floor(z * self.res)))] = rgb

    def blob(self, c, r, rgb, under=None):
        """Ellipsoid centred at c with radii r. `under` = (y, rgb) recolours the part below y."""
        k = self.res
        for x in range(int(np.floor((c[0] - r[0]) * k)), int(np.ceil((c[0] + r[0]) * k)) + 1):
            for y in range(max(0, int(np.floor((c[1] - r[1]) * k))), int(np.ceil((c[1] + r[1]) * k)) + 1):
                for z in range(int(np.floor((c[2] - r[2]) * k)), int(np.ceil((c[2] + r[2]) * k)) + 1):
                    px, py, pz = (x + 0.5) / k, (y + 0.5) / k, (z + 0.5) / k
                    if ((px - c[0]) / r[0]) ** 2 + ((py - c[1]) / r[1]) ** 2 + ((pz - c[2]) / r[2]) ** 2 <= 1:
                        self[(x, y, z)] = under[1] if under and py <= under[0] else rgb

    def speckle(self, rgb, chance, rng, only=None):
        for key, v in list(self.items()):
            if (only is None or v == only) and rng.random() < chance:
                self[key] = rgb


def structure(kind, team, p, height):
    i, j = grid_index(p)
    ground = int(height[i, j])
    cx, cz = to_model(i, j)
    cx, cz = int(cx), int(cz)
    t = TEAM[team]
    v = Voxels()
    if kind == "Turret":
        v.box(-1, 1, 0, 0, -1, 1, t["trim"])
        v.box(-1, 1, 1, 4, -1, 1, STONE)
        v.box(-1, 1, 5, 5, -1, 1, t["trim"])
        v.box(0, 0, 6, 7, 0, 0, t["crystal"])
    elif kind == "Inhibitor":
        v.box(-1, 1, 0, 0, -1, 1, STONE)
        v.box(-1, 1, 1, 1, -1, 1, t["crystal"])
        v.box(0, 0, 2, 2, 0, 0, t["crystal"])
    elif kind == "Nexus":
        v.box(-2, 2, 0, 0, -2, 2, STONE)
        v.box(-2, 2, 1, 1, -2, 2, t["trim"])
        v.box(-1, 1, 2, 4, -1, 1, t["crystal"])
        v.box(0, 0, 5, 6, 0, 0, t["crystal"])
    placed = {(cx + x, ground + y, cz + z): rgb for (x, y, z), rgb in v.items()}
    return voxel_object(placed), (cx + 0.5, ground, cz + 0.5)


# --- monsters --------------------------------------------------------------------
# Built at MONSTER_RES voxels per terrain voxel; coordinates below are terrain units,
# origin on the ground at the camp centre, facing +x.

MONSTER_RES = 2
EYE = (255, 226, 90)
PUPIL = (40, 20, 20)


def baron(rng):
    v = Voxels(MONSTER_RES)
    dark, body, light, glow, belly = (74, 40, 104), (116, 60, 154), (146, 82, 186), (214, 124, 244), (176, 120, 196)
    v.blob((-2.5, 1.0, 0), (4.8, 1.6, 4.0), dark)                     # coiled tail on the pit floor
    v.blob((-0.4, 4.0, 0), (2.6, 3.4, 2.4), body, under=(2.2, dark))  # rising body
    v.blob((0.9, 4.0, 0), (1.8, 2.8, 1.6), belly)                     # lighter underside
    v.blob((1.4, 7.6, 0), (2.9, 2.0, 2.4), light)                     # head
    v.blob((3.6, 6.9, 0), (1.0, 0.8, 1.6), (226, 86, 150))            # open mouth
    v.fine([(3.5, 7.5, z) for z in (-1.5, -0.5, 0, 1.0)], (250, 240, 230))  # teeth
    v.fine([(3.5, 8.5, -1.5), (3.5, 8.5, 1.0), (4.0, 8.5, -1.5), (4.0, 8.5, 1.0)], EYE)
    for s in (-1, 1):                                                   # curved horns
        for k, (x, y) in enumerate(((0, 9.5), (-0.5, 10), (-1, 10.5), (-1.5, 11), (-2, 11), (-2.5, 10.5))):
            v.fine([(x, y, s * 1.6), (x, y, s * 1.6 - 0.5 * s)], dark if k < 5 else glow)
    for k in range(6):                                                  # spikes down the back
        v.fine([(-2.4 - k * 0.3, 8 - k, 0), (-2.9 - k * 0.3, 8 - k, 0), (-2.9 - k * 0.3, 8.5 - k, 0)], dark)
    for dz, dx in ((-4.5, -1.5), (4.5, -1.5), (-3.5, 2.5), (3.5, 2.5), (0, -5.5)):  # tentacles
        for y in range(4):
            v.fine([(dx, y * 0.5, dz), (dx + 0.5, y * 0.5, dz)], dark)
        v.fine([(dx, 2, dz), (dx + 0.5, 2, dz)], glow)
    v.speckle(glow, 0.05, rng, only=body)
    return v


def dragon(rng):
    v = Voxels(MONSTER_RES)
    scale, belly, wing, membrane, horn = (198, 92, 50), (240, 172, 92), (146, 52, 40), (220, 120, 70), (236, 222, 190)
    v.blob((0, 2.8, 0), (2.7, 1.7, 1.7), scale, under=(2.2, belly))   # body
    v.blob((2.3, 3.9, 0), (1.0, 1.1, 0.8), scale)                     # neck
    v.blob((3.5, 4.7, 0), (1.3, 0.9, 0.9), scale)                     # head
    v.blob((4.7, 4.4, 0), (0.7, 0.5, 0.6), scale)                     # snout
    v.fine([(5.0, 4.5, -0.5), (5.0, 4.5, 0)], PUPIL)                  # nostrils
    v.fine([(4.0, 5.0, -1.0), (4.0, 5.0, 0.5)], EYE)
    for s in (-0.5, 0.0):                                             # horns sweeping back
        z = s * 2.5 if s else 0.75
        v.fine([(3.0, 5.5, z), (2.5, 6.0, z), (2.0, 6.5, z)], horn)
    for s in (-1, 1):                                                 # wings: bone edge + membrane
        for k in range(10):
            zz = s * (1.5 + k * 0.5)
            span = max(0, 4 - k // 2)
            for t in range(span * 2):
                x = 1.0 - t * 0.5 - k * 0.2
                y = 4.0 + k * 0.25
                v.fine([(x, y, zz)], wing if t == 0 else membrane)
        for lx in (-1.0, 1.0):                                        # legs with claws
            v.box(int(lx), int(lx), 0, 1, s, s, scale)
            v.fine([(lx + 1, 0, s), (lx + 1, 0, s + 0.5)], horn)
    for k in range(9):                                                # tail
        v.fine([(-2.5 - k * 0.5, 2.5 - k * 0.2, 0), (-2.5 - k * 0.5, 2.5 - k * 0.2, -0.5)], scale)
    v.fine([(-7.0, 0.5, 0), (-7.0, 1.0, 0), (-7.5, 0.5, 0)], (255, 140, 60))
    for k in range(8):                                                # spine ridge
        v.fine([(1.5 - k * 0.5, 4.5, 0)], wing)
    return v


def blue_sentinel(rng):
    v = Voxels(MONSTER_RES)
    stone, rock, crystal, glow = (104, 114, 138), (82, 90, 110), (80, 182, 255), (180, 230, 255)
    for s in (-1, 1):
        v.blob((0, 0.9, s * 1.1), (0.7, 1.0, 0.6), rock)                # legs
        v.blob((0.6, 3.0, s * 2.6), (0.8, 1.4, 0.7), rock)              # big arms
        v.blob((1.0, 1.5, s * 2.6), (0.9, 0.6, 0.8), stone)             # fists
    v.blob((0, 3.4, 0), (1.9, 1.7, 2.1), stone)                         # torso
    v.blob((1.6, 4.9, 0), (0.9, 0.7, 0.9), stone)                       # head
    v.fine([(2.5, 5.0, -0.5), (2.5, 5.0, 0.0)], glow)                   # eyes
    for x, y, z in ((-1, 5, 0), (-1, 5.5, 0), (-1, 6, 0), (-1, 6.5, 0), (-1.5, 5.5, -0.5),
                    (-1.5, 6, 0.5), (-0.5, 5.5, 0.5), (-1, 7, 0), (-2, 5, 0)):  # crystal cluster on its back
        v.fine([(x, y, z), (x + 0.5, y, z)], crystal)
    v.fine([(-1, 7.5, 0)], glow)
    v.speckle((140, 200, 240), 0.05, rng, only=stone)
    return v


def red_brambleback(rng):
    v = Voxels(MONSTER_RES)
    hide, dark, thorn, tip = (156, 62, 42), (110, 42, 30), (210, 70, 40), (255, 150, 70)
    for lx in (-1.2, 1.0):
        for s in (-1, 1):
            v.blob((lx, 0.7, s * 1.0), (0.5, 0.8, 0.5), dark)           # legs
    v.blob((-0.2, 2.6, 0), (2.4, 1.6, 1.7), hide)                       # body
    v.blob((2.2, 2.6, 0), (1.1, 1.0, 1.0), hide)                        # head
    v.fine([(3.0, 3.0, -0.6), (3.0, 3.0, 0.5)], EYE)
    v.fine([(3.5, 2.0, -0.7), (3.5, 2.5, -0.7), (3.5, 2.0, 0.6), (3.5, 2.5, 0.6)], (236, 226, 200))  # tusks
    for x, z in ((-2, 0), (-1.5, -1), (-1, 0.5), (-0.5, -0.5), (0, 0.8), (0.5, -1), (1, 0), (-1, -1.4), (0.2, 1.4)):
        v.fine([(x, 4.0, z)], thorn)                                     # thorns along the back
        v.fine([(x, 4.5, z)], tip)
    v.speckle(dark, 0.08, rng, only=hide)
    return v


def gromp(rng):
    v = Voxels(MONSTER_RES)
    skin = (92, 122, 58)
    v.blob((0, 1.5, 0), (2.0, 1.5, 1.9), skin, under=(0.9, (150, 168, 96)))
    v.blob((1.6, 2.6, -0.8), (0.4, 0.4, 0.4), EYE)
    v.blob((1.6, 2.6, 0.8), (0.4, 0.4, 0.4), EYE)
    v.speckle((70, 96, 44), 0.12, rng, only=skin)
    return v


def critter(v, ox, oz, size, body, head, accent=None):
    """Small four-legged camp monster (wolf, raptor) at local offset (ox, oz)."""
    v.blob((ox, 0.8 + size * 0.5, oz), (1.1 * size, 0.55 * size, 0.55 * size), body)
    v.blob((ox + 1.2 * size, 0.9 + size * 0.9, oz), (0.5 * size, 0.4 * size, 0.4 * size), head)
    if accent:
        v.fine([(ox + 1.2 * size, 1.4 + size * 0.9, oz)], accent)
    for lx in (-0.5 * size, 0.5 * size):
        for lz in (-0.25 * size, 0.25 * size):
            v.fine([(ox + lx, 0, oz + lz), (ox + lx, 0.5, oz + lz)], body)


def wolves(rng):
    v = Voxels(MONSTER_RES)
    critter(v, 0, 0, 1.6, (88, 90, 108), (70, 72, 90), (190, 190, 210))
    critter(v, -2.8, -2, 1.0, (100, 100, 116), (80, 80, 96))
    critter(v, -2.8, 2, 1.0, (100, 100, 116), (80, 80, 96))
    return v


def raptors(rng):
    v = Voxels(MONSTER_RES)
    critter(v, 0, 0, 1.4, (226, 224, 232), (214, 60, 60), (240, 90, 60))
    for ox, oz in ((-2.5, -1.8), (-2.5, 1.8), (-1.5, -3.5), (-1.5, 3.5), (-4.2, 0)):
        critter(v, ox, oz, 0.8, (214, 212, 222), (200, 60, 60))
    return v


def krugs(rng):
    v = Voxels(MONSTER_RES)
    rock, lava = (128, 108, 88), (255, 140, 50)
    v.blob((0, 1.6, 0), (1.8, 1.6, 1.8), rock)
    v.blob((-2.6, 0.9, 2), (1, 0.9, 1), rock)
    v.speckle(lava, 0.1, rng, only=rock)
    v.fine([(1.5, 2.0, -0.5), (1.5, 2.0, 0.5)], EYE)
    return v


def scuttle(rng):
    v = Voxels(MONSTER_RES)
    shell, leg = (84, 172, 168), (214, 150, 170)
    v.blob((0, 1.0, 0), (1.6, 0.7, 1.3), shell)
    v.blob((0, 1.6, 0), (0.8, 0.4, 0.7), (240, 200, 220))
    for x, z in ((-0.5, -1.5), (0.5, -1.5), (-0.5, 1.5), (0.5, 1.5)):
        v.fine([(x, 0, z), (x, 0.5, z)], leg)
    v.fine([(1.5, 1.0, -0.5), (1.5, 1.0, 0.5)], EYE)
    return v


MONSTERS = {"Baron": baron, "Dragon": dragon, "Blue_Sentinel": blue_sentinel,
            "Red_Brambleback": red_brambleback, "Gromp": gromp, "Murk_Wolves": wolves,
            "Raptors": raptors, "Krugs": krugs, "Scuttle": scuttle}


def facing_rotation(p):
    """Turn a +x-facing model toward the map centre, in 90 degree steps (model coords)."""
    dx, dy = CENTER[0] - p[0], CENTER[1] - p[1]
    if abs(dx) >= abs(dy):
        return (lambda x, z: (x, z)) if dx > 0 else (lambda x, z: (-x, -z))
    return (lambda x, z: (z, -x)) if dy > 0 else (lambda x, z: (-z, x))


def monster(kind, p, height, seed):
    i, j = grid_index(p)
    ground = int(height[i, j])
    cx, cz = to_model(i, j)
    rot = facing_rotation(p)
    placed = {}
    for (x, y, z), rgb in MONSTERS[kind](np.random.default_rng(seed)).items():
        rx, rz = rot(x + 0.5, z + 0.5)          # rotate voxel centres, then snap back to the grid
        placed[(int(round(rx - 0.5)), y, int(round(rz - 0.5)))] = rgb
    origin = (cx + 0.5, ground, cz + 0.5)
    return voxel_object(placed, 1 / MONSTER_RES, origin), origin


# --- glTF writer -----------------------------------------------------------------

def write_glb(path, named_meshes):
    """named_meshes: list of (name, Mesh). Each becomes a node; vertex colours, flat normals."""
    bin_chunks, buffer_views, accessors, meshes, nodes = [], [], [], [], []
    offset = 0

    def add(data, target, comp, count, typ, normalized=False, minmax=None):
        nonlocal offset
        raw = data.tobytes()
        pad = (-len(raw)) % 4
        bin_chunks.append(raw + b"\0" * pad)
        buffer_views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(raw), "target": target})
        offset += len(raw) + pad
        acc = {"bufferView": len(buffer_views) - 1, "componentType": comp, "count": count, "type": typ}
        if normalized:
            acc["normalized"] = True
        if minmax:
            acc["min"], acc["max"] = minmax
        accessors.append(acc)
        return len(accessors) - 1

    material = {"name": "Voxel", "pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, 1],
                "metallicFactor": 0, "roughnessFactor": 1}}
    for name, m in named_meshes:
        pos = np.array(m.pos, np.float32)
        a_pos = add(pos, 34962, 5126, len(pos), "VEC3", minmax=(pos.min(0).tolist(), pos.max(0).tolist()))
        a_nrm = add(np.array(m.nrm, np.float32), 34962, 5126, len(pos), "VEC3")
        a_col = add(np.array(m.col, np.uint8), 34962, 5121, len(pos), "VEC4", normalized=True)
        idx = np.array(m.idx, np.uint32)
        a_idx = add(idx, 34963, 5125, len(idx), "SCALAR")
        meshes.append({"name": name, "primitives": [{"attributes": {"POSITION": a_pos, "NORMAL": a_nrm, "COLOR_0": a_col},
                                                       "indices": a_idx, "material": 0}]})
        nodes.append({"name": name, "mesh": len(meshes) - 1})

    gltf = {"asset": {"version": "2.0", "generator": "MCADDOON build_rift.py"},
            "scene": 0, "scenes": [{"name": "SummonersRift", "nodes": list(range(len(nodes)))}],
            "nodes": nodes, "meshes": meshes, "materials": [material],
            "accessors": accessors, "bufferViews": buffer_views, "buffers": [{"byteLength": offset}]}
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * ((-len(js)) % 4)
    binary = b"".join(bin_chunks)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binary)))
        f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
        f.write(struct.pack("<II", len(binary), 0x004E4942) + binary)


# --- main ------------------------------------------------------------------------

def model_point(p, height=None):
    i, j = grid_index(p)
    x, z = to_model(i, j)
    y = int(height[i, j]) if height is not None else 0
    return [round(x + 0.5, 2), y, round(z + 0.5, 2)]


def main(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    cls, height, top, side, cap = build_terrain()
    meshes = [("Terrain", terrain_mesh(height, top, side, cap))]
    structures, monsters = [], []

    def place(kind, team, name, p):
        mesh, origin = structure(kind, team, p, height)
        node = f"{kind}_{team}_{name}" if name else f"{kind}_{team}"
        meshes.append((node, mesh))
        structures.append({"node": node, "kind": kind, "team": team, "game_pos": [round(p[0]), round(p[1])],
                           "model_pos": [origin[0], origin[1], origin[2]]})

    def spawn(kind, node, side_name, p):
        mesh, origin = monster(kind, p, height, SEED + len(monsters))
        meshes.append((node, mesh))
        monsters.append({"node": node, "kind": kind, "side": side_name, "game_pos": [round(p[0]), round(p[1])],
                         "model_pos": [origin[0], origin[1], origin[2]]})

    for team, f in (("Blue", lambda p: p), ("Red", mirror)):
        for name, p in BLUE_TURRETS.items():
            place("Turret", team, name, f(p))
        for name, p in BLUE_INHIBITORS.items():
            place("Inhibitor", team, name, f(p))
        place("Nexus", team, "", f(BLUE_NEXUS))
        for name, p in BLUE_CAMPS.items():
            spawn(name, f"Monster_{name}_{team}", team, f(p))
    spawn("Baron", "Monster_Baron", "Neutral", OBJECTIVES["Baron_Pit"])
    spawn("Dragon", "Monster_Dragon", "Neutral", OBJECTIVES["Dragon_Pit"])
    spawn("Scuttle", "Monster_Scuttle_Top", "Neutral", OBJECTIVES["Scuttle_Top"])
    spawn("Scuttle", "Monster_Scuttle_Bot", "Neutral", OBJECTIVES["Scuttle_Bot"])

    write_glb(os.path.join(out_dir, "summoners_rift.glb"), meshes)

    camps = [{"name": n, "side": "Blue", "game_pos": list(p), "model_pos": model_point(p, height),
              "node": f"Monster_{n}_Blue"} for n, p in BLUE_CAMPS.items()]
    camps += [{"name": n, "side": "Red", "game_pos": [round(v) for v in mirror(p)],
               "model_pos": model_point(mirror(p), height), "node": f"Monster_{n}_Red"} for n, p in BLUE_CAMPS.items()]
    data = {
        "description": "Summoner's Rift voxel map. Model units: 1 = one voxel; y is up, north (red side) is -z.",
        "game_units_per_voxel": round(CELL, 3), "grid_size": N, "map_game_units": W,
        "lanes": {name: {"game": pts, "model": [model_point(p, height) for p in pts]} for name, pts in LANES.items()},
        "river": {"game": RIVER, "model": [model_point(p, height) for p in RIVER]},
        "fountains": {"Blue": model_point(FOUNTAIN, height), "Red": model_point(mirror(FOUNTAIN), height)},
        "objectives": {n: {"game_pos": list(p), "model_pos": model_point(p, height)} for n, p in OBJECTIVES.items()},
        "jungle_camps": camps,
        "monsters": monsters,
        "structures": structures,
    }
    with open(os.path.join(out_dir, "map_data.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1)
    tris = sum(len(m.idx) for _, m in meshes) // 3
    print(f"{len(meshes)} nodes, {tris} triangles -> {out_dir}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__)))
