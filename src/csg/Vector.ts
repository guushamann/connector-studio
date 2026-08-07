// Vendored from three-csg-ts (MIT License, https://github.com/samuelwang17/three-csg-ts)
import { Vector3 } from 'three';

/** Represents a 3D vector. */
export class Vector {
  x: number;
  y: number;
  z: number;

  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  copy(v: Vector): this {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }
  clone(): Vector {
    return new Vector(this.x, this.y, this.z);
  }
  negate(): this {
    this.x *= -1;
    this.y *= -1;
    this.z *= -1;
    return this;
  }
  add(a: Vector): this {
    this.x += a.x;
    this.y += a.y;
    this.z += a.z;
    return this;
  }
  sub(a: Vector): this {
    this.x -= a.x;
    this.y -= a.y;
    this.z -= a.z;
    return this;
  }
  times(a: number): this {
    this.x *= a;
    this.y *= a;
    this.z *= a;
    return this;
  }
  dividedBy(a: number): this {
    this.x /= a;
    this.y /= a;
    this.z /= a;
    return this;
  }
  lerp(a: Vector, t: number): this {
    return this.add(new Vector().copy(a).sub(this).times(t));
  }
  unit(): this {
    return this.dividedBy(this.length());
  }
  length(): number {
    return Math.sqrt(this.x ** 2 + this.y ** 2 + this.z ** 2);
  }
  normalize(): this {
    return this.unit();
  }
  cross(b: Vector): this {
    const ax = this.x,
      ay = this.y,
      az = this.z;
    const bx = b.x,
      by = b.y,
      bz = b.z;
    this.x = ay * bz - az * by;
    this.y = az * bx - ax * bz;
    this.z = ax * by - ay * bx;
    return this;
  }
  dot(b: Vector): number {
    return this.x * b.x + this.y * b.y + this.z * b.z;
  }
  toVector3(): Vector3 {
    return new Vector3(this.x, this.y, this.z);
  }
}
