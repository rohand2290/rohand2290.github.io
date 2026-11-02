import { Color, Matrix4, Vector3, type InstancedMesh } from 'three';
import { palette, propColors } from '../palette';
import type { BridgeSpec, IslandSpec } from '../content/types';
import { bridgePath, plankLayout, type BridgePath } from '../world/bridgePath';
import { beamMatrix, plankMatrix, type VoxelBatch } from './voxels';

export interface BridgeRecord {
  path: BridgePath;
  planks: { t0: number; t1: number }[];
  /** Instance index of the first plank in the solid batch; the planks are contiguous. */
  first: number;
  /** The rope handrails and hangers, which ride the planks down when the character crosses. */
  ropes: RopeLayout;
}

interface RopeLayout {
  /** Curve positions where each handrail bends: the two ends plus every plank center. */
  ts: number[];
  /** For each bend, which plank it rides on (-1 at the ends, which are pinned to the posts). */
  plankOf: number[];
  /** Instance indices of the rail segments: [side][segment], segment k runs bend k → k + 1. */
  rails: number[][];
  /** Hangers from rail down to the deck edge: one per [side, bend]. */
  hangers: { side: number; bend: number; index: number }[];
}

const v = (p: { x: number; y: number; z: number }) => new Vector3(p.x, p.y, p.z);

/** Handrail height above the deck at the posts and at the middle of the span. */
const RAIL_TOP = 0.95;
const RAIL_LOW = 0.5;
const ROPE = 0.05;
const HANGER = 0.025;
const POST = 0.2;
/** Board-to-board shade, so the deck reads as separate planks. */
const BOARD_SHADES = [1, 0.92, 0.97, 0.9, 1, 0.95];

/** Horizontal unit vector across the bridge (to its right when walking a → c). */
function across(path: BridgePath): Vector3 {
  const d = new Vector3(path.c.x - path.a.x, 0, path.c.z - path.a.z).normalize();
  return new Vector3(-d.z, 0, d.x);
}

/** Half the gap between the two handrails. */
const railHalf = (path: BridgePath) => path.width / 2 + 0.06;

/** A point on the handrail on `side` (±1) at curve position t, with the deck dipped by `dip`. */
function railPoint(path: BridgePath, side: number, t: number, dip: number, out = new Vector3()): Vector3 {
  const p = path.point(t);
  const h = RAIL_TOP - (RAIL_TOP - RAIL_LOW) * Math.sin(Math.PI * t);
  return out.set(p.x, p.y + h - dip, p.z).addScaledVector(across(path), side * railHalf(path));
}

/** Where a hanger meets the deck edge. */
function deckPoint(path: BridgePath, side: number, t: number, dip: number, out = new Vector3()): Vector3 {
  const p = path.point(t);
  return out.set(p.x, p.y + path.thickness / 2 - dip, p.z).addScaledVector(across(path), side * (path.width / 2));
}

/** An end post sunk into the island: a squared shaft, a rope lashing near the top and an octagonal cap. */
function post(solid: VoxelBatch, at: Vector3) {
  const { bridgePost, bridgeRope } = propColors;
  const ground = at.y - 0.35;
  const h = RAIL_TOP + 0.5;
  solid.standing(at.x, ground, at.z, POST, h, POST, bridgePost);
  solid.standing(at.x, at.y + RAIL_TOP - 0.06, at.z, POST + 0.06, 0.12, POST + 0.06, bridgeRope);
  solid.octagon(at.x, ground + h, at.z, POST + 0.08, 0.1, bridgePost);
  solid.octagon(at.x, ground + h + 0.1, at.z, POST - 0.04, 0.06, bridgePost);
}

/**
 * Rope bridges, after a classic low-poly suspension footbridge: separate deck boards, a post at
 * each corner with a rope lashing, two sagging rope handrails and thin hangers down to the deck.
 * Weight still reads as "how related two areas are": weight 1 is a narrow, gappy run of boards;
 * weight 2 and 3 are closer-laid and progressively wider. The curve itself lives in
 * world/bridgePath.ts so the character walks the same one.
 */
export function buildBridges(bridges: BridgeSpec[], islands: Map<string, IslandSpec>, solid: VoxelBatch): BridgeRecord[] {
  const out: BridgeRecord[] = [];
  const shade = new Color();
  for (const b of bridges) {
    const from = islands.get(b.from);
    const to = islands.get(b.to);
    if (!from || !to) continue;
    const path = bridgePath(b, from, to);
    const planks = plankLayout(path);
    let first = -1;
    planks.forEach(({ t0, t1 }, k) => {
      shade.set(palette.ropePlank).multiplyScalar(BOARD_SHADES[k % BOARD_SHADES.length]);
      const i = solid.plank(v(path.point(t0)), v(path.point(t1)), path.width, path.thickness, shade);
      if (first < 0) first = i;
    });

    // Posts at the four corners, just inside each island's edge.
    const side = across(path);
    const dir = new Vector3(path.c.x - path.a.x, 0, path.c.z - path.a.z).normalize();
    for (const [end, back] of [[path.a, -1], [path.c, 1]] as const) {
      for (const s of [-1, 1]) {
        post(solid, v(end).addScaledVector(side, s * railHalf(path)).addScaledVector(dir, back * 0.12));
      }
    }

    // Handrails bend at every plank center; hangers drop from every other bend.
    const ts = [0, ...planks.map(({ t0, t1 }) => (t0 + t1) / 2), 1];
    const plankOf = ts.map((_, k) => (k === 0 || k === ts.length - 1 ? -1 : k - 1));
    const rails: number[][] = [];
    const hangers: RopeLayout['hangers'] = [];
    for (const [si, s] of [[0, -1], [1, 1]] as const) {
      const segs: number[] = [];
      for (let k = 0; k < ts.length - 1; k++) {
        segs.push(solid.beam(railPoint(path, s, ts[k], 0), railPoint(path, s, ts[k + 1], 0), ROPE, propColors.bridgeRope));
      }
      rails.push(segs);
      for (let k = 2; k < ts.length - 2; k += 2) {
        const index = solid.beam(deckPoint(path, s, ts[k], 0), railPoint(path, s, ts[k], 0), HANGER, propColors.bridgeRope);
        hangers.push({ side: si, bend: k, index });
      }
    }
    out.push({ path, planks, first, ropes: { ts, plankOf, rails, hangers } });
  }
  return out;
}

/**
 * Lowers planks under the character and lets them spring back behind. `offsets[k]` is how far
 * plank k currently sits below its resting place; at 0 the matrix is exactly the original one.
 * The handrails and hangers ride down with the planks they hang from.
 */
export class BridgeDip {
  private readonly offsets: number[][];
  private readonly m = new Matrix4();
  private readonly p0 = new Vector3();
  private readonly p1 = new Vector3();
  /** Bridge index and curve position (0–1) of the character, or null when off every bridge. */
  load: { bridge: number; t: number; depth: number } | null = null;

  constructor(private readonly bridges: BridgeRecord[], private readonly mesh: InstancedMesh) {
    this.offsets = bridges.map((b) => b.planks.map(() => 0));
  }

  /** Returns true if any plank moved this frame. */
  update(dt: number): boolean {
    let any = false;
    const k = 1 - Math.exp(-dt * 9);
    this.bridges.forEach((b, bi) => {
      const offs = this.offsets[bi];
      let moved = false;
      for (let i = 0; i < offs.length; i++) {
        const { t0, t1 } = b.planks[i];
        const t = (t0 + t1) / 2;
        let target = 0;
        if (this.load && this.load.bridge === bi) {
          // A soft bump around the character, pinned at both anchors.
          const d = ((t - this.load.t) * b.path.length) / 1.6;
          target = this.load.depth * Math.exp(-d * d) * Math.sin(Math.PI * t);
        }
        const next = Math.abs(target - offs[i]) < 1e-4 ? target : offs[i] + (target - offs[i]) * k;
        if (next !== offs[i]) {
          offs[i] = next;
          moved = true;
        }
      }
      if (!moved) return;
      any = true;
      for (let i = 0; i < offs.length; i++) {
        const { t0, t1 } = b.planks[i];
        const a = v(b.path.point(t0));
        const c = v(b.path.point(t1));
        a.y -= offs[i];
        c.y -= offs[i];
        this.mesh.setMatrixAt(b.first + i, plankMatrix(a, c, b.path.width, b.path.thickness, this.m));
      }
      this.mesh.instanceMatrix.addUpdateRange(b.first * 16, offs.length * 16);
      this.updateRopes(b, offs);
      this.mesh.instanceMatrix.needsUpdate = true;
    });
    return any;
  }

  private updateRopes(b: BridgeRecord, offs: number[]) {
    const { ts, plankOf, rails, hangers } = b.ropes;
    const dip = (k: number) => (plankOf[k] < 0 ? 0 : offs[plankOf[k]]);
    rails.forEach((segs, si) => {
      const s = si === 0 ? -1 : 1;
      segs.forEach((index, k) => {
        railPoint(b.path, s, ts[k], dip(k), this.p0);
        railPoint(b.path, s, ts[k + 1], dip(k + 1), this.p1);
        this.mesh.setMatrixAt(index, beamMatrix(this.p0, this.p1, ROPE, this.m));
      });
      // Segments are contiguous per side.
      this.mesh.instanceMatrix.addUpdateRange(segs[0] * 16, segs.length * 16);
    });
    for (const h of hangers) {
      const s = h.side === 0 ? -1 : 1;
      deckPoint(b.path, s, ts[h.bend], dip(h.bend), this.p0);
      railPoint(b.path, s, ts[h.bend], dip(h.bend), this.p1);
      this.mesh.setMatrixAt(h.index, beamMatrix(this.p0, this.p1, HANGER, this.m));
      this.mesh.instanceMatrix.addUpdateRange(h.index * 16, 16);
    }
  }

  /** How far the bridge currently sags at curve position t (for keeping the feet on the planks). */
  offsetAt(bridge: number, t: number): number {
    const b = this.bridges[bridge];
    const offs = this.offsets[bridge];
    if (!b || !offs.length) return 0;
    const n = offs.length;
    const f = Math.min(n - 1, Math.max(0, t * n - 0.5));
    const i = Math.floor(f);
    const j = Math.min(n - 1, i + 1);
    return offs[i] + (offs[j] - offs[i]) * (f - i);
  }
}
