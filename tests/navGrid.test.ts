import { describe, expect, it } from 'vitest';
import type { IslandSpec } from '../src/content/types';
import { NavGrid } from '../src/world/navGrid';
import { findGridPath } from '../src/world/pathfinding';
import { PlayerController } from '../src/player/controller';

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

describe('PlayerController on the grid', () => {
  it('walks until the island edge, then stops there', () => {
    const g = new NavGrid([island()]);
    const p = new PlayerController(g, { island: 'test', i: 2, j: 2 });
    // Screen left = world (-x, +z): hold it for a long time.
    p.setInput(-1, 0);
    for (let k = 0; k < 200; k++) p.update(1 / 60);
    // (2,2) → (1,3) → (0,4), then the next diagonal step would leave the island.
    expect(p.cell).toEqual({ island: 'test', i: 0, j: 4 });
    expect(p.moving).toBe(false);
    expect(p.sm.state).toBe('idle');
    // Still on the island.
    expect(g.cellAt('test', p.pos.x, p.pos.z)).not.toBeNull();
  });

  it('moves smoothly between cell centers and snaps to them', () => {
    const g = new NavGrid([island()]);
    const p = new PlayerController(g, { island: 'test', i: 2, j: 2 });
    p.setInput(0, 1); // screen up = world (-1, -1)
    p.update(0.1);
    expect(p.moving).toBe(true);
    expect(p.pos.x).toBeLessThan(10 - 0.5 + 0.0001);
    expect(p.pos.x).toBeGreaterThan(8.5);
    p.setInput(0, 0);
    for (let k = 0; k < 30; k++) p.update(1 / 60);
    expect(p.moving).toBe(false);
    expect(p.pos).toEqual(g.center(p.cell));
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
