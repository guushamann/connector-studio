// Vendored from three-csg-ts (MIT License, https://github.com/samuelwang17/three-csg-ts)
// Patched: all tree walks are iterative (explicit stack) so deeply unbalanced
// BSP trees cannot overflow the JS call stack (browsers cap it ~1 MB), and
// build() picks a good split plane (heuristic) instead of the first polygon,
// which keeps trees balanced and prevents sliver-triangle explosions.
import { Plane } from './Plane';
import type { Polygon } from './Polygon';

export class Node {
  plane: Plane | null = null;
  front: Node | null = null;
  back: Node | null = null;
  polygons: Polygon[] = [];

  constructor(polygons?: Polygon[]) {
    if (polygons) this.build(polygons);
  }

  clone(): Node {
    const root = new Node();
    const stack: Array<[Node, Node]> = [[this, root]];
    while (stack.length) {
      const [src, dst] = stack.pop()!;
      dst.plane = src.plane ? src.plane.clone() : null;
      dst.polygons = src.polygons.map((p) => p.clone());
      if (src.front) {
        dst.front = new Node();
        stack.push([src.front, dst.front]);
      }
      if (src.back) {
        dst.back = new Node();
        stack.push([src.back, dst.back]);
      }
    }
    return root;
  }

  /** Convert solid space to empty space and empty space to solid space. */
  invert(): void {
    const stack: Node[] = [this];
    while (stack.length) {
      const node = stack.pop()!;
      for (const p of node.polygons) p.flip();
      if (node.plane) node.plane.flip();
      const temp = node.front;
      node.front = node.back;
      node.back = temp;
      if (node.front) stack.push(node.front);
      if (node.back) stack.push(node.back);
    }
  }

  /** Remove all polygons in `polygons` that are inside this BSP tree. */
  clipPolygons(polygons: Polygon[]): Polygon[] {
    const out: Polygon[] = [];
    const stack: Array<[Node, Polygon[]]> = [[this, polygons]];
    while (stack.length) {
      const [node, polys] = stack.pop()!;
      if (!node.plane) {
        out.push(...polys);
        continue;
      }
      const front: Polygon[] = [];
      const back: Polygon[] = [];
      for (const p of polys) {
        node.plane.splitPolygon(p, front, back, front, back);
      }
      if (node.front) stack.push([node.front, front]);
      else out.push(...front);
      if (node.back) stack.push([node.back, back]);
      // Polygons behind a leaf are inside the solid: discarded.
    }
    return out;
  }

  /** Remove all polygons in this BSP tree that are inside `bsp`. */
  clipTo(bsp: Node): void {
    const stack: Node[] = [this];
    while (stack.length) {
      const node = stack.pop()!;
      node.polygons = bsp.clipPolygons(node.polygons);
      if (node.front) stack.push(node.front);
      if (node.back) stack.push(node.back);
    }
  }

  /** Return a list of all polygons in this BSP tree. */
  allPolygons(): Polygon[] {
    const out: Polygon[] = [];
    const stack: Node[] = [this];
    while (stack.length) {
      const node = stack.pop()!;
      out.push(...node.polygons);
      if (node.front) stack.push(node.front);
      if (node.back) stack.push(node.back);
    }
    return out;
  }

  /**
   * Score a candidate split plane: few split polygons and a balanced
   * front/back distribution are best (classic csg.js heuristic, 8:1 weight).
   */
  private static splitScore(plane: Plane, polygons: Polygon[]): number {
    let splits = 0;
    let front = 0;
    let back = 0;
    const eps = Plane.EPSILON;
    for (const p of polygons) {
      let type = 0;
      for (const v of p.vertices) {
        const t = plane.normal.dot(v.pos) - plane.w;
        type |= t < -eps ? 2 : t > eps ? 1 : 0;
      }
      if (type === 3) splits++;
      else if (type === 1) front++;
      else if (type === 2) back++;
    }
    return splits * 8 + Math.abs(front - back);
  }

  /** Pick the best split plane from a sample of the polygons. */
  private static bestPlane(polygons: Polygon[]): Plane {
    const SAMPLE = 10;
    const step = Math.max(1, Math.floor(polygons.length / SAMPLE));
    let best = polygons[0].plane;
    let bestScore = Infinity;
    for (let i = 0; i < polygons.length; i += step) {
      const score = Node.splitScore(polygons[i].plane, polygons);
      if (score < bestScore) {
        bestScore = score;
        best = polygons[i].plane;
        if (score === 0) break;
      }
    }
    return best;
  }

  /** Build a BSP tree out of `polygons` (iterative, explicit stack). */
  build(polygons: Polygon[]): void {
    const stack: Array<[Node, Polygon[]]> = [[this, polygons]];
    while (stack.length) {
      const [node, polys] = stack.pop()!;
      if (!polys.length) continue;
      if (!node.plane) node.plane = Node.bestPlane(polys).clone();
      const front: Polygon[] = [];
      const back: Polygon[] = [];
      for (const p of polys) {
        node.plane.splitPolygon(p, node.polygons, node.polygons, front, back);
      }
      if (front.length) {
        if (!node.front) node.front = new Node();
        stack.push([node.front, front]);
      }
      if (back.length) {
        if (!node.back) node.back = new Node();
        stack.push([node.back, back]);
      }
    }
  }
}
