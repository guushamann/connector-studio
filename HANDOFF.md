# Handoff — Connector Studio

Web app to design 3D-printable hub connectors for wooden sticks (e.g. 6 umbrella
ribs at 45°). Live three.js preview + one-click **watertight STL export**.
Status: working, slicer-validated, printed by user.

## Run

```sh
npm install && pip3 install -r requirements.txt   # manifold3d
npm run dev
```

## Architecture

- `src/geometry/connector.ts` — parametric geometry (single source of truth for
  the preview). All params: stickType (RECTANGULAR/SQUARE/ROUND), rectWidth/
  rectHeight, numSticks, umbrellaAngleDeg, includeCenterStem, orientationMode
  (TANGENTIAL/RADIAL), printerOffset, socketDepth, wallThickness,
  screwHoleDiameter (0=off), chamferEntry (0=off).
- `scripts/connector_export.py` — **same geometry** rebuilt with manifold3d for
  export. CLI: `python3 scripts/connector_export.py '<json-params>' out.stl`.
  **Keep it in sync with connector.ts when changing geometry.**
- `vite.config.ts` — `/api/connector.stl?params=<json>` middleware shells out to
  the Python script. App falls back to browser CSG export if the API fails.
- `src/csg/` — vendored three-csg-ts, patched (see below). Preview only.

## Geometry conventions

- Hub axis = +Z, flat hub bottom for support-free printing. Arm `i` at azimuth
  φ, direction `d = sin(α)·radial + cos(α)·z`. Orthonormal frame: tangent
  `t = (-sinφ, cosφ, 0)`, slope-normal `b = d × t`. TANGENTIAL: width→t,
  height→b. RADIAL: width→b, height→−t (keeps right-handed basis).
- Sleeves embed into hub by `max(2·wall, half-diagonal)`; hub grows taller when
  center stem is on (socket floor + wall).
- CSG order matters: **one** union of positives, **one** union of cutters,
  **one** subtract. Anything else explodes triangle counts or refills bores
  (overlapping sleeves fill each other's sockets).

## Hard-won lessons (don't relearn these)

1. **three-csg-ts is not usable as-is**: recursive BSP overflows the browser
   stack, first-polygon split heuristic causes sliver explosions (4GB OOM),
   Uint16 index overflows >65k verts. `src/csg/` fixes all three (iterative
   walks, split-plane scoring, Uint32). Output still has T-junctions → slicers
   report "non-manifold edges". Fine for preview, **not for export**.
2. **manifold3d (Python) output is guaranteed manifold** — but verify by edge
   counting on *face indices*, not positions. trimesh's default `process=True`
   vertex merging *breaks* manifold meshes (collapses sliver verts) — false
   alarm that cost real debugging time.
3. **float32 STL quantization** can collapse manifold3d's exact intersection
   vertices → 2–66 bad edges. `repair_mesh()` in the export script welds/drops/
   cancels them; validated 0 defects across 10 param combos.
4. **Coplanar/flush cutter contacts are degenerate**: the chamfer frustum's
   small end sat flush with the bore wall → boolean defects. Fix: extend the
   taper into the bore (inside removed material, shape unchanged).
5. **Screw-hole cutters must be short** (`oh + 2`): a too-long cylinder punches
   through the hub top.
6. manifold3d 3.5.2 `CrossSection`/`extrude` crashes (nanobind FillRule bug) —
   rectangular frustums are built as raw 12-triangle `Mesh` instead.
7. `STLExporter` (three-stdlib) instance is single-use: `offset` field isn't
   reset between `parse()` calls.

## Testing approach (no test framework in repo)

Headless via esbuild bundle + node for TS geometry; subprocess + trimesh for
Python STLs. Ray-parity probes verify sockets/bores exist; edge-index counting
verifies manifoldness. See git history / ask for `/tmp/test-geometry.ts`
pattern if needed (was ad-hoc, not committed).

## Gotchas

- package.json is user-pinned — don't add deps (typescript/@types/node were
  deliberately not added; `src/node-shims.d.ts` covers vite.config.ts typing).
  `npx tsc --noEmit` needs `npm i --no-save typescript` first.
- Preview mesh is non-indexed triangle soup with flat normals (by design).
- `numSticks=1`..`24`, angle 0–80° all validated.
