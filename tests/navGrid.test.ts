import { describe, expect, it } from 'vitest';
import type { IslandSpec } from '../src/content/types';
import { NavGrid } from '../src/world/navGrid';
import { findGridPath } from '../src/world/pathfinding';
import { PlayerController, WALK_SPEED } from '../src/player/controller';

const island = (props: IslandSpec['props'] = []): IslandSpec => ({
  id: 'test', name: 'Test', resumeSection: '', position: [10, 2, -4], footprint: 6, label: [0, 0, 0], props,
});

describe('NavGrid', () => {
  it('lays cells on the voxel grid at the island top', () => {
    const g = new NavGrid([island()]);
    expect(g.center({ island: 'test', i: 0, j: 0 })).toEqual({ x: 7.5, y: 2, z: -6.5 });
    expect(g.cellAt('test', 7.9, -6.1)).toEqual({ island: 'test', i: 0, j: 0 });
    expect(g.cellAt('test', 6.9, -6.1)).toBeNull(); // off the west edge
  });

  it('blocks walking off every edge of the island', () => {
    const g = new NavGrid([island()]);
    const corner = { island: 'test', i: 0, j: 0 };
    expect(g.canStep(corner, -1, 0)).toBe(false);
    expect(g.canStep(corner, 0, -1)).toBe(false);
    expect(g.canStep(corner, -1, -1)).toBe(false);
    expect(g.canStep(corner, 1, 1)).toBe(true);
    const far = { island: 'test', i: 5, j: 5 };
    expect(g.canStep(far, 1, 0)).toBe(false);
    expect(g.canStep(far, 0, 1)).toBe(false);
  });

  it('blocks cells under props and never cuts their corners', () => {
    // A 3×3 building at the island center covers the middle cells.
    const g = new NavGrid([island([{ type: 'brick-building', at: [0, 0] }])]);
    expect(g.walkable({ island: 'test', i: 2, j: 2 })).toBe(false);
    expect(g.walkable({ island: 'test', i: 0, j: 0 })).toBe(true);
    // Puddles are walkable.
    const wet = new NavGrid([island([{ type: 'puddle', at: [0, 0], r: 1 }])]);
    expect(wet.walkable({ island: 'test', i: 2, j: 2 })).toBe(true);
    expect(wet.isPuddle('test', 10, -4)).toBe(true);
  });

  it('finds a path around a prop', () => {
    const g = new NavGrid([island([{ type: 'lab-building', at: [0, 0] }])]);
    const path = findGridPath(g, { island: 'test', i: 0, j: 3 }, { island: 'test', i: 5, j: 3 });
    expect(path).not.toBeNull();
    expect(path!.at(-1)).toEqual({ island: 'test', i: 5, j: 3 });
    for (const c of path!) expect(g.walkable(c)).toBe(true);
  });
});

describe('PlayerController free movement', () => {
  it('walks to the island edge, slides along it into the corner, then stops there', () => {
    const g = new NavGrid([island()]);
    const p = new PlayerController(g, { island: 'test', i: 2, j: 2 });
    // Screen left = world (-x, +z): hold it for a long time.
    p.setInput(-1, 0);
    for (let k = 0; k < 200; k++) p.update(1 / 60);
    expect(p.cell).toEqual({ island: 'test', i: 0, j: 5 });
    expect(p.moving).toBe(false);
    expect(p.sm.state).toBe('idle');
    expect(g.cellAt('test', p.pos.x, p.pos.z)).not.toBeNull();
  });

  it('speeds up gradually, runs faster with Shift, and glides to a stop', () => {
    const g = new NavGrid([{ ...island(), footprint: 20 }]);
    const p = new PlayerController(g, { island: 'test', i: 10, j: 19 });
    p.setInput(1, 1); // up-right = world -z, along a grid axis
    p.update(1 / 60);
    expect(p.speed).toBeGreaterThan(0);
    expect(p.speed).toBeLessThan(WALK_SPEED);
    for (let k = 0; k < 20; k++) p.update(1 / 60);
    expect(p.speed).toBeCloseTo(WALK_SPEED, 5);
    p.setInput(1, 1, true);
    for (let k = 0; k < 20; k++) p.update(1 / 60);
    expect(p.speed).toBeGreaterThan(WALK_SPEED * 1.5);
    // Let go: it keeps sliding a little, then stops off the cell centers (no snapping).
    p.setInput(0, 0);
    const z = p.pos.z;
    p.update(1 / 60);
    expect(p.moving).toBe(true);
    expect(p.pos.z).toBeLessThan(z);
    for (let k = 0; k < 60; k++) p.update(1 / 60);
    expect(p.moving).toBe(false);
    expect(p.sm.state).toBe('idle');
  });

  it('jumps and lands, but not twice in the air', () => {
    const g = new NavGrid([island()]);
    const p = new PlayerController(g, { island: 'test', i: 3, j: 3 });
    expect(p.jump()).toBe(true);
    p.update(0.1);
    expect(p.hop).toBeGreaterThan(0.3);
    expect(p.jump()).toBe(false);
    for (let k = 0; k < 60; k++) p.update(1 / 60);
    expect(p.hop).toBe(0);
    expect(p.airborne).toBe(false);
    expect(p.drainEvents().some((e) => e.type === 'footfall')).toBe(true);
  });

  it('slides around a prop instead of walking through it', () => {
    const g = new NavGrid([island([{ type: 'terminal', at: [0, 0] }])]);
    const p = new PlayerController(g, { island: 'test', i: 3, j: 5 });
    p.setInput(1, 1); // world -z, straight at the terminal
    for (let k = 0; k < 120; k++) {
      p.update(1 / 60);
      const c = g.cellAt('test', p.pos.x, p.pos.z)!;
      expect(g.walkable(c)).toBe(true);
    }
  });
});

describe('Spawn point', () => {
  it('starts on open grass with every direction free', async () => {
    const world = (await import('../content/islands.json')).default as unknown as import('../src/content/types').WorldSpec;
    const g = new NavGrid(world.islands);
    const s = world.spawn!;
    const c = g.localCell(s.island, s.at[0], s.at[1])!;
    expect(g.walkable(c)).toBe(true);
    for (const di of [-1, 0, 1]) for (const dj of [-1, 0, 1]) if (di || dj) expect(g.canStep(c, di, dj)).toBe(true);
  });
});
