// Vendored from three-csg-ts (MIT License, https://github.com/samuelwang17/three-csg-ts)
import { Plane } from './Plane';
import type { Vertex } from './Vertex';

/** Represents a convex polygon. */
export class Polygon {
  vertices: Vertex[];
  shared: number | undefined;
  plane: Plane;

  constructor(vertices: Vertex[], shared?: number) {
    this.vertices = vertices;
    this.shared = shared;
    this.plane = Plane.fromPoints(
      vertices[0].pos,
      vertices[1].pos,
      vertices[2].pos,
    );
  }
  clone(): Polygon {
    return new Polygon(
      this.vertices.map((v) => v.clone()),
      this.shared,
    );
  }
  flip(): void {
    this.vertices.reverse().map((v) => v.flip());
    this.plane.flip();
  }
}
