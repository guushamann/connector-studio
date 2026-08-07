// Vendored from three-csg-ts (MIT License, https://github.com/samuelwang17/three-csg-ts)
// Patched: Uint32Array fallback index (Uint16 overflowed past 65k vertices) and
// missing-normal guard.
import {
  BufferAttribute,
  BufferGeometry,
  Matrix3,
  Matrix4,
  Mesh,
  Vector3,
  type Material,
} from 'three';
import { NBuf2, NBuf3 } from './NBuf';
import { Node } from './Node';
import { Polygon } from './Polygon';
import { Vector } from './Vector';
import { Vertex } from './Vertex';

/** Holds a binary space partition tree representing a 3D solid. */
export class CSG {
  polygons: Polygon[] = [];

  static fromPolygons(polygons: Polygon[]): CSG {
    const csg = new CSG();
    csg.polygons = polygons;
    return csg;
  }

  static fromGeometry(geom: BufferGeometry, objectIndex?: number): CSG {
    const posattr = geom.attributes.position;
    const normalattr = geom.attributes.normal;
    const uvattr = geom.attributes.uv;
    const colorattr = geom.attributes.color;
    const grps = geom.groups;
    let index: ArrayLike<number>;
    if (geom.index) {
      index = geom.index.array;
    } else {
      const count = (posattr.array.length / posattr.itemSize) | 0;
      const idx = new Uint32Array(count);
      for (let i = 0; i < count; i++) idx[i] = i;
      index = idx;
    }
    const triCount = (index.length / 3) | 0;
    const polys: Array<Polygon | undefined> = Array.from({ length: triCount });
    for (let i = 0, pli = 0, l = index.length; i < l; i += 3, pli++) {
      const vertices = Array.from({ length: 3 }) as Vertex[];
      for (let j = 0; j < 3; j++) {
        const vi = index[i + j];
        const vp = vi * 3;
        const vt = vi * 2;
        const x = posattr.array[vp];
        const y = posattr.array[vp + 1];
        const z = posattr.array[vp + 2];
        const nx = normalattr ? normalattr.array[vp] : 0;
        const ny = normalattr ? normalattr.array[vp + 1] : 0;
        const nz = normalattr ? normalattr.array[vp + 2] : 1;
        const u = uvattr?.array[vt];
        const v = uvattr?.array[vt + 1];
        vertices[j] = new Vertex(
          new Vector(x, y, z),
          new Vector(nx, ny, nz),
          new Vector(u, v, 0),
          colorattr
            ? new Vector(
                colorattr.array[vp],
                colorattr.array[vp + 1],
                colorattr.array[vp + 2],
              )
            : undefined,
        );
      }
      if (objectIndex === undefined && grps && grps.length > 0) {
        for (const grp of grps) {
          if (i >= grp.start && i < grp.start + grp.count) {
            polys[pli] = new Polygon(vertices, grp.materialIndex);
          }
        }
      } else {
        polys[pli] = new Polygon(vertices, objectIndex);
      }
    }
    return CSG.fromPolygons(
      polys.filter(
        (p): p is Polygon => p !== undefined && !Number.isNaN(p.plane.normal.x),
      ),
    );
  }

  static toGeometry(csg: CSG, toMatrix: Matrix4): BufferGeometry {
    let triCount = 0;
    const ps = csg.polygons;
    for (const p of ps) {
      triCount += p.vertices.length - 2;
    }
    const geom = new BufferGeometry();
    const vertices = new NBuf3(triCount * 3 * 3);
    const normals = new NBuf3(triCount * 3 * 3);
    const uvs = new NBuf2(triCount * 2 * 3);
    let colors: NBuf3 | undefined;
    const grps: number[][] = [];
    const dgrp: number[] = [];
    for (const p of ps) {
      const pvs = p.vertices;
      const pvlen = pvs.length;
      if (p.shared !== undefined) {
        if (!grps[p.shared]) grps[p.shared] = [];
      }
      if (pvlen && pvs[0].color !== undefined) {
        if (!colors) colors = new NBuf3(triCount * 3 * 3);
      }
      for (let j = 3; j <= pvlen; j++) {
        const grp = p.shared === undefined ? dgrp : grps[p.shared];
        grp.push(vertices.top / 3, vertices.top / 3 + 1, vertices.top / 3 + 2);
        vertices.write(pvs[0].pos);
        vertices.write(pvs[j - 2].pos);
        vertices.write(pvs[j - 1].pos);
        normals.write(pvs[0].normal);
        normals.write(pvs[j - 2].normal);
        normals.write(pvs[j - 1].normal);
        uvs.write(pvs[0].uv);
        uvs.write(pvs[j - 2].uv);
        uvs.write(pvs[j - 1].uv);
        if (colors) {
          colors.write(pvs[0].color!);
          colors.write(pvs[j - 2].color!);
          colors.write(pvs[j - 1].color!);
        }
      }
    }
    geom.setAttribute('position', new BufferAttribute(vertices.array, 3));
    geom.setAttribute('normal', new BufferAttribute(normals.array, 3));
    geom.setAttribute('uv', new BufferAttribute(uvs.array, 2));
    if (colors) geom.setAttribute('color', new BufferAttribute(colors.array, 3));
    for (let gi = 0; gi < grps.length; gi++) {
      if (grps[gi] === undefined) grps[gi] = [];
    }
    if (grps.length) {
      let index: number[] = [];
      let gbase = 0;
      for (let gi = 0; gi < grps.length; gi++) {
        geom.addGroup(gbase, grps[gi].length, gi);
        gbase += grps[gi].length;
        index = index.concat(grps[gi]);
      }
      geom.addGroup(gbase, dgrp.length, grps.length);
      index = index.concat(dgrp);
      geom.setIndex(index);
    }
    const inv = new Matrix4().copy(toMatrix).invert();
    geom.applyMatrix4(inv);
    geom.computeBoundingSphere();
    geom.computeBoundingBox();
    return geom;
  }

  static fromMesh(mesh: Mesh, objectIndex?: number): CSG {
    const csg = CSG.fromGeometry(mesh.geometry as BufferGeometry, objectIndex);
    const ttvv0 = new Vector3();
    const tmpm3 = new Matrix3();
    tmpm3.getNormalMatrix(mesh.matrix);
    for (const p of csg.polygons) {
      for (const v of p.vertices) {
        const pos = ttvv0.copy(v.pos.toVector3()).applyMatrix4(mesh.matrix);
        v.pos.copy(new Vector(pos.x, pos.y, pos.z));
        const n = ttvv0.copy(v.normal.toVector3()).applyMatrix3(tmpm3);
        v.normal.copy(new Vector(n.x, n.y, n.z));
      }
    }
    return csg;
  }

  static toMesh(csg: CSG, toMatrix: Matrix4, toMaterial: Material | Material[]): Mesh {
    const geom = CSG.toGeometry(csg, toMatrix);
    const m = new Mesh(geom, toMaterial);
    m.matrix.copy(toMatrix);
    m.matrix.decompose(m.position, m.quaternion, m.scale);
    m.rotation.setFromQuaternion(m.quaternion);
    m.updateMatrixWorld();
    m.castShadow = m.receiveShadow = true;
    return m;
  }

  static union(meshA: Mesh, meshB: Mesh): Mesh {
    const csgA = CSG.fromMesh(meshA);
    const csgB = CSG.fromMesh(meshB);
    return CSG.toMesh(csgA.union(csgB), meshA.matrix, meshA.material);
  }

  static subtract(meshA: Mesh, meshB: Mesh): Mesh {
    const csgA = CSG.fromMesh(meshA);
    const csgB = CSG.fromMesh(meshB);
    return CSG.toMesh(csgA.subtract(csgB), meshA.matrix, meshA.material);
  }

  static intersect(meshA: Mesh, meshB: Mesh): Mesh {
    const csgA = CSG.fromMesh(meshA);
    const csgB = CSG.fromMesh(meshB);
    return CSG.toMesh(csgA.intersect(csgB), meshA.matrix, meshA.material);
  }

  clone(): CSG {
    const csg = new CSG();
    csg.polygons = this.polygons
      .map((p) => p.clone())
      .filter((p) => Number.isFinite(p.plane.w));
    return csg;
  }

  toPolygons(): Polygon[] {
    return this.polygons;
  }

  union(csg: CSG): CSG {
    const a = new Node(this.clone().polygons);
    const b = new Node(csg.clone().polygons);
    a.clipTo(b);
    b.clipTo(a);
    b.invert();
    b.clipTo(a);
    b.invert();
    a.build(b.allPolygons());
    return CSG.fromPolygons(a.allPolygons());
  }

  subtract(csg: CSG): CSG {
    const a = new Node(this.clone().polygons);
    const b = new Node(csg.clone().polygons);
    a.invert();
    a.clipTo(b);
    b.clipTo(a);
    b.invert();
    b.clipTo(a);
    b.invert();
    a.build(b.allPolygons());
    a.invert();
    return CSG.fromPolygons(a.allPolygons());
  }

  intersect(csg: CSG): CSG {
    const a = new Node(this.clone().polygons);
    const b = new Node(csg.clone().polygons);
    a.invert();
    b.clipTo(a);
    b.invert();
    a.clipTo(b);
    b.clipTo(a);
    a.build(b.allPolygons());
    a.invert();
    return CSG.fromPolygons(a.allPolygons());
  }

  inverse(): CSG {
    const csg = this.clone();
    for (const p of csg.polygons) {
      p.flip();
    }
    return csg;
  }

  toMesh(toMatrix: Matrix4, toMaterial: Material | Material[]): Mesh {
    return CSG.toMesh(this, toMatrix, toMaterial);
  }

  toGeometry(toMatrix: Matrix4): BufferGeometry {
    return CSG.toGeometry(this, toMatrix);
  }
}
