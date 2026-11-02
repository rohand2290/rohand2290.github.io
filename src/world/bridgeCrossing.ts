import type { BridgeEnd, IslandGraph } from './graph';
import type { Point3 } from './navGrid';

/**
 * Walking a rope bridge like a tightrope. The route is: the head cell on the near island →
 * the bridge's own curve (the same one its planks are laid on) → the head cell on the far
 * island. Position is measured in world units along that route (arc length), so speed is even.
 * Plain numbers, no three.js.
 */

/** About 1.5 seconds per 10 voxels of bridge. */
export const CROSS_SPEED = 10 / 1.5;
/** Feet stand on top of the planks. */
export const PLANK_TOP = 0.07;
/** Side-to-side sway amplitude (radians) for bridge weights 1, 2, 3: thin ropes wobble more. */
export const SWAY_AMPLITUDE = [0.16, 0.1, 0.05] as const;
/** The lightning wobble never tips past this; nobody falls. */
export const MAX_ROLL = 0.75;

const SAMPLES = 96;

export interface CrossingSample {
  p: Point3;
  /** Curve parameter 0–1 of the bridge (in the bridge's own from→to direction), or null on the grass. */
  t: number | null;
  /** 0 on the grass, rising to 1 once fully out on the planks (scales the sway). */
  onRope: number;
}

export class Crossing {
  readonly from: BridgeEnd;
  readonly to: BridgeEnd;
  readonly weight: 1 | 2 | 3;
  /** Distance along the route; 0 at the near head cell. */
  s = 0;
  readonly total: number;
  /** Direction of travel along the route, +1 toward the far island. */
  heading = 1;
  /** True while walking itself across (E or click); a movement key takes over manually. */
  auto: boolean;
  readonly balance: Balance;

  private readonly start: Point3;
  private readonly end: Point3;
  private readonly l0: number;
  private readonly lc: number;
  /** Cumulative arc length at each curve sample, travelling from `from` to `to`. */
  private readonly arc: number[] = [];
  private readonly point: (u: number) => Point3;
  private readonly toT: (u: number) => number;

  constructor(graph: IslandGraph, from: BridgeEnd, auto: boolean) {
    this.from = from;
    this.to = graph.opposite(from);
    const path = graph.edges[from.bridge].path;
    this.weight = path.spec.weight;
    this.auto = auto;
    this.balance = new Balance(this.weight);
    // u runs 0→1 in our direction of travel; t is the curve's own parameter.
    this.toT = from.atStart ? (u) => u : (u) => 1 - u;
    this.point = (u) => {
      const p = path.point(this.toT(u));
      return { x: p.x, y: p.y + PLANK_TOP, z: p.z };
    };
    this.start = graph.grid.center(from.head);
    this.end = graph.grid.center(this.to.head);

    let acc = 0;
    let prev = this.point(0);
    this.arc.push(0);
    for (let i = 1; i <= SAMPLES; i++) {
      const p = this.point(i / SAMPLES);
      acc += Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z);
      this.arc.push(acc);
      prev = p;
    }
    this.lc = acc;
    const c0 = this.point(0);
    const c1 = this.point(1);
    this.l0 = Math.hypot(c0.x - this.start.x, c0.z - this.start.z);
    const l2 = Math.hypot(this.end.x - c1.x, this.end.z - c1.z);
    this.total = this.l0 + this.lc + l2;
  }

  /** Horizontal direction from the near head to the far head. */
  get direction(): { x: number; z: number } {
    const dx = this.end.x - this.start.x;
    const dz = this.end.z - this.start.z;
    const len = Math.hypot(dx, dz) || 1;
    return { x: dx / len, z: dz / len };
  }

  /** Length of the rope part, for the speed check. */
  get ropeLength(): number {
    return this.lc;
  }

  sample(s = this.s): CrossingSample {
    const lerp = (a: Point3, b: Point3, k: number): Point3 => ({
      x: a.x + (b.x - a.x) * k,
      y: a.y + (b.y - a.y) * k,
      z: a.z + (b.z - a.z) * k,
    });
    if (s <= this.l0) {
      return { p: lerp(this.start, this.point(0), this.l0 > 0 ? Math.max(0, s) / this.l0 : 1), t: null, onRope: 0 };
    }
    const sc = s - this.l0;
    if (sc >= this.lc) {
      const l2 = this.total - this.l0 - this.lc;
      return { p: lerp(this.point(1), this.end, l2 > 0 ? Math.min(1, (sc - this.lc) / l2) : 1), t: null, onRope: 0 };
    }
    // Binary search the arc-length table for the curve parameter.
    let lo = 0;
    let hi = SAMPLES;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.arc[mid] <= sc) lo = mid;
      else hi = mid;
    }
    const span = this.arc[hi] - this.arc[lo];
    const u = (lo + (span > 0 ? (sc - this.arc[lo]) / span : 0)) / SAMPLES;
    const edge = Math.min(sc, this.lc - sc);
    return { p: this.point(u), t: this.toT(u), onRope: Math.min(1, edge / 0.8) };
  }

  /**
   * Advance by dt. `along` is +1 (toward the far island), -1 (back) or 0 (no key held).
   * Returns 'far' or 'near' when the walker steps off an end, else null.
   */
  update(dt: number, along: -1 | 0 | 1, reducedMotion: boolean): 'far' | 'near' | null {
    if (along !== 0) this.auto = false;
    const dir = this.auto ? 1 : along;
    if (dir !== 0) this.heading = dir;
    this.s += dir * CROSS_SPEED * dt;
    const onRope = this.sample().onRope;
    this.balance.update(dt, dir !== 0, onRope, reducedMotion);
    if (this.s >= this.total) {
      this.s = this.total;
      return 'far';
    }
    if (this.s <= 0) {
      this.s = 0;
      return dir < 0 ? 'near' : null;
    }
    return null;
  }
}

/**
 * Side-to-side balance: a steady sway whose size depends on the bridge weight, plus a damped
 * spring for the big lightning wobble. Pure math so it can be tested on its own.
 */
export class Balance {
  /** Current roll in radians (positive leans one way, negative the other). */
  roll = 0;
  private phase = 0;
  private wobble = 0;
  private wobbleVel = 0;

  constructor(readonly weight: 1 | 2 | 3) {}

  get amplitude(): number {
    return SWAY_AMPLITUDE[this.weight - 1];
  }

  /** The big exaggerated wobble after a lightning flash. */
  kick() {
    this.wobbleVel += 3.4 * (Math.sin(this.phase) >= 0 ? 1 : -1);
  }

  get wobbling(): boolean {
    return Math.abs(this.wobble) > 0.01 || Math.abs(this.wobbleVel) > 0.05;
  }

  update(dt: number, moving: boolean, onRope: number, reducedMotion: boolean) {
    if (reducedMotion) {
      this.roll = 0;
      this.wobble = this.wobbleVel = 0;
      return;
    }
    // Walking: about one sway each way per second. Standing still: slower, smaller idle sway.
    this.phase += dt * Math.PI * 2 * (moving ? 0.85 : 0.45);
    const amp = this.amplitude * (moving ? 1 : 0.6) * onRope;
    // Damped spring (ζ ≈ 0.35): one big lurch, a smaller one back, then settled in ~2s.
    const K = 30;
    const C = 3.8;
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.wobbleVel += (-K * this.wobble - C * this.wobbleVel) * h;
      this.wobble += this.wobbleVel * h;
    }
    const roll = amp * Math.sin(this.phase) + this.wobble;
    this.roll = Math.max(-MAX_ROLL, Math.min(MAX_ROLL, roll));
  }
}
