"""Generate a voxel (pixel-art 3D) model of Summoner's Rift for the manager game.

Usage: python3 build_rift.py [OUT_DIR]

Writes:
  summoners_rift.glb   terrain mesh + one named node per structure
                       (Turret_Blue_Top_Outer, Inhibitor_Red_Mid, Nexus_Blue, ...)
                       so the game can hide a structure when it is destroyed.
  map_data.json        lane waypoints, structures, jungle camps and objectives in
                       both Leaguepedia/game coordinates and model coordinates.

Layout follows the real map in game units (0..14870 on each axis, blue base at the
bottom-left, red base at the top-right). The red half is the blue half mirrored
through the map centre, so both sides are identical.
"""
import json, os, struct, sys

import numpy as np

W = 14870.0          # map size in game units
N = 160              # voxels per side
CELL = W / N         # game units per voxel
SEED = 7

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

WALL, GROUND, LANE, RIVER_C, PIT, BRUSH, BASE_B, BASE_R, FOUNT_B, FOUNT_R = range(10)
HEIGHT = {WALL: 5, GROUND: 2, LANE: 2, RIVER_C: 1, PIT: 1, BRUSH: 3,
          BASE_B: 3, BASE_R: 3, FOUNT_B: 3, FOUNT_R: 3}

# (top colour, side colour) as RGB 0..255
PALETTE = {
    WALL:    ((52, 104, 58), (92, 70, 48)),
    GROUND:  ((96, 128, 66), (110, 84, 56)),
    LANE:    ((176, 160, 118), (128, 110, 80)),
    RIVER_C: ((58, 118, 170), (48, 92, 132)),
    PIT:     ((96, 84, 120), (70, 62, 90)),
    BRUSH:   ((70, 150, 90), (54, 118, 70)),
    BASE_B:  ((120, 140, 168), (88, 100, 124)),
    BASE_R:  ((168, 128, 120), (124, 92, 86)),
    FOUNT_B: ((96, 196, 230), (70, 150, 190)),
    FOUNT_R: ((236, 120, 96), (190, 86, 70)),
}
TEAM = {"Blue": {"base": BASE_B, "fountain": FOUNT_B, "crystal": (70, 170, 255), "trim": (40, 70, 140)},
        "Red": {"base": BASE_R, "fountain": FOUNT_R, "crystal": (255, 80, 70), "trim": (140, 40, 40)}}
STONE = (150, 150, 158)


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


def disc(p, r):
    return np.hypot(X - p[0], Y - p[1]) <= r


def both_sides(points):
    return list(points) + [mirror(p) for p in points]


def build_terrain():
    cls = np.full((N, N), WALL)
    for path in BLUE_JUNGLE_PATHS:
        cls[dist_to_polyline(path) <= PATH_RADIUS] = GROUND
        cls[dist_to_polyline([mirror(p) for p in path]) <= PATH_RADIUS] = GROUND
    for p in both_sides(BLUE_CAMPS.values()):
        cls[disc(p, CAMP_RADIUS)] = GROUND
    cls[dist_to_polyline(RIVER) <= RIVER_RADIUS] = RIVER_C
    for name in ("Baron_Pit", "Dragon_Pit"):
        cls[disc(OBJECTIVES[name], PIT_RADIUS)] = PIT
    for p in both_sides(BLUE_BRUSH):
        cls[disc(p, BRUSH_RADIUS) & (cls != RIVER_C) & (cls != PIT)] = BRUSH
    for path in LANES.values():
        cls[dist_to_polyline(path) <= LANE_RADIUS] = LANE
    cls[disc(BASE_CENTER, BASE_RADIUS)] = BASE_B
    cls[disc(mirror(BASE_CENTER), BASE_RADIUS)] = BASE_R
    cls[disc(FOUNTAIN, 450)] = FOUNT_B
    cls[disc(mirror(FOUNTAIN), 450)] = FOUNT_R
    # outer cliff ring keeps the edge of the map closed
    edge = np.zeros((N, N), bool)
    edge[:2, :] = edge[-2:, :] = edge[:, :2] = edge[:, -2:] = True
    cls[edge] = WALL

    height = np.vectorize(HEIGHT.get)(cls)
    rng = np.random.default_rng(SEED)
    # trees: random taller columns inside walls, never on the outermost cliff
    trees = (cls == WALL) & (rng.random((N, N)) < 0.18) & ~edge
    height[trees] += rng.integers(1, 3, size=(N, N))[trees]
    height[edge] = 7
    return cls, height


# --- meshing ---------------------------------------------------------------------

class Mesh:
    def __init__(self):
        self.pos, self.nrm, self.col, self.idx = [], [], [], []

    def quad(self, corners, normal, rgb):
        base = len(self.pos)
        self.pos.extend(corners)
        self.nrm.extend([normal] * 4)
        self.col.extend([tuple(rgb) + (255,)] * 4)
        self.idx.extend([base, base + 1, base + 2, base, base + 2, base + 3])

    def cube_face(self, x, y, z, face, rgb):
        """Unit voxel at model coords (x, y, z), y up. face in +x -x +y -y +z -z."""
        X0, Y0, Z0, X1, Y1, Z1 = x, y, z, x + 1, y + 1, z + 1
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


def jitter(rgb, rng, amount=10):
    return np.clip(np.array(rgb) + rng.integers(-amount, amount + 1), 0, 255).astype(int)


def terrain_mesh(cls, height):
    rng = np.random.default_rng(SEED + 1)
    m = Mesh()
    padded = np.pad(height, 1, constant_values=0)
    for i in range(N):
        for j in range(N):
            h = int(height[i, j])
            top, side = PALETTE[cls[i, j]]
            if cls[i, j] == WALL and h > HEIGHT[WALL]:
                top = (40, 92 + 6 * (h - 5), 48)  # tree canopy
            x, z = to_model(i, j)
            m.cube_face(x, h - 1, z, "+y", jitter(top, rng))
            # neighbours: east (+x) is i+1, west i-1, north (-z) is j+1, south (+z) j-1
            for face, (di, dj) in (("+x", (1, 0)), ("-x", (-1, 0)), ("-z", (0, 1)), ("+z", (0, -1))):
                nh = int(padded[i + 1 + di, j + 1 + dj])
                for y in range(nh, h):
                    rgb = top if y == h - 1 and cls[i, j] in (WALL, BRUSH) else side
                    shade = 0.82 if face in ("+x", "-x") else 0.92
                    m.cube_face(x, y, z, face, jitter(np.array(rgb) * shade, rng, 6))
    return m


def voxel_object(voxels):
    """voxels: dict {(x, y, z): rgb} in model coords -> Mesh with hidden faces removed."""
    m = Mesh()
    dirs = {"+x": (1, 0, 0), "-x": (-1, 0, 0), "+y": (0, 1, 0), "-y": (0, -1, 0), "+z": (0, 0, 1), "-z": (0, 0, -1)}
    for (x, y, z), rgb in voxels.items():
        for face, (dx, dy, dz) in dirs.items():
            if (x + dx, y + dy, z + dz) not in voxels:
                shade = {"+y": 1.0, "-y": 0.6, "+x": 0.8, "-x": 0.8}.get(face, 0.9)
                m.cube_face(x, y, z, face, np.clip(np.array(rgb) * shade, 0, 255).astype(int))
    return m


def grid_index(p):
    return min(N - 1, int(p[0] / CELL)), min(N - 1, int(p[1] / CELL))


def structure(kind, team, p, height):
    i, j = grid_index(p)
    ground = int(height[i, j])
    cx, cz = to_model(i, j)
    cx, cz = int(cx), int(cz)
    t = TEAM[team]
    v = {}

    def box(x0, x1, y0, y1, z0, z1, rgb):
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                for z in range(z0, z1 + 1):
                    v[(cx + x, ground + y, cz + z)] = rgb

    if kind == "Turret":
        box(-1, 1, 0, 0, -1, 1, t["trim"])
        box(-1, 1, 1, 4, -1, 1, STONE)
        box(-1, 1, 5, 5, -1, 1, t["trim"])
        box(0, 0, 6, 7, 0, 0, t["crystal"])
    elif kind == "Inhibitor":
        box(-1, 1, 0, 0, -1, 1, STONE)
        box(-1, 1, 1, 1, -1, 1, t["crystal"])
        box(0, 0, 2, 2, 0, 0, t["crystal"])
    elif kind == "Nexus":
        box(-2, 2, 0, 0, -2, 2, STONE)
        box(-2, 2, 1, 1, -2, 2, t["trim"])
        box(-1, 1, 2, 4, -1, 1, t["crystal"])
        box(0, 0, 5, 6, 0, 0, t["crystal"])
    return voxel_object(v), (cx + 0.5, ground, cz + 0.5)


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
    cls, height = build_terrain()
    meshes = [("Terrain", terrain_mesh(cls, height))]
    structures = []

    def place(kind, team, name, p):
        mesh, origin = structure(kind, team, p, height)
        node = f"{kind}_{team}_{name}" if name else f"{kind}_{team}"
        meshes.append((node, mesh))
        structures.append({"node": node, "kind": kind, "team": team, "game_pos": [round(p[0]), round(p[1])],
                           "model_pos": [origin[0], origin[1], origin[2]]})

    for team, f in (("Blue", lambda p: p), ("Red", mirror)):
        for name, p in BLUE_TURRETS.items():
            place("Turret", team, name, f(p))
        for name, p in BLUE_INHIBITORS.items():
            place("Inhibitor", team, name, f(p))
        place("Nexus", team, "", f(BLUE_NEXUS))

    write_glb(os.path.join(out_dir, "summoners_rift.glb"), meshes)

    camps = [{"name": n, "side": "Blue", "game_pos": list(p), "model_pos": model_point(p, height)}
             for n, p in BLUE_CAMPS.items()]
    camps += [{"name": n, "side": "Red", "game_pos": [round(v) for v in mirror(p)],
               "model_pos": model_point(mirror(p), height)} for n, p in BLUE_CAMPS.items()]
    data = {
        "description": "Summoner's Rift voxel map. Model units: 1 = one voxel; y is up, north (red side) is -z.",
        "game_units_per_voxel": round(CELL, 3), "grid_size": N, "map_game_units": W,
        "lanes": {name: {"game": pts, "model": [model_point(p, height) for p in pts]} for name, pts in LANES.items()},
        "river": {"game": RIVER, "model": [model_point(p, height) for p in RIVER]},
        "fountains": {"Blue": model_point(FOUNTAIN, height), "Red": model_point(mirror(FOUNTAIN), height)},
        "objectives": {n: {"game_pos": list(p), "model_pos": model_point(p, height)} for n, p in OBJECTIVES.items()},
        "jungle_camps": camps,
        "structures": structures,
    }
    with open(os.path.join(out_dir, "map_data.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1)
    tris = sum(len(m.idx) for _, m in meshes) // 3
    print(f"{len(meshes)} nodes, {tris} triangles -> {out_dir}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__)))
