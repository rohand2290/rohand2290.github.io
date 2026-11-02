import type { BridgeSpec, IslandSpec } from '../content/types';
import type { Point3 } from './navGrid';

/**
 * The shape of a rope bridge: a straight run between two island edge points that sags in a
 * half-sine. This is the single source of truth for that curve. `buildBridges` lays its planks
 * along it, and the character walks along it, so the crossing always follows the drawn bridge.
 * Plain numbers, no three.js.
 */

export interface BridgePath {
  spec: BridgeSpec;
  /** End on the `from` island and end on the `to` island (just inside each island's top edge). */
  a: Point3;
  c: Point3;
  /** Straight-line distance between the ends. */
  length: number;
  /** How far the middle hangs below the straight line. */
  sag: number;
  /** Plank width: thicker for more related areas. */
  width: number;
  /** Plank thickness. */
  thickness: number;
  /** Point on the curve at t ∈ [0, 1] (0 = a, 1 = c). */
  point(t: number): Point3;
}

/** Plank width for bridge weights 1, 2 and 3. */
export const BRIDGE_WIDTHS = [0.32, 0.62, 0.95] as const;
export const PLANK_THICKNESS = 0.14;

/** Point on the island's top edge in the direction of `toward`. */
function edgePoint(island: IslandSpec, toward: Point3): Point3 {
  const [x, y, z] = island.position;
  const dx = toward.x - x;
  const dz = toward.z - z;
  const k = island.footprint / 2 / Math.max(Math.abs(dx), Math.abs(dz));
  return { x: x + dx * (k * 0.97), y: y - 0.15, z: z + dz * (k * 0.97) };
}

const top = (i: IslandSpec): Point3 => ({ x: i.position[0], y: i.position[1], z: i.position[2] });

export function bridgePath(spec: BridgeSpec, from: IslandSpec, to: IslandSpec): BridgePath {
  const a = edgePoint(from, top(to));
  const c = edgePoint(to, top(from));
  // Same arithmetic as three's Vector3.distanceTo, so the planks land exactly where they always did.
  const dx = a.x - c.x, dy = a.y - c.y, dz = a.z - c.z;
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const sag = Math.min(1.6, length * 0.045);
  return {
    spec,
    a,
    c,
    length,
    sag,
    width: BRIDGE_WIDTHS[spec.weight - 1],
    thickness: PLANK_THICKNESS,
    point(t: number): Point3 {
      return {
        x: a.x + (c.x - a.x) * t,
        y: a.y + (c.y - a.y) * t - Math.sin(Math.PI * t) * sag,
        z: a.z + (c.z - a.z) * t,
      };
    },
  };
}

/** Plank layout along a bridge: each plank spans [t0, t1] of the curve. */
export function plankLayout(path: BridgePath): { t0: number; t1: number }[] {
  const w = path.spec.weight;
  // Heavier bridges are continuous; weight 1 stays a dotted run of planks.
  const step = w === 1 ? 0.7 : 0.5;
  const plankLen = w === 1 ? 0.36 : step * 1.04;
  const n = Math.max(2, Math.floor(path.length / step));
  const out: { t0: number; t1: number }[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const dt = plankLen / path.length / 2;
    out.push({ t0: t - dt, t1: t + dt });
  }
  return out;
}
