import type { IslandSpec, PropSpec } from '../content/types';
import { GRAPH_NODES, type Cell, type NavGrid, type Point3 } from './navGrid';

/**
 * Things the character can walk up to and read: each island's signpost (opens the island's
 * note) and, on islands with several items, one object per item (a Grove node, an arcade
 * cabinet, the lab building) that opens that item's own note. Plain data, no three.js.
 */

/** Walk within this many voxels of a sign or object to read it. */
export const READ_RANGE = 2;

export interface Interactable {
  island: string;
  /** Content item id, or null for the island's signpost. */
  item: string | null;
  kind: 'sign' | 'object';
  /** Centre and half-size of its footprint on the grass. */
  x: number;
  z: number;
  hw: number;
  hd: number;
  /** Top of the object, for click picking and hint placement. */
  height: number;
  y: number;
  /** A free cell beside it, where auto-travel stops to read it. */
  stand: Cell;
}

/** Footprint half-sizes and height of the props that can carry an item. */
function shape(p: PropSpec): { hw: number; hd: number; h: number } {
  switch (p.type) {
    case 'signpost':
      return { hw: 0.45, hd: 0.15, h: 1.7 };
    case 'lab-building':
      return { hw: 1.3, hd: 1.3, h: 2.6 };
    case 'helix':
      return { hw: 0.7, hd: 0.7, h: 5 };
    case 'arcade-cabinet': {
      const h = Number(p.h ?? 3);
      return h > 3 ? { hw: 0.75, hd: 0.7, h } : { hw: 0.625, hd: 0.575, h };
    }
    case 'terminal':
      return { hw: 0.45, hd: 0.4, h: 1.6 };
    default:
      return { hw: 0.5, hd: 0.5, h: 1 };
  }
}

export function buildInteractables(specs: IslandSpec[], grid: NavGrid): Interactable[] {
  const out: Interactable[] = [];
  for (const spec of specs) {
    const [cx, y, cz] = spec.position;
    const add = (item: string | null, kind: Interactable['kind'], x: number, z: number, hw: number, hd: number, height: number) => {
      // Stand in front of it (toward the viewer), so the character faces it and stays visible.
      const want = grid.cellAt(spec.id, x + hw + 0.6, z + hd + 0.6) ?? grid.cellAt(spec.id, x, z)!;
      const stand = grid.nearestWalkable(want)!;
      out.push({ island: spec.id, item, kind, x, z, hw, hd, height, y, stand });
    };
    for (const p of spec.props) {
      const x = cx + p.at[0];
      const z = cz + p.at[1];
      if (p.type === 'signpost') {
        const s = shape(p);
        add(null, 'sign', x, z, s.hw, s.hd, s.h);
      } else if (p.type === 'graph-sculpture' && Array.isArray(p.nodeItems)) {
        (p.nodeItems as (string | null)[]).forEach((item, i) => {
          if (!item || !GRAPH_NODES[i]) return;
          const [nx, nz, s] = GRAPH_NODES[i];
          add(item, 'object', x + nx, z + nz, s / 2, s / 2, 0.4 + s);
        });
      } else if (typeof p.item === 'string') {
        const s = shape(p);
        add(p.item, 'object', x, z, s.hw, s.hd, s.h);
      }
    }
  }
  return out;
}

/** Distance on the grass from a point to an interactable's footprint (0 if inside it). */
export function distanceTo(it: Interactable, p: Point3): number {
  const dx = Math.max(0, Math.abs(p.x - it.x) - it.hw);
  const dz = Math.max(0, Math.abs(p.z - it.z) - it.hd);
  return Math.hypot(dx, dz);
}

/** The closest thing within reading range on the character's island, if any. */
export function nearestInteractable(all: Interactable[], island: string, p: Point3): Interactable | null {
  let best: Interactable | null = null;
  let bestD = Infinity;
  for (const it of all) {
    if (it.island !== island) continue;
    const d = distanceTo(it, p);
    if (d <= READ_RANGE && d < bestD) {
      best = it;
      bestD = d;
    }
  }
  return best;
}
