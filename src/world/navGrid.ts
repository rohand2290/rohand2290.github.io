import type { IslandSpec, PropSpec } from '../content/types';

/**
 * Walkable cells on each island's top, one cell per voxel (1 world unit). Plain data, no three.js,
 * so it can be unit tested. Cells are addressed by (i, j): i runs along world x, j along world z.
 */

export interface Cell {
  island: string;
  i: number;
  j: number;
}

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** Half the character's footprint. A cell is blocked if a box this size around its center hits a prop. */
const BODY_HALF = 0.4;

/** Ground footprint (width along x, depth along z) of each prop type that the character can't walk through. */
function propFootprint(p: PropSpec): [number, number] | null {
  switch (p.type) {
    case 'brick-building':
      return [3.1, 3.1];
    case 'lab-building':
      return [2.6, 2.6];
    case 'tree':
      return [0.3, 0.3];
    case 'helix':
      return [0.9, 0.9];
    case 'lighthouse':
      return [1.7, 1.7];
    case 'arcade-cabinet': {
      const h = Number(p.h ?? 3);
      return h > 3 ? [1.5, 1.4] : [1.25, 1.15];
    }
    case 'signpost':
      return [0.9, 0.3];
    case 'terminal':
      return [0.9, 0.8];
    default:
      return null; // puddles, the graph sculpture's flat edges: walk right over them
  }
}

/** The glowing nodes of the Grove sculpture, relative to the sculpture's position: [x, z, size]. */
export const GRAPH_NODES: [number, number, number][] = [
  [-4.4, 0.3, 0.6],
  [-3.0, -4.7, 0.9],
  [-2.9, 4.2, 0.5],
  [1.25, 2.7, 0.62],
  [3.2, -3.3, 0.6],
];

interface Rect {
  x: number;
  z: number;
  hw: number;
  hd: number;
}

export interface IslandGrid {
  spec: IslandSpec;
  size: number;
  /** World x/z of the island's top center, and its top height. */
  cx: number;
  cz: number;
  y: number;
  blocked: boolean[];
  puddles: { x: number; z: number; r: number }[];
}

export class NavGrid {
  readonly islands = new Map<string, IslandGrid>();

  constructor(specs: IslandSpec[]) {
    for (const spec of specs) this.islands.set(spec.id, buildGrid(spec));
  }

  island(id: string): IslandGrid {
    const g = this.islands.get(id);
    if (!g) throw new Error(`Unknown island "${id}"`);
    return g;
  }

  inBounds(c: Cell): boolean {
    const g = this.islands.get(c.island);
    return !!g && c.i >= 0 && c.j >= 0 && c.i < g.size && c.j < g.size;
  }

  /** Off the island edge, or inside a prop: either way the character stops. */
  walkable(c: Cell): boolean {
    if (!this.inBounds(c)) return false;
    const g = this.island(c.island);
    return !g.blocked[c.j * g.size + c.i];
  }

  /**
   * Can the character step from `a` to the neighbour at (di, dj)? Diagonal steps also need both
   * side cells to be free, so the character never squeezes through a prop's corner.
   */
  canStep(a: Cell, di: number, dj: number): boolean {
    const to = { island: a.island, i: a.i + di, j: a.j + dj };
    if (!this.walkable(to)) return false;
    if (di !== 0 && dj !== 0) {
      return this.walkable({ island: a.island, i: a.i + di, j: a.j }) && this.walkable({ island: a.island, i: a.i, j: a.j + dj });
    }
    return true;
  }

  center(c: Cell): Point3 {
    const g = this.island(c.island);
    return { x: g.cx - g.size / 2 + 0.5 + c.i, y: g.y, z: g.cz - g.size / 2 + 0.5 + c.j };
  }

  /** The cell under a world x/z on a given island, or null if it's off that island. */
  cellAt(island: string, x: number, z: number): Cell | null {
    const g = this.islands.get(island);
    if (!g) return null;
    const i = Math.floor(x - (g.cx - g.size / 2));
    const j = Math.floor(z - (g.cz - g.size / 2));
    const c = { island, i, j };
    return this.inBounds(c) ? c : null;
  }

  /** Cell at an island-local [x, z] offset from its center (the coordinates props use). */
  localCell(island: string, lx: number, lz: number): Cell | null {
    const g = this.island(island);
    return this.cellAt(island, g.cx + lx, g.cz + lz);
  }

  /** Nearest walkable cell to `c` on the same island (breadth-first), for clicks that land on a prop. */
  nearestWalkable(c: Cell): Cell | null {
    if (this.walkable(c)) return c;
    const g = this.island(c.island);
    const seen = new Set<number>([c.j * g.size + c.i]);
    let frontier = [c];
    while (frontier.length) {
      const next: Cell[] = [];
      for (const f of frontier) {
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = { island: c.island, i: f.i + di, j: f.j + dj };
          if (!this.inBounds(n)) continue;
          const k = n.j * g.size + n.i;
          if (seen.has(k)) continue;
          seen.add(k);
          if (this.walkable(n)) return n;
          next.push(n);
        }
      }
      frontier = next;
    }
    return null;
  }

  isPuddle(island: string, x: number, z: number): boolean {
    const g = this.islands.get(island);
    return !!g && g.puddles.some((p) => Math.hypot(p.x - x, p.z - z) <= p.r);
  }
}

function buildGrid(spec: IslandSpec): IslandGrid {
  const [cx, y, cz] = spec.position;
  const size = spec.footprint;
  const rects: Rect[] = [];
  const puddles: IslandGrid['puddles'] = [];
  for (const p of spec.props) {
    const px = cx + p.at[0];
    const pz = cz + p.at[1];
    if (p.type === 'puddle') {
      puddles.push({ x: px, z: pz, r: Number(p.r ?? 1) });
      continue;
    }
    if (p.type === 'graph-sculpture') {
      for (const [nx, nz, s] of GRAPH_NODES) rects.push({ x: px + nx, z: pz + nz, hw: s / 2, hd: s / 2 });
      continue;
    }
    const fp = propFootprint(p);
    if (fp) rects.push({ x: px, z: pz, hw: fp[0] / 2, hd: fp[1] / 2 });
  }
  const blocked = new Array<boolean>(size * size).fill(false);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = cx - size / 2 + 0.5 + i;
      const z = cz - size / 2 + 0.5 + j;
      blocked[j * size + i] = rects.some((r) => Math.abs(x - r.x) < r.hw + BODY_HALF && Math.abs(z - r.z) < r.hd + BODY_HALF);
    }
  }
  return { spec, size, cx, cz, y, blocked, puddles };
}
