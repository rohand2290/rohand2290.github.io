import { describe, expect, it } from 'vitest';
import worldJson from '../content/islands.json';
import type { WorldSpec } from '../src/content/types';
import { Balance, CROSS_SPEED, Crossing, MAX_ROLL, PLANK_TOP } from '../src/world/bridgeCrossing';
import { IslandGraph } from '../src/world/graph';
import { NavGrid } from '../src/world/navGrid';
import { PlayerController } from '../src/player/controller';

const world = worldJson as WorldSpec;
const grid = new NavGrid(world.islands);
const graph = new IslandGraph(world, grid);

/** Largest |roll| over `seconds` of steady walking. */
function peakRoll(b: Balance, seconds: number, moving = true) {
  let peak = 0;
  for (let t = 0; t < seconds; t += 1 / 60) {
    b.update(1 / 60, moving, 1, false);
    peak = Math.max(peak, Math.abs(b.roll));
  }
  return peak;
}

describe('IslandGraph', () => {
  it('gives every bridge end a walkable head cell on its island, all distinct', () => {
    const seen = new Set<string>();
    for (const e of graph.edges) {
      for (const end of e.ends) {
        expect(grid.walkable(end.head)).toBe(true);
        const key = `${end.island}:${end.head.i},${end.head.j}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
    expect(seen.size).toBe(world.bridges.length * 2);
  });
});

describe('Crossing position', () => {
  it('follows the bridge curve exactly, standing on top of the planks', () => {
    for (const edge of graph.edges) {
      for (const end of edge.ends) {
        const c = new Crossing(graph, end, true);
        for (let s = 0; s <= c.total; s += 0.37) {
          const { p, t } = c.sample(s);
          if (t === null) continue;
          const q = edge.path.point(t);
          expect(p.x).toBeCloseTo(q.x, 9);
          expect(p.z).toBeCloseTo(q.z, 9);
          expect(p.y).toBeCloseTo(q.y + PLANK_TOP, 9);
        }
      }
    }
  });

  it('starts at the near head cell and ends at the far one', () => {
    const end = graph.edges[0].ends[0];
    const c = new Crossing(graph, end, true);
    expect(c.sample(0).p).toEqual(grid.center(end.head));
    const far = grid.center(graph.opposite(end).head);
    const last = c.sample(c.total).p;
    expect(last.x).toBeCloseTo(far.x, 9);
    expect(last.z).toBeCloseTo(far.z, 9);
  });

  it('is evenly paced: about 1.5 s per 10 voxels of rope', () => {
    const c = new Crossing(graph, graph.edges[0].ends[0], true);
    let time = 0;
    while (c.update(1 / 60, 0, true) !== 'far') time += 1 / 60;
    expect(time).toBeCloseTo(c.total / CROSS_SPEED, 1);
    expect((c.ropeLength / time) * 1.5).toBeGreaterThan(8.5);
    expect((c.ropeLength / time) * 1.5).toBeLessThan(10.5);
  });

  it('reverses on a backward key and pauses with no key', () => {
    const c = new Crossing(graph, graph.edges[0].ends[0], false);
    for (let i = 0; i < 30; i++) c.update(1 / 60, 1, true);
    const mid = c.s;
    expect(mid).toBeGreaterThan(0);
    for (let i = 0; i < 30; i++) c.update(1 / 60, 0, true);
    expect(c.s).toBe(mid); // paused
    let out: string | null = null;
    for (let i = 0; i < 200 && !out; i++) out = c.update(1 / 60, -1, true);
    expect(out).toBe('near'); // walked back off the near end
  });
});

describe('Balance', () => {
  it('thin bridges sway more than thick ones', () => {
    const thin = peakRoll(new Balance(1), 3);
    const mid = peakRoll(new Balance(2), 3);
    const thick = peakRoll(new Balance(3), 3);
    expect(thin).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(thick);
    expect(thick).toBeGreaterThan(0);
  });

  it('a lightning kick makes one big wobble that settles, and never tips over', () => {
    const b = new Balance(3);
    const normal = peakRoll(b, 2);
    b.kick();
    const big = peakRoll(b, 0.6);
    expect(big).toBeGreaterThan(normal * 3);
    expect(big).toBeLessThanOrEqual(MAX_ROLL);
    peakRoll(b, 2.5);
    expect(b.wobbling).toBe(false);
    expect(peakRoll(b, 2)).toBeLessThan(normal * 1.2);
  });

  it('sways a little while paused and not at all under reduced motion', () => {
    const paused = peakRoll(new Balance(1), 3, false);
    expect(paused).toBeGreaterThan(0);
    expect(paused).toBeLessThan(peakRoll(new Balance(1), 3, true));
    const still = new Balance(1);
    still.kick();
    still.update(0.1, true, 1, true);
    expect(still.roll).toBe(0);
  });
});

describe('PlayerController crossing', () => {
  it('walks into the bridge at its head, crosses, and lands on the other island', () => {
    const end = graph.endsOn('grove').find((e) => e.other === 'lab')!;
    const p = new PlayerController(grid, end.head, graph);
    expect(p.bridgeHere?.other).toBe('lab');
    expect(p.interact()).toEqual({ kind: 'cross' });
    expect(p.sm.state).toBe('onBridge');
    for (let i = 0; i < 60 * 6 && p.crossing; i++) p.update(1 / 60);
    expect(p.crossing).toBeNull();
    expect(p.island).toBe('lab');
    expect(p.sm.state).toBe('idle');
    // And straight back the other way.
    expect(p.bridgeHere?.other).toBe('grove');
    p.interact();
    for (let i = 0; i < 60 * 6 && p.crossing; i++) p.update(1 / 60);
    expect(p.island).toBe('grove');
  });

  it('holding a key into the edge at a bridge head steps onto the bridge', () => {
    const end = graph.endsOn('grove').find((e) => e.other === 'campus')!;
    const p = new PlayerController(grid, end.head, graph);
    // Convert the bridge's outward direction (world x/z) back to a screen-space key.
    const sx = (end.out.x - end.out.z) / 2;
    const sy = (-end.out.x - end.out.z) / 2;
    p.setInput(Math.abs(sx) > 0.2 ? Math.sign(sx) : 0, Math.abs(sy) > 0.2 ? Math.sign(sy) : 0);
    p.update(1 / 60);
    expect(p.sm.state).toBe('onBridge');
  });
});
