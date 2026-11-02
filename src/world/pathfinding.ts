import type { Cell, NavGrid } from './navGrid';

const DIRS: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/**
 * A* over one island's grid with 8-way moves (diagonals cost √2 and never cut a prop's corner).
 * Returns the cells to walk through after `from`, ending at `to`, or null if `to` can't be reached.
 */
export function findGridPath(grid: NavGrid, from: Cell, to: Cell): Cell[] | null {
  if (from.island !== to.island || !grid.walkable(to)) return null;
  if (from.i === to.i && from.j === to.j) return [];
  const g = grid.island(from.island);
  const key = (c: Cell) => c.j * g.size + c.i;
  const h = (c: Cell) => {
    const dx = Math.abs(c.i - to.i);
    const dz = Math.abs(c.j - to.j);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  };
  const cost = new Map<number, number>([[key(from), 0]]);
  const prev = new Map<number, Cell>();
  // The grids are at most 16 × 16, so a sorted array is plenty as a priority queue.
  const open: { c: Cell; f: number }[] = [{ c: from, f: h(from) }];
  while (open.length) {
    open.sort((a, b) => a.f - b.f);
    const { c } = open.shift()!;
    if (c.i === to.i && c.j === to.j) {
      const path: Cell[] = [];
      let k: Cell | undefined = c;
      while (k && key(k) !== key(from)) {
        path.unshift(k);
        k = prev.get(key(k));
      }
      return path;
    }
    const base = cost.get(key(c))!;
    for (const [di, dj] of DIRS) {
      if (!grid.canStep(c, di, dj)) continue;
      const n = { island: c.island, i: c.i + di, j: c.j + dj };
      const nc = base + (di && dj ? Math.SQRT2 : 1);
      if (nc < (cost.get(key(n)) ?? Infinity)) {
        cost.set(key(n), nc);
        prev.set(key(n), c);
        open.push({ c: n, f: nc + h(n) });
      }
    }
  }
  return null;
}

// ---------- Between islands ----------

/** Thicker bridges count as shorter, so travel prefers the stronger connections. */
export const WEIGHT_COST = [1, 0.8, 0.65] as const;

export interface GraphEdge {
  a: string;
  b: string;
  /** Bridge index, passed back in the result. */
  id: number;
  length: number;
  weight: 1 | 2 | 3;
}

/**
 * Dijkstra over the island graph: cost of a bridge = its length × WEIGHT_COST[weight].
 * Returns the bridge ids to cross in order, plus the islands visited, or null if unreachable.
 */
export function shortestIslandPath(
  edges: GraphEdge[],
  from: string,
  to: string,
): { bridges: number[]; islands: string[]; cost: number } | null {
  if (from === to) return { bridges: [], islands: [from], cost: 0 };
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, { island: string; bridge: number }>();
  const done = new Set<string>();
  const nodes = new Set<string>([from, to, ...edges.flatMap((e) => [e.a, e.b])]);
  while (true) {
    // Few islands: a linear scan for the closest unvisited node is clearer than a heap.
    let cur: string | null = null;
    let best = Infinity;
    for (const n of nodes) {
      const d = dist.get(n) ?? Infinity;
      if (!done.has(n) && d < best) {
        best = d;
        cur = n;
      }
    }
    if (cur === null) return null;
    if (cur === to) break;
    done.add(cur);
    for (const e of edges) {
      if (e.a !== cur && e.b !== cur) continue;
      const other = e.a === cur ? e.b : e.a;
      const d = best + e.length * WEIGHT_COST[e.weight - 1];
      if (d < (dist.get(other) ?? Infinity)) {
        dist.set(other, d);
        prev.set(other, { island: cur, bridge: e.id });
      }
    }
  }
  const bridges: number[] = [];
  const islands: string[] = [to];
  let k = to;
  while (k !== from) {
    const p = prev.get(k)!;
    bridges.unshift(p.bridge);
    islands.unshift(p.island);
    k = p.island;
  }
  return { bridges, islands, cost: dist.get(to)! };
}
