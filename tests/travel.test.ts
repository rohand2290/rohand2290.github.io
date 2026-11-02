import { describe, expect, it } from 'vitest';
import worldJson from '../content/islands.json';
import type { WorldSpec } from '../src/content/types';
import { FADE_TIME, PlayerController } from '../src/player/controller';
import { IslandGraph } from '../src/world/graph';
import { buildInteractables } from '../src/world/interactables';
import { NavGrid } from '../src/world/navGrid';

const world = worldJson as WorldSpec;
const grid = new NavGrid(world.islands);
const graph = new IslandGraph(world, grid);
const things = buildInteractables(world.islands, grid);
const sign = (island: string) => things.find((t) => t.island === island && t.kind === 'sign')!;
const spawn = () => grid.nearestWalkable(grid.localCell('grove', 2, 5)!)!;

function run(p: PlayerController, seconds: number, until?: () => boolean) {
  const states = new Set<string>();
  for (let t = 0; t < seconds; t += 1 / 60) {
    p.update(1 / 60);
    states.add(p.sm.state);
    if (until?.()) break;
  }
  return states;
}

describe('Auto-travel (nav buttons)', () => {
  it('walks and crosses bridges to the island sign, then reads', () => {
    for (const island of ['campus', 'lab', 'arcade', 'lighthouse']) {
      const p = new PlayerController(grid, spawn(), graph, things);
      let arrived = false;
      expect(p.travelTo(sign(island).stand, 'auto', () => (arrived = true))).toBe(true);
      expect(p.sm.state).toBe('autoTraveling');
      let crossed = false;
      for (let t = 0; t < 40 && !arrived; t += 1 / 60) {
        p.update(1 / 60);
        if (p.crossing) crossed = true;
      }
      expect(arrived).toBe(true);
      expect(crossed).toBe(true);
      expect(p.island).toBe(island);
      expect(p.cell).toEqual(sign(island).stand);
      expect(p.sm.state).toBe('reading');
      expect(p.startReading(sign(island))).toBe(true);
      expect(p.sm.state).toBe('reading');
    }
  });

  it('any key interrupts, even halfway across a bridge', () => {
    const p = new PlayerController(grid, spawn(), graph, things);
    p.travelTo(sign('lab').stand, 'auto');
    run(p, 20, () => !!p.crossing && p.crossing.sample().onRope > 0.5);
    expect(p.crossing).not.toBeNull();
    p.interrupt();
    expect(p.traveling).toBe(false);
    expect(p.sm.state).toBe('onBridge');
    const s = p.crossing!.s;
    run(p, 0.5);
    expect(p.crossing!.s).toBe(s); // waits on the rope for keys
  });
});

describe('Click-to-move across islands', () => {
  it('walks over the bridge and ends idle on the other island', () => {
    const p = new PlayerController(grid, spawn(), graph, things);
    const target = grid.nearestWalkable(grid.localCell('arcade', 3, 4)!)!;
    let arrived = false;
    expect(p.walkTo(target, () => (arrived = true))).toBe(true);
    const states = run(p, 30, () => arrived);
    expect(arrived).toBe(true);
    expect(p.cell).toEqual(target);
    expect(p.sm.state).toBe('idle');
    expect(states.has('onBridge')).toBe(true);
    expect(states.has('autoTraveling')).toBe(false);
  });
});

describe('Reading signs', () => {
  it('reads a sign within 2 voxels, faces it, and closes', () => {
    const s = sign('grove');
    const p = new PlayerController(grid, s.stand, graph, things);
    expect(p.nearby).toBe(s);
    const r = p.interact();
    expect(r).toEqual({ kind: 'read', thing: s });
    expect(p.sm.state).toBe('reading');
    p.stopReading();
    expect(p.sm.state).toBe('idle');
  });

  it('shows nothing to read far from every sign', () => {
    const p = new PlayerController(grid, grid.nearestWalkable(grid.localCell('lighthouse', -4, 4)!)!, graph, things);
    expect(p.nearby).toBeNull();
    expect(p.interact()).toBeNull();
  });
});

describe('Fades', () => {
  it('under reduced motion a crossing is a short fade, not a walk', () => {
    const end = graph.endsOn('grove').find((e) => e.other === 'lab')!;
    const p = new PlayerController(grid, end.head, graph, things);
    p.reducedMotion = true;
    p.interact();
    expect(p.crossing).toBeNull();
    expect(p.fadeLevel).toBe(0);
    run(p, FADE_TIME / 2 - 0.05);
    expect(p.fadeLevel).toBeGreaterThan(0.5);
    run(p, FADE_TIME);
    expect(p.island).toBe('lab');
    expect(p.fadeLevel).toBe(0);
    expect(p.sm.state).toBe('idle');
  });

  it('Skip walking jumps straight to the sign behind a fade', () => {
    const p = new PlayerController(grid, spawn(), graph, things);
    let arrived = false;
    p.teleport(sign('lighthouse').stand, () => (arrived = true));
    run(p, FADE_TIME + 0.1);
    expect(arrived).toBe(true);
    expect(p.island).toBe('lighthouse');
    expect(p.fadeLevel).toBe(0);
  });
});

describe('Every bridge, both ways', () => {
  it('can be crossed from each end by holding the key that points along it', () => {
    for (const edge of graph.edges) {
      for (const end of edge.ends) {
        const p = new PlayerController(grid, end.head, graph, things);
        // Turn the bridge's outward direction into the screen-space key a player would hold.
        const sx = (end.out.x - end.out.z) / 2;
        const sy = (-end.out.x - end.out.z) / 2;
        p.setInput(Math.abs(sx) > 0.2 ? Math.sign(sx) : 0, Math.abs(sy) > 0.2 ? Math.sign(sy) : 0);
        for (let t = 0; t < 8 && p.island === end.island; t += 1 / 60) p.update(1 / 60);
        expect(p.island).toBe(end.other);
      }
    }
  });
});
