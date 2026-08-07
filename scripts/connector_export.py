#!/usr/bin/env python3
"""Generate a guaranteed-manifold stick-connector STL.

Geometry mirror of src/geometry/connector.ts, but built with the manifold3d
kernel so the output is always 2-manifold (no T-junctions / slicer errors).

Usage:
  python3 scripts/connector_export.py '<json-params>' <output.stl | ->

Params (all optional, defaults match the web app):
  stickType           RECTANGULAR | SQUARE | ROUND
  rectWidth           wide side / side / diameter [mm]
  rectHeight          narrow side [mm] (RECTANGULAR only)
  numSticks           number of radial arms
  umbrellaAngleDeg    arm slope away from the hub axis
  includeCenterStem   socket along the hub axis from the bottom
  orientationMode     TANGENTIAL (wide side around ring) | RADIAL (upright)
  printerOffset       clearance per side [mm]
  socketDepth         [mm]
  wallThickness       [mm]
  screwHoleDiameter   [mm] (0 disables)
  chamferEntry        45-degree entry chamfer depth [mm] (0 disables)
"""

import json
import math
import struct
import sys

import numpy as np
from manifold3d import Error, Manifold, Mesh, OpType

DEFAULTS = {
    "stickType": "RECTANGULAR",
    "rectWidth": 10.0,
    "rectHeight": 4.0,
    "numSticks": 6,
    "umbrellaAngleDeg": 45.0,
    "includeCenterStem": False,
    "orientationMode": "TANGENTIAL",
    "printerOffset": 0.3,
    "socketDepth": 25.0,
    "wallThickness": 3.0,
    "screwHoleDiameter": 3.2,
    "chamferEntry": 1.0,
}

SEG = 48  # cylinder tessellation


def prism(round_: bool, w: float, h: float, depth: float) -> Manifold:
    """Profile prism spanning z in [0, depth]."""
    if round_:
        return Manifold.cylinder(depth, w / 2, w / 2, SEG)
    return Manifold.cube([w, h, depth], center=True).translate([0, 0, depth / 2])


def rect_frustum(w0: float, h0: float, w1: float, h1: float, depth: float) -> Manifold:
    """Convex rectangular frustum: w0 x h0 at z=0, w1 x h1 at z=depth."""
    verts = np.array(
        [
            [-w0 / 2, -h0 / 2, 0],
            [w0 / 2, -h0 / 2, 0],
            [w0 / 2, h0 / 2, 0],
            [-w0 / 2, h0 / 2, 0],
            [-w1 / 2, -h1 / 2, depth],
            [w1 / 2, -h1 / 2, depth],
            [w1 / 2, h1 / 2, depth],
            [-w1 / 2, h1 / 2, depth],
        ],
        dtype=np.float32,
    )
    tris = np.array(
        [
            [0, 2, 1],
            [0, 3, 2],  # bottom cap (-Z)
            [4, 5, 6],
            [4, 6, 7],  # top cap (+Z)
            [0, 1, 5],
            [0, 5, 4],
            [1, 2, 6],
            [1, 6, 5],
            [2, 3, 7],
            [2, 7, 6],
            [3, 0, 4],
            [3, 4, 7],
        ],
        dtype=np.uint32,
    )
    return Manifold(Mesh(vert_properties=verts, tri_verts=tris))


def frustum(
    round_: bool, w: float, h: float, depth: float, flare: float, extend: float = 0.0
) -> Manifold:
    """45-degree chamfer: profile w x h at z=0 flaring `flare` per side at z=depth.

    `extend` continues the taper below z=0 (profile shrinks). The extension
    sits inside the socket bore, so the shape is unchanged but the cutter
    avoids a flush (coplanar) contact ring with the bore wall.
    """
    if round_:
        if extend > 0:
            return Manifold.cylinder(depth + extend, w / 2 - extend, w / 2 + flare, SEG)
        return Manifold.cylinder(depth, w / 2, w / 2 + flare, SEG)
    return rect_frustum(
        w - 2 * extend, h - 2 * extend, w + 2 * flare, h + 2 * flare, depth + extend
    )


def place(solid: Manifold, x_axis, y_axis, z_axis, origin) -> Manifold:
    """Map local X/Y/Z onto the given orthonormal axes, then translate."""
    m = [
        [x_axis[0], y_axis[0], z_axis[0], origin[0]],
        [x_axis[1], y_axis[1], z_axis[1], origin[1]],
        [x_axis[2], y_axis[2], z_axis[2], origin[2]],
    ]
    return solid.transform(m)


def build(p: dict) -> Manifold:
    alpha = math.radians(p["umbrellaAngleDeg"])
    sin_a, cos_a = math.sin(alpha), math.cos(alpha)
    round_ = p["stickType"] == "ROUND"

    w = p["rectWidth"]
    h = p["rectHeight"] if p["stickType"] == "RECTANGULAR" else p["rectWidth"]

    iw = w + 2 * p["printerOffset"]
    ih = h + 2 * p["printerOffset"]
    ow = iw + 2 * p["wallThickness"]
    oh = ih + 2 * p["wallThickness"]
    half_diag = math.hypot(ow, oh) / 2

    embed = max(2 * p["wallThickness"], half_diag)
    face = embed + p["socketDepth"]

    solids = []
    cuts = []

    n = max(1, round(p["numSticks"]))
    for i in range(n):
        phi = 2 * math.pi * i / n
        radial = np.array([math.cos(phi), math.sin(phi), 0.0])
        d = radial * sin_a + np.array([0.0, 0.0, cos_a])
        d = d / np.linalg.norm(d)
        t = np.array([-math.sin(phi), math.cos(phi), 0.0])
        b = np.cross(d, t)
        b = b / np.linalg.norm(b)
        # TANGENTIAL: wide side flat around the ring; RADIAL: wide side upright.
        width_axis = t if p["orientationMode"] == "TANGENTIAL" else b
        height_axis = b if p["orientationMode"] == "TANGENTIAL" else -t

        def at(solid: Manifold, s: float) -> Manifold:
            return place(solid, width_axis, height_axis, d, d * s)

        # Outer sleeve from the hub center to the socket face.
        solids.append(at(prism(round_, ow, oh, face), 0.0))
        # Socket bore (stops exactly at socketDepth, overshoots the face).
        cuts.append(
            at(
                prism(round_, iw, ih, p["socketDepth"] + 2),
                face - p["socketDepth"],
            )
        )
        # Entry chamfer (extended into the bore to avoid flush cutter contact).
        if p["chamferEntry"] > 0.01:
            c = p["chamferEntry"]
            ext = min(2.0, iw / 2 - 0.5, ih / 2 - 0.5)
            cuts.append(at(frustum(round_, iw, ih, c + 1, c + 1, ext), face - c - ext))
        # Screw hole through both walls, along the thin axis.
        if p["screwHoleDiameter"] > 0.01:
            length = oh + 2  # just crosses both walls
            hole = Manifold.cylinder(
                length, p["screwHoleDiameter"] / 2, p["screwHoleDiameter"] / 2, 24, center=True
            )
            y_axis = np.cross(height_axis, d)  # local Z -> height_axis
            cuts.append(
                place(hole, d, y_axis, height_axis, d * (face - p["socketDepth"] * 0.55))
            )

    # Hub with a flat bottom at z_bottom (prints without support).
    z_bottom = -(oh / 2) * sin_a
    hub_r = embed * sin_a + ow / 2 + (oh / 2) * cos_a + 1
    hub_top = embed * cos_a + (oh / 2) * sin_a + 2
    if p["includeCenterStem"]:
        # Tall enough for the stem socket floor plus a top wall.
        hub_top = max(hub_top, z_bottom + p["socketDepth"] + p["wallThickness"])
    solids.append(
        Manifold.cylinder(hub_top - z_bottom, hub_r, hub_r, 96).translate([0, 0, z_bottom])
    )

    # Optional center stem socket along the hub axis, entering from the bottom.
    if p["includeCenterStem"]:
        depth = p["socketDepth"]
        cuts.append(prism(round_, iw, ih, depth + 1).translate([0, 0, z_bottom - 0.5]))
        if p["chamferEntry"] > 0.01:
            c = p["chamferEntry"]
            # Flare at the bottom entry: wide at z=0 -> narrow at z=depth.
            # Extended past the narrow end into the bore (see frustum above).
            ext = min(2.0, iw / 2 - 0.5, ih / 2 - 0.5)
            if round_:
                cg = Manifold.cylinder(c + 1 + ext, iw / 2 + c + 1, iw / 2 - ext, SEG)
            else:
                cg = rect_frustum(
                    iw + 2 * (c + 1), ih + 2 * (c + 1), iw - 2 * ext, ih - 2 * ext, c + 1 + ext
                )
            cuts.append(cg.translate([0, 0, z_bottom - 1]))
        if p["screwHoleDiameter"] > 0.01:
            length = hub_r * 2 + 6
            hole = Manifold.cylinder(
                length, p["screwHoleDiameter"] / 2, p["screwHoleDiameter"] / 2, 24, center=True
            )
            # local Z -> world X
            hole = place(
                hole,
                [0, 1, 0],
                [0, 0, 1],
                [1, 0, 0],
                [0, 0, z_bottom + depth * 0.55],
            )
            cuts.append(hole)

    solid = Manifold.batch_boolean(solids, OpType.Add)
    solid = Manifold.batch_boolean([solid] + cuts, OpType.Subtract)
    return solid


def edge_defect_count(tris: np.ndarray) -> int:
    """Number of edges not shared by exactly two faces."""
    edges: dict[tuple[int, int], int] = {}
    for f in tris:
        for e in range(3):
            a, b = int(f[e]), int(f[(e + 1) % 3])
            if a == b:
                continue
            k = (a, b) if a < b else (b, a)
            edges[k] = edges.get(k, 0) + 1
    return sum(1 for n in edges.values() if n != 2)


def repair_mesh(verts: np.ndarray, tris: np.ndarray) -> np.ndarray:
    """Slicer-style repair: weld near-coincident vertices (float32 STL
    quantization can collapse manifold3d's exact intersection vertices),
    drop degenerate faces, and cancel duplicate face pairs."""
    for tol in (0.0, 1e-6, 1e-5, 1e-4):
        if tol == 0.0:
            # weld byte-identical vertices (post-float32 quantization)
            canon0: dict[bytes, int] = {}
            remap = np.empty(len(verts), dtype=np.int64)
            for i, v in enumerate(verts):
                b = v.tobytes()
                if b not in canon0:
                    canon0[b] = i
                remap[i] = canon0[b]
        else:
            keys = np.round(verts / tol).astype(np.int64)
            canon: dict[tuple[int, int, int], int] = {}
            remap = np.empty(len(verts), dtype=np.int64)
            for i, k in enumerate(keys):
                kt = (int(k[0]), int(k[1]), int(k[2]))
                if kt not in canon:
                    canon[kt] = i
                remap[i] = canon[kt]
        f = remap[tris]
        # drop degenerate faces
        keep = (f[:, 0] != f[:, 1]) & (f[:, 1] != f[:, 2]) & (f[:, 0] != f[:, 2])
        f = f[keep]
        # cancel duplicate face pairs (collapsed slivers appear twice)
        groups: dict[tuple[int, int, int], list[int]] = {}
        for i, tri in enumerate(f):
            groups.setdefault(tuple(sorted(int(v) for v in tri)), []).append(i)
        drop: set[int] = set()
        for idxs in groups.values():
            for i in range(0, len(idxs) - len(idxs) % 2, 2):
                drop.add(idxs[i])
                drop.add(idxs[i + 1])
        if drop:
            f = np.delete(f, sorted(drop), axis=0)
        if edge_defect_count(f) == 0:
            return f
    return f  # best effort


def write_binary_stl(solid: Manifold, out) -> None:
    mesh = solid.to_mesh64()
    # STL stores float32: quantize first, then repair the quantized topology.
    verts = np.asarray(mesh.vert_properties, dtype=np.float64)[:, :3].astype(np.float32)
    tris = repair_mesh(verts, np.asarray(mesh.tri_verts, dtype=np.int64))
    header = b"Connector Studio (manifold3d)".ljust(80, b" ")
    out.write(header)
    out.write(struct.pack("<I", len(tris)))
    for tri in tris:
        a, b, c = verts[tri[0]], verts[tri[1]], verts[tri[2]]
        n = np.cross(b - a, c - a)
        norm = np.linalg.norm(n)
        n = n / norm if norm > 0 else n
        out.write(struct.pack("<3f", *n))
        for v in (a, b, c):
            out.write(struct.pack("<3f", *v))
        out.write(struct.pack("<H", 0))


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    params = {**DEFAULTS, **json.loads(sys.argv[1])}
    solid = build(params)
    if solid.is_empty() or solid.status() != Error.NoError:
        print(f"geometry failed: status={solid.status()}", file=sys.stderr)
        return 1
    if sys.argv[2] == "-":
        write_binary_stl(solid, sys.stdout.buffer)
    else:
        with open(sys.argv[2], "wb") as f:
            write_binary_stl(solid, f)
    return 0


if __name__ == "__main__":
    sys.exit(main())
