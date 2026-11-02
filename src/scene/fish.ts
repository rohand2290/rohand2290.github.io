import { Group, Vector3 } from 'three';
import { propColors } from '../palette';
import { part, pivot } from './creatureParts';

/**
 * A little clownfish-style fish that lives in a puddle: every several seconds it leaps out in a
 * short arc across the water, tail flicking, and drops back in. Each leap splashes on the way out
 * and on the way in. The fish faces +x in its own frame.
 */

const JUMP_TIME = 0.9;

interface SplashTarget {
  splash(pos: Vector3): void;
}

function buildFish(): { root: Group; tail: Group } {
  const { fishBody: body, fishStripe: stripe, fishEye: eye } = propColors;
  const root = new Group();
  part(root, body, 0, 0, 0, 0.2, 0.12, 0.07);
  part(root, body, 0.12, -0.005, 0, 0.06, 0.09, 0.06); // snout
  part(root, body, 0.01, 0.075, 0, 0.1, 0.04, 0.025); // dorsal fin
  part(root, body, 0.02, -0.07, 0, 0.06, 0.03, 0.025); // belly fin
  // Pale bands, just proud of the body so they never z-fight.
  part(root, stripe, 0.065, 0, 0, 0.035, 0.125, 0.075);
  part(root, stripe, -0.055, 0, 0, 0.03, 0.115, 0.075);
  for (const s of [-1, 1]) part(root, eye, 0.11, 0.02, s * 0.031, 0.025, 0.025, 0.01);
  const tail = pivot(root, -0.1, 0, 0);
  part(tail, stripe, -0.01, 0, 0, 0.02, 0.09, 0.05);
  part(tail, body, -0.05, 0, 0, 0.06, 0.12, 0.02);
  return { root, tail };
}

export class PuddleFish {
  readonly group: Group;
  private readonly tail: Group;
  private readonly period: number;
  private readonly offset: number;
  private lastJump = -1;
  private inWater = true;
  private heading = 0;
  private readonly tmp = new Vector3();

  /** `center` is the puddle surface, `r` its radius. */
  constructor(private readonly center: Vector3, private readonly r: number, private readonly ripples: SplashTarget, seed: number) {
    const { root, tail } = buildFish();
    root.scale.setScalar(1.9);
    root.visible = false;
    this.group = root;
    this.tail = tail;
    this.period = 5.5 + (seed % 3) * 1.3;
    this.offset = seed * 2.1;
  }

  update(t: number, still: boolean): boolean {
    if (still) {
      const was = this.group.visible;
      this.group.visible = false;
      return was;
    }
    const cycle = (t + this.offset) / this.period;
    const n = Math.floor(cycle);
    const u = ((cycle - n) * this.period) / JUMP_TIME; // 0 → 1 during the leap
    if (u > 1) {
      if (!this.inWater) {
        this.inWater = true;
        this.splashAt(1);
      }
      this.group.visible = false;
      return false;
    }
    if (n !== this.lastJump) {
      // A fresh leap in a new direction; splash where it breaks the surface.
      this.lastJump = n;
      this.heading = (n * 2.39996 + this.offset) % (Math.PI * 2);
      this.inWater = false;
      this.splashAt(0);
    }
    const span = this.r * 0.55;
    const h = 0.8 + this.r * 0.25;
    const x = (u * 2 - 1) * span;
    const y = 4 * h * u * (1 - u) - 0.08;
    const dir = this.tmp.set(Math.cos(this.heading), 0, Math.sin(this.heading));
    this.group.visible = true;
    this.group.position.set(this.center.x + dir.x * x, this.center.y + y, this.center.z + dir.z * x);
    this.group.rotation.order = 'YZX';
    this.group.rotation.y = -this.heading;
    // Nose follows the arc: up on the way out, down on the way in.
    this.group.rotation.z = Math.atan2(4 * h * (1 - 2 * u), 2 * span);
    this.tail.rotation.y = Math.sin(t * 30) * 0.5;
    return true;
  }

  private splashAt(u: number) {
    const x = (u * 2 - 1) * this.r * 0.55;
    const dir = this.tmp.set(Math.cos(this.heading), 0, Math.sin(this.heading));
    this.ripples.splash(new Vector3(this.center.x + dir.x * x, this.center.y + 0.02, this.center.z + dir.z * x));
  }
}
