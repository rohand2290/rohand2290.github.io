import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import worldJson from '../content/islands.json';
import type { WorldSpec } from '../src/content/types';
import { IslandGraph } from '../src/world/graph';
import { buildInteractables, distanceTo, READ_RANGE } from '../src/world/interactables';
import { NavGrid } from '../src/world/navGrid';
import { findGridPath, shortestIslandPath, type GraphEdge } from '../src/world/pathfinding';

const world = worldJson as WorldSpec;
const grid = new NavGrid(world.islands);
const graph = new IslandGraph(world, grid);

describe('Dijkstra over the island graph', () => {
  const e = (a: string, b: string, id: number, length: number, weight: 1 | 2 | 3 = 1): GraphEdge => ({ a, b, id, length, weight });

  it('takes the cheapest chain of bridges', () => {
    // A–B–C is 10 + 10; A–C directly is 25.
    const edges = [e('A', 'B', 0, 10), e('B', 'C', 1, 10), e('A', 'C', 2, 25)];
    expect(shortestIslandPath(edges, 'A', 'C')).toEqual({ bridges: [0, 1], islands: ['A', 'B', 'C'], cost: 20 });
  });

  it('counts thick bridges as cheaper than thin ones of the same length', () => {
    const edges = [e('A', 'B', 0, 10, 1), e('A', 'B', 1, 10, 3)];
    expect(shortestIslandPath(edges, 'A', 'B')!.bridges).toEqual([1]);
    // A weight-3 bridge 1.4× longer still wins (cost 0.65 × 14 = 9.1 < 10).
    const longer = [e('A', 'B', 0, 10, 1), e('A', 'B', 1, 14, 3)];
    expect(shortestIslandPath(longer, 'A', 'B')!.bridges).toEqual([1]);
  });

  it('works in both directions, handles same-island trips and unreachable islands', () => {
    const edges = [e('A', 'B', 0, 10), e('B', 'C', 1, 10)];
    expect(shortestIslandPath(edges, 'C', 'A')!.islands).toEqual(['C', 'B', 'A']);
    expect(shortestIslandPath(edges, 'B', 'B')).toEqual({ bridges: [], islands: ['B'], cost: 0 });
    expect(shortestIslandPath([...edges, e('X', 'Y', 2, 5)], 'A', 'Y')).toBeNull();
  });

  it('on the real archipelago, every island reaches every other', () => {
    const ids = world.islands.map((i) => i.id);
    for (const a of ids) for (const b of ids) expect(shortestIslandPath(graph.graphEdges(), a, b)).not.toBeNull();
    // Campus → Arcade has no direct bridge, so it goes through another island.
    expect(shortestIslandPath(graph.graphEdges(), 'campus', 'arcade')!.bridges.length).toBe(2);
  });
});

describe('Route planning', () => {
  it('walks to each bridge head, crosses, and walks to the goal, and every walk is possible', () => {
    const ids = world.islands.map((i) => i.id);
    for (const a of ids) {
      for (const b of ids) {
        const from = grid.nearestWalkable(grid.localCell(a, 0, 3)!)!;
        const to = grid.nearestWalkable(grid.localCell(b, 2, 2)!)!;
        const legs = graph.planRoute(from, to)!;
        let at = from;
        for (const leg of legs) {
          if (leg.kind === 'walk') {
            expect(leg.to.island).toBe(at.island);
            expect(findGridPath(grid, at, leg.to)).not.toBeNull();
            at = leg.to;
          } else {
            expect(leg.end.head).toEqual(at);
            at = graph.opposite(leg.end).head;
          }
        }
        expect(at).toEqual(to);
      }
    }
  });
});

describe('Signs and objects', () => {
  const things = buildInteractables(world.islands, grid);

  it('every island has a signpost you can stand next to and read', () => {
    for (const island of world.islands) {
      const signs = things.filter((t) => t.island === island.id && t.kind === 'sign');
      expect(signs).toHaveLength(1);
      const s = signs[0];
      expect(grid.walkable(s.stand)).toBe(true);
      expect(distanceTo(s, grid.center(s.stand))).toBeLessThanOrEqual(READ_RANGE);
    }
  });

  it('no sign or object is read from a bridge head (the two prompts would collide)', () => {
    for (const t of things) expect(graph.endsAt(t.stand)).toEqual([]);
  });

  it('every item on a multi-item island has exactly one object of its own', () => {
    const dir = join(__dirname, '..', 'content');
    for (const island of ['lab', 'grove', 'arcade']) {
      const items = readdirSync(join(dir, island)).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''));
      const objects = things.filter((t) => t.island === island && t.kind === 'object').map((t) => t.item);
      expect(objects.sort()).toEqual(items.sort());
      for (const t of things.filter((t) => t.island === island && t.kind === 'object')) {
        expect(grid.walkable(t.stand)).toBe(true);
        expect(distanceTo(t, grid.center(t.stand))).toBeLessThanOrEqual(READ_RANGE);
      }
    }
  });
});
