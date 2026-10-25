"""Small mesh toolkit for build_rift.py: primitives, transforms, normals and a glTF writer.

Every primitive returns (positions (n, 3), triangle indices (m, 3)). Model.add() colours a
primitive, computes smooth or flat normals and files it under a material.
"""
import json, struct
from collections import defaultdict

import numpy as np

# --- transforms ------------------------------------------------------------------

def translate(x, y, z):
    m = np.eye(4)
    m[:3, 3] = (x, y, z)
    return m


def scale(sx, sy, sz):
    return np.diag([sx, sy, sz, 1.0])


def rot_y(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, 0, s, 0], [0, 1, 0, 0], [-s, 0, c, 0], [0, 0, 0, 1.0]])


def align_y(d):
    """Rotation taking +y onto direction d."""
    d = np.asarray(d, float)
    d = d / np.linalg.norm(d)
    y = np.array([0.0, 1.0, 0.0])
    v, c = np.cross(y, d), float(np.dot(y, d))
    m = np.eye(4)
    if np.linalg.norm(v) < 1e-9:
        if c < 0:
            m[:3, :3] = np.diag([1.0, -1.0, -1.0])
        return m
    k = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    m[:3, :3] = np.eye(3) + k + k @ k / (1 + c)
    return m


def apply(m, pos):
    return pos @ m[:3, :3].T + m[:3, 3]


# --- primitives ------------------------------------------------------------------

def frustum(r0, r1, h, seg=8, caps=True):
    """Cylinder / cone along +y from y=0 (radius r0) to y=h (radius r1)."""
    a = np.linspace(0, 2 * np.pi, seg, endpoint=False)
    ring = np.stack([np.cos(a), np.zeros(seg), np.sin(a)], -1)
    pos = np.concatenate([ring * r0, ring * r1 + [0, h, 0], [[0, 0, 0], [0, h, 0]]])
    idx = []
    for s in range(seg):
        t = (s + 1) % seg
        if r1 == 0:                      # cone: one triangle per side, apex at the top centre
            idx.append((s, 2 * seg + 1, t))
        else:
            idx += [(s, seg + s, t), (t, seg + s, seg + t)]
        if caps:
            idx.append((2 * seg, s, t))
            if r1 > 0:
                idx.append((2 * seg + 1, seg + t, seg + s))
    return pos, np.array(idx)


def icosphere(subdiv=0):
    t = (1 + 5 ** 0.5) / 2
    v = [(-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t),
         (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1)]
    f = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2),
         (10, 7, 6), (7, 1, 8), (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11),
         (6, 2, 10), (8, 6, 7), (9, 8, 1)]
    v = [np.array(p, float) / np.linalg.norm(p) for p in v]
    for _ in range(subdiv):
        cache, nf = {}, []

        def mid(a, b):
            key = (min(a, b), max(a, b))
            if key not in cache:
                p = v[a] + v[b]
                v.append(p / np.linalg.norm(p))
                cache[key] = len(v) - 1
            return cache[key]
        for a, b, c in f:
            ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
            nf += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
        f = nf
    return np.array(v), np.array(f)


def torus(R=1.0, r=0.15, seg=24, tube_seg=8):
    """Ring in the xz plane (axis +y), major radius R, tube radius r."""
    u = np.linspace(0, 2 * np.pi, seg, endpoint=False)
    v = np.linspace(0, 2 * np.pi, tube_seg, endpoint=False)
    U, V = np.meshgrid(u, v, indexing="ij")
    pos = np.stack([(R + r * np.cos(V)) * np.cos(U), r * np.sin(V), (R + r * np.cos(V)) * np.sin(U)], -1).reshape(-1, 3)
    idx = []
    for i in range(seg):
        for j in range(tube_seg):
            a, b = i * tube_seg + j, ((i + 1) % seg) * tube_seg + j
            c, d = i * tube_seg + (j + 1) % tube_seg, ((i + 1) % seg) * tube_seg + (j + 1) % tube_seg
            idx += [(a, c, b), (b, c, d)]
    return pos, np.array(idx)


def octahedron():
    pos = np.array([(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)], float)
    idx = np.array([(2, 4, 0), (2, 1, 4), (2, 5, 1), (2, 0, 5), (3, 0, 4), (3, 4, 1), (3, 1, 5), (3, 5, 0)])
    return pos, idx


# --- model container -------------------------------------------------------------

def vertex_normals(pos, idx):
    fn = np.cross(pos[idx[:, 1]] - pos[idx[:, 0]], pos[idx[:, 2]] - pos[idx[:, 0]])
    n = np.zeros_like(pos)
    for c in range(3):
        np.add.at(n, idx[:, c], fn)
    ln = np.linalg.norm(n, axis=1, keepdims=True)
    return n / np.where(ln == 0, 1, ln)


class Model:
    """Geometry grouped by material name. Colours are per vertex (RGB 0..255)."""

    def __init__(self, rng=None):
        self.parts = defaultdict(list)
        self.uvs = {}          # material -> TEXCOORD_0, for materials made of one textured part
        self.rng = rng if rng is not None else np.random.default_rng(0)

    def add(self, geo, rgb, material="Base", smooth=True, jitter=0, m=None, normals=None, double=False, uv=None):
        """double=True also adds the back faces (for thin cards such as leaves, grass and wings).
        uv: per-vertex texture coordinates (smooth parts only; one textured part per material)."""
        pos, idx = geo
        pos = np.asarray(pos, float)
        idx = np.asarray(idx, int).reshape(-1, 3)
        if m is not None:
            pos = apply(m, pos)
        rgb = np.asarray(rgb, float)
        if smooth:
            nrm = vertex_normals(pos, idx) if normals is None else np.broadcast_to(normals, pos.shape).copy()
            col = np.broadcast_to(rgb, pos.shape).copy() if rgb.ndim == 1 else rgb.copy()
            if jitter:
                col += self.rng.integers(-jitter, jitter + 1, size=(len(pos), 1))
        else:
            if rgb.ndim == 2:
                rgb = rgb[idx].mean(1)
            pos = pos[idx].reshape(-1, 3)
            fn = np.cross(pos[1::3] - pos[0::3], pos[2::3] - pos[0::3])
            fn /= np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-12)
            nrm = np.repeat(fn, 3, axis=0) if normals is None else np.broadcast_to(normals, pos.shape).copy()
            fc = np.broadcast_to(rgb, (len(idx), 3)).astype(float).copy()
            if jitter:
                fc += self.rng.integers(-jitter, jitter + 1, size=(len(idx), 1))
            col = np.repeat(fc, 3, axis=0)
            idx = np.arange(len(pos)).reshape(-1, 3)
        if uv is not None:
            assert smooth and not self.parts[material], "one textured part per material"
            self.uvs[material] = np.asarray(uv, float)
        self.parts[material].append((pos, nrm, np.clip(col, 0, 255), idx))
        if double:
            back = nrm if normals is not None else -nrm
            self.parts[material].append((pos, back, np.clip(col, 0, 255), idx[:, ::-1]))

    def extend(self, other):
        for mat, parts in other.parts.items():
            self.parts[mat].extend(parts)

    def transform(self, m):
        out = Model(self.rng)
        out.uvs = dict(self.uvs)
        r = m[:3, :3]
        for mat, parts in self.parts.items():
            for pos, nrm, col, idx in parts:
                n = nrm @ r.T
                out.parts[mat].append((apply(m, pos), n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12), col, idx))
        return out

    def merged(self):
        out = {}
        for mat, parts in self.parts.items():
            off, P, Nn, C, I = 0, [], [], [], []
            for pos, nrm, col, idx in parts:
                P.append(pos); Nn.append(nrm); C.append(col); I.append(idx + off)
                off += len(pos)
            out[mat] = (np.concatenate(P), np.concatenate(Nn), np.concatenate(C), np.concatenate(I), self.uvs.get(mat))
        return out

    def triangles(self):
        return sum(len(p[3]) for parts in self.parts.values() for p in parts)


# --- glTF writer -----------------------------------------------------------------

def srgb_to_linear(c):
    """glTF vertex colours and colour factors are linear; palettes here are written in sRGB."""
    c = np.asarray(c, float) / 255
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def write_glb(path, nodes, materials, images=()):
    """nodes: list of (name, Model). materials: {name: glTF material dict (without name)}.
    images: image files embedded in order; a material uses image k via {"baseColorTexture": {"index": k}}."""
    mat_names = sorted({mat for _, mdl in nodes for mat in mdl.parts})
    mat_index = {n: i for i, n in enumerate(mat_names)}
    bin_chunks, views, accessors, meshes, gnodes = [], [], [], [], []
    offset = 0

    def add(data, target, comp, typ, normalized=False, minmax=None):
        nonlocal offset
        raw = data.tobytes()
        pad = (-len(raw)) % 4
        bin_chunks.append(raw + b"\0" * pad)
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(raw), "target": target})
        offset += len(raw) + pad
        acc = {"bufferView": len(views) - 1, "componentType": comp, "count": len(data), "type": typ}
        if normalized:
            acc["normalized"] = True
        if minmax:
            acc["min"], acc["max"] = minmax
        accessors.append(acc)
        return len(accessors) - 1

    for name, mdl in nodes:
        prims = []
        for mat, (pos, nrm, col, idx, uv) in sorted(mdl.merged().items()):
            pos = pos.astype(np.float32)
            a_pos = add(pos, 34962, 5126, "VEC3", minmax=(pos.min(0).tolist(), pos.max(0).tolist()))
            a_nrm = add(nrm.astype(np.float32), 34962, 5126, "VEC3")
            rgba = np.concatenate([srgb_to_linear(col) * 255, np.full((len(col), 1), 255)], 1).round().astype(np.uint8)
            a_col = add(rgba, 34962, 5121, "VEC4", normalized=True)
            a_idx = add(idx.reshape(-1).astype(np.uint32), 34963, 5125, "SCALAR")
            attrs = {"POSITION": a_pos, "NORMAL": a_nrm, "COLOR_0": a_col}
            if uv is not None:
                attrs["TEXCOORD_0"] = add(uv.astype(np.float32), 34962, 5126, "VEC2")
            prims.append({"attributes": attrs, "indices": a_idx, "material": mat_index[mat]})
        meshes.append({"name": name, "primitives": prims})
        gnodes.append({"name": name, "mesh": len(meshes) - 1})

    gimages = []
    for file in images:
        raw = open(file, "rb").read()
        pad = (-len(raw)) % 4
        bin_chunks.append(raw + b"\0" * pad)
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(raw)})
        offset += len(raw) + pad
        mime = "image/jpeg" if file.lower().endswith((".jpg", ".jpeg")) else "image/png"
        gimages.append({"bufferView": len(views) - 1, "mimeType": mime})
    used = [materials[n] for n in mat_names]
    extensions = sorted({e for mat in used for e in mat.get("extensions", {})})
    gltf = {"asset": {"version": "2.0", "generator": "MCADDOON build_rift.py"},
            "scene": 0, "scenes": [{"name": "SummonersRift", "nodes": list(range(len(gnodes)))}],
            "nodes": gnodes, "meshes": meshes,
            "materials": [{"name": n, **materials[n]} for n in mat_names],
            "accessors": accessors, "bufferViews": views, "buffers": [{"byteLength": offset}]}
    if gimages:
        gltf["images"] = gimages
        gltf["samplers"] = [{"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071}]
        gltf["textures"] = [{"sampler": 0, "source": k} for k in range(len(gimages))]
    if extensions:
        gltf["extensionsUsed"] = extensions
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * ((-len(js)) % 4)
    binary = b"".join(bin_chunks)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binary)))
        f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
        f.write(struct.pack("<II", len(binary), 0x004E4942) + binary)
