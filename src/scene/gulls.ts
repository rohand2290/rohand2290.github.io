import { Group, Vector3 } from 'three';
import { propColors } from '../palette';
import { part } from './creatureParts';

/**
 * Seagulls circling the lighthouse: little low-poly gulls (white body, gold beak, dark wingtips)
 * that glide round the lamp in wide banked loops, now and then breaking into a few wingbeats.
 * Each gull faces +x in its own frame, with wings spread along ±z.
 */

interface Wing {
  inner: Group;
  outer: Group;
  side: number;
}

interface Gull {
  root: Group;
  wings: Wing[];
  radius: number;
  height: number;
  speed: number;
  phase: number;
  /** Offsets the flap bursts so the gulls don't beat in unison. */
  flapPhase: number;
}

function buildGull(): { root: Group; wings: Wing[] } {
  const { gullBody: white, gullTip: tip, gullBeak: beak } = propColors;
  const root = new Group();
  const body = new Group();
  root.add(body);

  part(body, white, 0, 0, 0, 0.5, 0.15, 0.17);
  part(body, white, 0.3, 0.05, 0, 0.16, 0.14, 0.14);
  part(body, beak, 0.42, 0.03, 0, 0.12, 0.04, 0.05);
  for (const s of [-1, 1]) part(body, tip, 0.33, 0.08, s * 0.071, 0.03, 0.03, 0.01);
  part(body, white, -0.32, 0.02, 0, 0.18, 0.04, 0.16);
  part(body, tip, -0.42, 0.02, 0, 0.06, 0.04, 0.12);

  const wings: Wing[] = [];
  for (const side of [-1, 1]) {
    // Inner panel hinges at the shoulder; outer panel hinges at the inner panel's tip.
    const inner = new Group();
    inner.position.set(0.04, 0.05, side * 0.08);
    body.add(inner);
    part(inner, white, 0, 0, side * 0.22, 0.24, 0.03, 0.44);
    const outer = new Group();
    outer.position.set(-0.02, 0, side * 0.44);
    inner.add(outer);
    part(outer, white, -0.02, 0, side * 0.17, 0.18, 0.025, 0.34);
    part(outer, tip, -0.05, 0, side * 0.4, 0.13, 0.025, 0.14);
    wings.push({ inner, outer, side });
  }
  return { root, wings };
}

export class Gulls {
  readonly group = new Group();
  private readonly gulls: Gull[] = [];
  private placedStill = false;

  /** `center` is the lighthouse lamp; gulls loop around and a little above it. */
  constructor(private readonly center: Vector3, count = 3) {
    for (let i = 0; i < count; i++) {
      const { root, wings } = buildGull();
      root.scale.setScalar(1.25 + (i % 2) * 0.2);
      this.group.add(root);
      this.gulls.push({
        root,
        wings,
        radius: 2.6 + i * 0.9,
        height: 0.9 + ((i * 0.7) % 1.6),
        speed: (0.42 - i * 0.06) * (i === 1 ? -1 : 1), // one flies the other way round
        phase: (i * Math.PI * 2) / count,
        flapPhase: i * 2.3,
      });
    }
  }

  /** Returns true if anything moved. With `still`, gulls hold a gliding pose in place. */
  update(t: number, still: boolean): boolean {
    if (still) {
      if (this.placedStill) return false;
      this.placedStill = true;
      for (const g of this.gulls) this.pose(g, g.phase, 0, 0.15);
      return true;
    }
    this.placedStill = false;
    for (const g of this.gulls) {
      const angle = g.phase + t * g.speed;
      const bob = Math.sin(t * 0.7 + g.phase * 2) * 0.25;
      // Mostly gliding with a slight dihedral; every so often a short burst of wingbeats.
      const burst = Math.max(0, Math.sin(t * 0.45 + g.flapPhase) - 0.55) / 0.45;
      const flap = burst * Math.sin(t * 11 + g.flapPhase) * 0.7;
      this.pose(g, angle, bob, 0.12 + flap);
    }
    return true;
  }

  private pose(g: Gull, angle: number, bob: number, wingLift: number) {
    const dir = Math.sign(g.speed);
    g.root.position.set(
      this.center.x + Math.cos(angle) * g.radius,
      this.center.y + g.height + bob,
      this.center.z + Math.sin(angle) * g.radius,
    );
    // Face along the circle (the tangent), banked into the turn.
    g.root.rotation.set(0, 0, 0);
    g.root.rotation.order = 'YXZ';
    g.root.rotation.y = -angle - (dir * Math.PI) / 2;
    g.root.rotation.x = dir * 0.32;
    for (const w of g.wings) {
      w.inner.rotation.x = -w.side * wingLift;
      w.outer.rotation.x = -w.side * wingLift * 0.6;
    }
  }
}
