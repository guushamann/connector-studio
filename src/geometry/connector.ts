import * as THREE from 'three';
import { CSG } from '../csg/CSG';

export type StickType = 'RECTANGULAR' | 'SQUARE' | 'ROUND';
export type OrientationMode = 'TANGENTIAL' | 'RADIAL';

export interface ConnectorParams {
  stickType: StickType;
  /** Rectangular: wide side. Square: side. Round: diameter. */
  rectWidth: number;
  /** Rectangular only: narrow side. */
  rectHeight: number;
  numSticks: number;
  /** Slope of the arms away from the hub axis (0 = straight up). */
  umbrellaAngleDeg: number;
  includeCenterStem: boolean;
  orientationMode: OrientationMode;
  /** Clearance added per side so printed sticks actually fit. */
  printerOffset: number;
  socketDepth: number;
  wallThickness: number;
  /** 0 disables screw holes. */
  screwHoleDiameter: number;
  /** 45° entry chamfer depth, 0 disables. */
  chamferEntry: number;
}

export interface ConnectorResult {
  mesh: THREE.Mesh;
  /** Translucent preview of the inserted sticks. */
  sticks: THREE.Group;
  stats: {
    hubDiameter: number;
    overallHeight: number;
    triangleCount: number;
  };
}

export const DEFAULT_PARAMS: ConnectorParams = {
  stickType: 'RECTANGULAR',
  rectWidth: 10.0,
  rectHeight: 4.0,
  numSticks: 6,
  umbrellaAngleDeg: 45.0,
  includeCenterStem: false,
  orientationMode: 'TANGENTIAL',
  printerOffset: 0.3,
  socketDepth: 25.0,
  wallThickness: 3.0,
  screwHoleDiameter: 3.2,
  chamferEntry: 1.0,
};

const material = new THREE.MeshStandardMaterial();

function toCsgMesh(geometry: THREE.BufferGeometry): THREE.Mesh {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  return new THREE.Mesh(g, material);
}

/** Balanced pairwise union — keeps BSP trees small and sliver-free. */
function unionAll(meshes: THREE.Mesh[]): THREE.Mesh {
  let level = meshes;
  while (level.length > 1) {
    const next: THREE.Mesh[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(i + 1 < level.length ? CSG.union(level[i], level[i + 1]) : level[i]);
    }
    level = next;
  }
  return level[0];
}

/** Convex rectangular frustum along +Z: w0×h0 at z=0, w1×h1 at z=depth. */
function rectFrustumGeometry(
  w0: number,
  h0: number,
  w1: number,
  h1: number,
  depth: number,
): THREE.BufferGeometry {
  const A = [
    [-w0 / 2, -h0 / 2, 0],
    [w0 / 2, -h0 / 2, 0],
    [w0 / 2, h0 / 2, 0],
    [-w0 / 2, h0 / 2, 0],
  ];
  const B = [
    [-w1 / 2, -h1 / 2, depth],
    [w1 / 2, -h1 / 2, depth],
    [w1 / 2, h1 / 2, depth],
    [-w1 / 2, h1 / 2, depth],
  ];
  const pos: number[] = [];
  const tri = (p0: number[], p1: number[], p2: number[]) =>
    pos.push(...p0, ...p1, ...p2);
  tri(A[0], A[2], A[1]);
  tri(A[0], A[3], A[2]); // bottom cap (-Z)
  tri(B[0], B[1], B[2]);
  tri(B[0], B[2], B[3]); // top cap (+Z)
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    tri(A[i], A[j], B[j]);
    tri(A[i], B[j], B[i]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Prism of the stick profile along local +Z, centered at depth/2.
 * `w`/`h` are full sizes; for round profiles `w` is the diameter.
 */
function profilePrism(
  round: boolean,
  w: number,
  h: number,
  depth: number,
  segments = 24,
): THREE.BufferGeometry {
  if (round) {
    const g = new THREE.CylinderGeometry(w / 2, w / 2, depth, segments);
    g.rotateX(Math.PI / 2); // axis Y -> Z
    return g;
  }
  return new THREE.BoxGeometry(w, h, depth);
}

/** 45° entry chamfer cut: profile size at z=0 flaring out by `flare` per side at z=depth. */
function chamferGeometry(
  round: boolean,
  w: number,
  h: number,
  depth: number,
  flare: number,
): THREE.BufferGeometry {
  if (round) {
    const g = new THREE.CylinderGeometry(w / 2 + flare, w / 2, depth, 24);
    g.rotateX(Math.PI / 2); // wide end -> +Z
    g.translate(0, 0, depth / 2);
    return g;
  }
  return rectFrustumGeometry(w, h, w + 2 * flare, h + 2 * flare, depth);
}

export function buildConnector(p: ConnectorParams): ConnectorResult {
  const alpha = THREE.MathUtils.degToRad(p.umbrellaAngleDeg);
  const sinA = Math.sin(alpha);
  const cosA = Math.cos(alpha);
  const round = p.stickType === 'ROUND';

  const w = p.rectWidth;
  const h = p.stickType === 'RECTANGULAR' ? p.rectHeight : p.rectWidth;

  const iw = w + 2 * p.printerOffset; // inner (socket) sizes
  const ih = h + 2 * p.printerOffset;
  const ow = iw + 2 * p.wallThickness; // outer sizes
  const oh = ih + 2 * p.wallThickness;
  const halfDiag = Math.hypot(ow, oh) / 2;

  // How deep each arm sleeve plunges into the hub — generous for strength.
  const embed = Math.max(2 * p.wallThickness, halfDiag);
  const face = embed + p.socketDepth; // socket entry plane, along arm axis
  const up = new THREE.Vector3(0, 0, 1);

  const solids: THREE.Mesh[] = [];
  // Cuts are applied AFTER the union: overlapping sleeves would otherwise
  // refill each other's bores.
  const cuts: THREE.Mesh[] = [];
  const sticks = new THREE.Group();
  const stickMat = new THREE.MeshStandardMaterial({
    color: 0xb9895b,
    transparent: true,
    opacity: 0.45,
    roughness: 0.9,
  });

  const N = Math.max(1, Math.round(p.numSticks));
  for (let i = 0; i < N; i++) {
    const phi = (2 * Math.PI * i) / N;
    const radial = new THREE.Vector3(Math.cos(phi), Math.sin(phi), 0);
    // Arm direction: tilted `alpha` away from the hub axis.
    const d = radial
      .clone()
      .multiplyScalar(sinA)
      .addScaledVector(up, cosA)
      .normalize();
    // Uniform orthonormal basis per arm: tangent, slope-normal, direction.
    const t = new THREE.Vector3(-Math.sin(phi), Math.cos(phi), 0);
    const b = new THREE.Vector3().crossVectors(d, t).normalize();
    // TANGENTIAL: wide side lies flat around the ring (along t).
    // RADIAL: wide side stands upright along the slope (along b).
    const widthAxis = p.orientationMode === 'TANGENTIAL' ? t : b;
    const heightAxis =
      p.orientationMode === 'TANGENTIAL' ? b : t.clone().negate();

    const place = (geo: THREE.BufferGeometry, s: number) => {
      const m = new THREE.Matrix4().makeBasis(widthAxis, heightAxis, d);
      m.setPosition(d.clone().multiplyScalar(s));
      geo.applyMatrix4(m);
      return toCsgMesh(geo);
    };

    // Outer sleeve: from the hub center out to the socket face.
    solids.push(place(profilePrism(round, ow, oh, face), face / 2));

    // Socket bore: stops exactly at socketDepth, overshoots the face by 2mm.
    cuts.push(
      place(profilePrism(round, iw, ih, p.socketDepth + 2), face - p.socketDepth / 2 + 1),
    );

    // Entry chamfer.
    if (p.chamferEntry > 0.01) {
      const c = p.chamferEntry;
      cuts.push(place(chamferGeometry(round, iw, ih, c + 1, c + 1), face - c));
    }

    // Screw hole through both walls at mid-socket, along the thin axis.
    // Length just crosses both walls — longer would puncture the hub.
    if (p.screwHoleDiameter > 0.01) {
      const len = oh + 2;
      const g = new THREE.CylinderGeometry(
        p.screwHoleDiameter / 2,
        p.screwHoleDiameter / 2,
        len,
        20,
      );
      const xAxis = d.clone();
      const zAxis = new THREE.Vector3().crossVectors(xAxis, heightAxis);
      const m = new THREE.Matrix4().makeBasis(xAxis, heightAxis, zAxis);
      m.setPosition(d.clone().multiplyScalar(face - p.socketDepth * 0.55));
      g.applyMatrix4(m);
      cuts.push(toCsgMesh(g));
    }

    // Ghost stick for the preview (inserted socketDepth, sticking out 80mm).
    const stickLen = 80;
    const sg = profilePrism(round, w, h, p.socketDepth + stickLen, 12);
    const sm = new THREE.Matrix4().makeBasis(widthAxis, heightAxis, d);
    sm.setPosition(
      d.clone().multiplyScalar(face - p.socketDepth + (p.socketDepth + stickLen) / 2),
    );
    sg.applyMatrix4(sm);
    sticks.add(new THREE.Mesh(sg.index ? sg.toNonIndexed() : sg, stickMat));
  }

  // --- Hub (flat bottom at zBottom so it prints without support) ---
  const zBottom = -(oh / 2) * sinA;
  const hubR = embed * sinA + ow / 2 + (oh / 2) * cosA + 1;
  let hubTop = embed * cosA + (oh / 2) * sinA + 2;
  if (p.includeCenterStem) {
    // Hub must be tall enough for the stem socket floor plus top wall.
    hubTop = Math.max(hubTop, zBottom + p.socketDepth + p.wallThickness);
  }
  const hubGeo = new THREE.CylinderGeometry(hubR, hubR, hubTop - zBottom, 48);
  hubGeo.rotateX(Math.PI / 2); // axis -> Z
  hubGeo.translate(0, 0, (hubTop + zBottom) / 2);
  solids.push(toCsgMesh(hubGeo));

  // Optional center stem socket along the hub axis (from the bottom).
  if (p.includeCenterStem) {
    const depth = p.socketDepth;
    const g = profilePrism(round, iw, ih, depth + 1);
    g.translate(0, 0, zBottom - 0.5 + (depth + 1) / 2);
    cuts.push(toCsgMesh(g));

    if (p.chamferEntry > 0.01) {
      const c = p.chamferEntry;
      // Flare at the bottom entry: wide at z=0, narrow at z=depth — swap sizes.
      const cg = round
        ? (() => {
            const cyl = new THREE.CylinderGeometry(iw / 2, iw / 2 + c + 1, c + 1, 32);
            cyl.rotateX(Math.PI / 2); // narrow end -> +Z
            cyl.translate(0, 0, zBottom - 1 + (c + 1) / 2);
            return cyl;
          })()
        : (() => {
            const fr = rectFrustumGeometry(
              iw + 2 * (c + 1),
              ih + 2 * (c + 1),
              iw,
              ih,
              c + 1,
            );
            fr.translate(0, 0, zBottom - 1);
            return fr;
          })();
      cuts.push(toCsgMesh(cg));
    }

    if (p.screwHoleDiameter > 0.01) {
      const len = hubR * 2 + 6;
      const g = new THREE.CylinderGeometry(
        p.screwHoleDiameter / 2,
        p.screwHoleDiameter / 2,
        len,
        20,
      );
      g.rotateZ(Math.PI / 2); // axis -> X
      g.translate(0, 0, zBottom + depth * 0.55);
      cuts.push(toCsgMesh(g));
    }
  }

  // One union of positives, one union of cutters, a single subtract:
  // sequential subtracts on the growing mesh explode the triangle count.
  const solid = CSG.subtract(unionAll(solids), unionAll(cuts));

  solid.geometry.clearGroups();
  solid.geometry.computeVertexNormals();
  solid.geometry.computeBoundingBox();
  const bb = solid.geometry.boundingBox ?? new THREE.Box3();
  const size = new THREE.Vector3();
  bb.getSize(size);
  const triCount = (solid.geometry.getAttribute('position')?.count ?? 0) / 3;

  return {
    mesh: solid,
    sticks,
    stats: {
      hubDiameter: 2 * hubR,
      overallHeight: size.z,
      triangleCount: Math.round(triCount),
    },
  };
}
