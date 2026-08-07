# Connector Studio

Design 3D-printable hub connectors for wooden sticks (umbrella frames, geodesic
projects, etc.) with a live 3D preview and one-click STL export.

## Setup

```sh
npm install
pip3 install -r requirements.txt   # manifold3d, used for watertight STL export
npm run dev
```

Open the printed URL, tweak parameters in the left panel, hit **Export STL**.

## How it works

- **Preview** runs fully in the browser (three.js + a vendored, stack-safe BSP
  CSG in `src/csg/`). It is fast and shows ghost sticks so you can verify the
  Tangential/Radial orientation modes.
- **Export** calls `/api/connector.stl`, a dev-server endpoint that runs
  `scripts/connector_export.py`. That script rebuilds the exact same geometry
  with the [manifold3d](https://github.com/elalish/manifold) kernel, so the STL
  is guaranteed 2-manifold — no "non-manifold edges" slicer errors. If the
  endpoint is unreachable, the app falls back to the browser CSG export (which
  may need your slicer's mesh-repair on import).

The exporter is also a standalone CLI:

```sh
python3 scripts/connector_export.py \
  '{"numSticks":6,"umbrellaAngleDeg":45,"rectWidth":10,"rectHeight":4}' out.stl
```

## Print orientation

Print hub-bottom-down (flat face on the bed) — no supports needed. Default
settings assume ~0.3 mm per-side clearance for the stick sockets; adjust
"Printer offset" to taste. Screw holes are sized for M3 (3.2 mm).
