// Vendored from three-csg-ts (MIT License, https://github.com/samuelwang17/three-csg-ts)
import { Vector } from './Vector';

/** Represents a vertex of a polygon. */
export class Vertex {
  pos: Vector;
  normal: Vector;
  uv: Vector;
  color?: Vector;

  constructor(pos: Vector, normal: Vector, uv: Vector, color?: Vector) {
    this.pos = new Vector().copy(pos);
    this.normal = new Vector().copy(normal);
    this.uv = new Vector().copy(uv);
    this.uv.z = 0;
    if (color) this.color = new Vector().copy(color);
  }
  clone(): Vertex {
    return new Vertex(this.pos, this.normal, this.uv, this.color);
  }
  flip(): void {
    this.normal.negate();
  }
  interpolate(other: Vertex, t: number): Vertex {
    return new Vertex(
      this.pos.clone().lerp(other.pos, t),
      this.normal.clone().lerp(other.normal, t),
      this.uv.clone().lerp(other.uv, t),
      this.color && other.color
        ? this.color.clone().lerp(other.color, t)
        : undefined,
    );
  }
}
