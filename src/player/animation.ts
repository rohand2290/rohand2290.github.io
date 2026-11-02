import { FLINCH_TIME, STRIDE } from './controller';

/**
 * Pose math for the character. Pure numbers in, joint angles out, so it can be tested and
 * reused by any renderer. Angles are radians; positive leg/arm pitch swings forward.
 */

export type AnimMode = 'idle' | 'walk' | 'bridge' | 'read';

export interface AnimInput {
  mode: AnimMode;
  /** Seconds since load (drives breathing). */
  t: number;
  /** Seconds spent in the current mode (drives the idle umbrella twirl). */
  modeTime: number;
  /** Total distance walked, so the walk cycle matches ground speed. */
  distance: number;
  /** Seconds of flinch left (0 when not flinching). */
  flinch: number;
  /** Side-to-side roll from balancing on a bridge, radians (0 on the grass). */
  sway: number;
  reducedMotion: boolean;
  /** 1 = full detail; 0 = phones under load: no breathing, no twirl, smaller swings. */
  detail: number;
  /** While reading: head tilt toward the sign (negative looks up). */
  look?: number;
}

export interface Pose {
  legL: number;
  legR: number;
  armL: number;
  armR: number;
  /** Vertical bounce of the whole body. */
  bob: number;
  /** Torso y-scale for breathing. */
  breathe: number;
  /** Forward lean of the torso (a flinch hunches forward). */
  torsoPitch: number;
  /** Head tilt: negative looks up. */
  headPitch: number;
  /** Whole-body roll (balance sway on bridges). */
  roll: number;
  /** 0 = feet hip-width apart, 1 = one foot in front of the other on the rope. */
  stance: number;
  /** Umbrella tilt from upright: 0 overhead, π/2 held straight out to the side. */
  umbrellaTilt: number;
  /** Spin of the canopy around its shaft (the idle twirl). */
  umbrellaSpin: number;
}

const TWIRL_EVERY = 7.5;
const BRIDGE_STRIDE = 0.6;
const TWIRL_TIME = 0.9;

const smooth = (x: number) => x * x * (3 - 2 * x);

export function computePose(a: AnimInput): Pose {
  const pose: Pose = {
    legL: 0, legR: 0, armL: 0, armR: 0, bob: 0, breathe: 1,
    torsoPitch: 0, headPitch: 0, roll: 0, stance: 0, umbrellaTilt: 0, umbrellaSpin: 0,
  };
  const live = !a.reducedMotion;
  const detail = Math.max(0, Math.min(1, a.detail));

  // Walk cycle: one full swing per two strides, tied to distance so feet don't slide.
  // On a bridge the steps are quicker and shorter, heel to toe.
  const phase = (a.distance / (a.mode === 'bridge' ? BRIDGE_STRIDE : STRIDE)) * Math.PI;
  if (a.mode === 'walk') {
    const swing = 0.55 * (0.6 + 0.4 * detail);
    pose.legL = Math.sin(phase) * swing;
    pose.legR = -pose.legL;
    pose.armL = -pose.legL * 0.8;
    pose.armR = 0.08; // umbrella hand stays steady
    pose.bob = live ? Math.abs(Math.sin(phase)) * 0.05 : 0;
  } else if (a.mode === 'bridge') {
    // Heel to toe: short, careful steps; the free arm and the umbrella go out for balance.
    const swing = 0.22;
    pose.legL = Math.sin(phase) * swing;
    pose.legR = -pose.legL;
    pose.stance = 1;
    pose.umbrellaTilt = Math.PI / 2 - 0.25;
    pose.bob = live ? Math.abs(Math.sin(phase)) * 0.02 : 0;
  } else if (a.mode === 'read') {
    pose.headPitch = a.look ?? -0.38;
    pose.armR = 0.08;
  }

  if (live) {
    pose.roll = a.sway;
    if (a.mode !== 'walk' && detail > 0) {
      // Gentle breathing.
      pose.breathe = 1 + 0.025 * Math.sin(a.t * 2.2) * detail;
    }
    if (a.mode === 'idle' && detail > 0.5) {
      // Every few seconds of standing still, a quick twirl of the umbrella.
      const k = a.modeTime % TWIRL_EVERY;
      const start = TWIRL_EVERY - TWIRL_TIME;
      if (k > start) pose.umbrellaSpin = smooth((k - start) / TWIRL_TIME) * Math.PI * 2;
    }
  }

  // Flinch: a fast hunch in, slower ease back out.
  if (a.flinch > 0 && live) {
    const u = 1 - a.flinch / FLINCH_TIME; // 0 → 1 over the flinch
    const k = u < 0.2 ? smooth(u / 0.2) : 1 - smooth((u - 0.2) / 0.8);
    pose.torsoPitch += 0.32 * k;
    pose.headPitch += 0.25 * k;
    pose.bob -= 0.08 * k;
    pose.armL -= 0.5 * k;
    pose.umbrellaTilt *= 1 - 0.4 * k; // pull the umbrella in closer
  }
  return pose;
}
