import { Matrix4, Vector3, type InstancedMesh } from 'three';
import { palette } from '../palette';
import type { BridgeSpec, IslandSpec } from '../content/types';
import { bridgePath, plankLayout, type BridgePath } from '../world/bridgePath';
import { plankMatrix, type VoxelBatch } from './voxels';

export interface BridgeRecord {
  path: BridgePath;
  planks: { t0: number; t1: number }[];
  /** Instance index of the first plank in the solid batch; the planks are contiguous. */
  first: number;
}

const v = (p: { x: number; y: number; z: number }) => new Vector3(p.x, p.y, p.z);

/**
 * Rope bridges. Weight 1 is a dotted run of small planks; weight 2 and 3 are near-solid
 * and progressively wider, so the thickness reads as "how related two areas are".
 * The curve itself lives in world/bridgePath.ts so the character can walk the same one.
 */
export function buildBridges(bridges: BridgeSpec[], islands: Map<string, IslandSpec>, solid: VoxelBatch): BridgeRecord[] {
  const out: BridgeRecord[] = [];
  for (const b of bridges) {
    const from = islands.get(b.from);
    const to = islands.get(b.to);
    if (!from || !to) continue;
    const path = bridgePath(b, from, to);
    const planks = plankLayout(path);
    let first = -1;
    for (const { t0, t1 } of planks) {
      const i = solid.plank(v(path.point(t0)), v(path.point(t1)), path.width, path.thickness, palette.ropePlank);
      if (first < 0) first = i;
    }
    out.push({ path, planks, first });
  }
  return out;
}

/**
 * Lowers planks under the character and lets them spring back behind. `offsets[k]` is how far
 * plank k currently sits below its resting place; at 0 the matrix is exactly the original one.
 */
export class BridgeDip {
  private readonly offsets: number[][];
  private readonly m = new Matrix4();
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
      this.mesh.instanceMatrix.needsUpdate = true;
    });
    return any;
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
