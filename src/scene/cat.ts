import { Group, Mesh, Vector3 } from 'three';
import { propColors } from '../palette';
import { part, pivot } from './creatureParts';

/**
 * A ginger cat sitting on the Royce Hall steps: upright chest with a pale bib, front legs
 * together, haunches tucked, tail curled round. It swishes its tail, blinks, flicks an ear now
 * and then, and every few seconds turns its head to look somewhere else. Faces +z in its own frame.
 */

export class StepCat {
  readonly group = new Group();
  private readonly head: Group;
  private readonly tail: Group;
  private readonly tailTip: Group;
  private readonly ears: Group[] = [];
  private readonly eyes: Mesh[] = [];
  private headYaw = 0;
  private placedStill = false;

  /** `at` is the top of the step the cat sits on; `facing` is its yaw (0 faces +z). */
  constructor(at: Vector3, facing: number) {
    const { catFur: fur, catCream: cream, catEye: eye, catNose: nose } = propColors;
    const g = this.group;
    g.position.copy(at);
    g.rotation.y = facing;
    g.scale.setScalar(1.7);

    // Haunches and back paws.
    part(g, fur, 0, 0.065, -0.03, 0.17, 0.13, 0.2);
    for (const s of [-1, 1]) part(g, cream, s * 0.07, 0.015, 0.05, 0.05, 0.03, 0.07);
    // Upright chest with a cream bib.
    part(g, fur, 0, 0.17, 0.05, 0.13, 0.17, 0.11);
    part(g, cream, 0, 0.17, 0.106, 0.09, 0.12, 0.012);
    // Front legs and paws.
    for (const s of [-1, 1]) {
      part(g, fur, s * 0.035, 0.07, 0.09, 0.04, 0.13, 0.04);
      part(g, cream, s * 0.035, 0.015, 0.105, 0.045, 0.03, 0.06);
    }

    // Head on a neck pivot so it can turn.
    const head = pivot(g, 0, 0.27, 0.07);
    part(head, fur, 0, 0.03, 0, 0.15, 0.12, 0.12);
    part(head, cream, 0, 0.0, 0.065, 0.075, 0.05, 0.03); // muzzle
    part(head, nose, 0, 0.022, 0.081, 0.022, 0.016, 0.01);
    for (const s of [-1, 1]) {
      this.eyes.push(part(head, eye, s * 0.036, 0.045, 0.062, 0.026, 0.028, 0.01));
      const ear = pivot(head, s * 0.045, 0.09, -0.01);
      ear.rotation.z = -s * 0.18;
      part(ear, fur, 0, 0.03, 0, 0.045, 0.06, 0.025);
      part(ear, cream, 0, 0.025, 0.013, 0.022, 0.035, 0.004);
      this.ears.push(ear);
    }
    this.head = head;

    // Tail: curls out behind and round to one side, with a cream tip.
    const tail = pivot(g, 0.04, 0.03, -0.12);
    part(tail, fur, 0.04, 0, -0.03, 0.1, 0.035, 0.035);
    const tip = pivot(tail, 0.09, 0, -0.04);
    part(tip, fur, 0.04, 0, 0.02, 0.08, 0.035, 0.035);
    part(tip, cream, 0.09, 0, 0.04, 0.04, 0.035, 0.035);
    this.tail = tail;
    this.tailTip = tip;
  }

  update(t: number, dt: number, still: boolean): boolean {
    if (still) {
      if (this.placedStill) return false;
      this.placedStill = true;
      this.head.rotation.y = 0;
      this.tail.rotation.y = 0.3;
      this.tailTip.rotation.y = 0.6;
      for (const e of this.eyes) e.scale.y = 0.028;
      return true;
    }
    this.placedStill = false;

    // A slow, lazy swish.
    this.tail.rotation.y = 0.3 + Math.sin(t * 1.3) * 0.35;
    this.tailTip.rotation.y = 0.6 + Math.sin(t * 1.3 - 0.8) * 0.5;

    // Look around: hold each gaze a few seconds, ease between them.
    const gazes = [0, 0.55, -0.45, 0.2, -0.15];
    const target = gazes[Math.floor(t / 3.7) % gazes.length];
    this.headYaw += (target - this.headYaw) * (1 - Math.exp(-dt * 5));
    this.head.rotation.y = this.headYaw;
    this.head.rotation.z = Math.sin(t * 0.6) * 0.05;

    // Blink every ~4s.
    const blink = (t % 4.2) < 0.13;
    for (const e of this.eyes) e.scale.y = blink ? 0.005 : 0.028;

    // An ear twitch now and then.
    const flick = (t % 6.1) < 0.18 ? 0.5 : 0;
    this.ears[1].rotation.x = -flick;
    return true;
  }
}
