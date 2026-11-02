import type { WorldSpec } from '../content/types';
import { bridgePath, type BridgePath } from './bridgePath';
import type { Cell, NavGrid, Point3 } from './navGrid';
import { shortestIslandPath, type GraphEdge } from './pathfinding';

/**
 * The archipelago as a graph: islands are nodes, rope bridges are edges. Each bridge end is
 * tied to a "head" cell on its island, the grass cell where a crossing starts and ends.
 */

export interface BridgeEnd {
  bridge: number;
  island: string;
  /** The island at the other end. */
  other: string;
  /** Grass cell the crossing starts from. */
  head: Cell;
  /** Where the planks meet the island. */
  anchor: Point3;
  /** Horizontal unit vector from the head cell out along the bridge. */
  out: { x: number; z: number };
  /** True if this is the bridge's `from` end (curve t = 0). */
  atStart: boolean;
}

export interface BridgeEdge {
  index: number;
  path: BridgePath;
  ends: [BridgeEnd, BridgeEnd];
}

export type RouteLeg = { kind: 'walk'; to: Cell } | { kind: 'cross'; end: BridgeEnd };

export class IslandGraph {
  readonly edges: BridgeEdge[] = [];
  readonly names = new Map<string, string>();

  constructor(spec: WorldSpec, readonly grid: NavGrid) {
    const byId = new Map(spec.islands.map((s) => [s.id, s]));
    for (const s of spec.islands) this.names.set(s.id, s.name);
    spec.bridges.forEach((b, index) => {
      const from = byId.get(b.from);
      const to = byId.get(b.to);
      if (!from || !to) return;
      const path = bridgePath(b, from, to);
      const end = (island: string, other: string, anchor: Point3, toward: Point3, atStart: boolean): BridgeEnd => {
        const cell = grid.cellAt(island, anchor.x, anchor.z)!;
        const head = grid.nearestWalkable(cell)!;
        const c = grid.center(head);
        const dx = toward.x - c.x;
        const dz = toward.z - c.z;
        const len = Math.hypot(dx, dz) || 1;
        return { bridge: index, island, other, head, anchor, out: { x: dx / len, z: dz / len }, atStart };
      };
      this.edges.push({
        index,
        path,
        ends: [end(b.from, b.to, path.a, path.c, true), end(b.to, b.from, path.c, path.a, false)],
      });
    });
  }

  /** Bridge ends whose head cell is `cell`. */
  endsAt(cell: Cell): BridgeEnd[] {
    const out: BridgeEnd[] = [];
    for (const e of this.edges) {
      for (const end of e.ends) {
        if (end.island === cell.island && end.head.i === cell.i && end.head.j === cell.j) out.push(end);
      }
    }
    return out;
  }

  /** The far end of a bridge, seen from `end`. */
  opposite(end: BridgeEnd): BridgeEnd {
    const e = this.edges[end.bridge];
    return e.ends[0] === end ? e.ends[1] : e.ends[0];
  }

  /**
   * Plans a trip from a cell to a cell, possibly on another island: walk to a bridge head,
   * cross, and so on, choosing bridges by Dijkstra. Null if the islands aren't connected.
   */
  planRoute(from: Cell, to: Cell): RouteLeg[] | null {
    const trip = shortestIslandPath(this.graphEdges(), from.island, to.island);
    if (!trip) return null;
    const legs: RouteLeg[] = [];
    let island = from.island;
    for (const b of trip.bridges) {
      const end = this.edges[b].ends.find((e) => e.island === island)!;
      legs.push({ kind: 'walk', to: end.head });
      legs.push({ kind: 'cross', end });
      island = end.other;
    }
    legs.push({ kind: 'walk', to });
    return legs;
  }

  graphEdges(): GraphEdge[] {
    return this.edges.map((e) => ({
      a: e.path.spec.from,
      b: e.path.spec.to,
      id: e.index,
      length: e.path.length,
      weight: e.path.spec.weight,
    }));
  }

  /** Bridges leaving an island. */
  endsOn(island: string): BridgeEnd[] {
    return this.edges.flatMap((e) => e.ends.filter((end) => end.island === island));
  }
}
