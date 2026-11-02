import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import worldJson from '../content/islands.json';
import type { BridgeSpec, IslandSpec, WorldSpec } from '../src/content/types';
import { palette } from '../src/palette';
import { buildBridges } from '../src/scene/bridges';
import { VoxelBatch } from '../src/scene/voxels';

const world = worldJson as WorldSpec;

// ---- Verbatim copy of buildBridges as it was before the character existed. ----
interface OldIsland { top: Vector3; size: number }
function edgePoint(island: OldIsland, toward: Vector3): Vector3 {
  const d = toward.clone().sub(island.top).setY(0);
  const k = island.size / 2 / Math.max(Math.abs(d.x), Math.abs(d.z));
  return island.top.clone().addScaledVector(d, k * 0.97).setY(island.top.y - 0.15);
}
function oldBuildBridges(bridges: BridgeSpec[], islands: Map<string, OldIsland>, solid: VoxelBatch) {
  for (const b of bridges) {
    const from = islands.get(b.from);
    const to = islands.get(b.to);
    if (!from || !to) continue;
    const a = edgePoint(from, to.top);
    const c = edgePoint(to, from.top);
    const len = a.distanceTo(c);
    const width = [0.32, 0.62, 0.95][b.weight - 1];
    const step = b.weight === 1 ? 0.7 : 0.5;
    const plankLen = b.weight === 1 ? 0.36 : step * 1.04;
    const n = Math.max(2, Math.floor(len / step));
    const sag = Math.min(1.6, len * 0.045);
    const point = (t: number) => a.clone().lerp(c, t).setY(a.y + (c.y - a.y) * t - Math.sin(Math.PI * t) * sag);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const dt = plankLen / len / 2;
      solid.plank(point(t - dt), point(t + dt), width, 0.14, palette.ropePlank);
    }
  }
}
// ---- end of the old code ----

describe('bridges look exactly as before', () => {
  it('lays every plank at the identical matrix and color', () => {
    const oldBatch = new VoxelBatch();
    const oldIslands = new Map<string, OldIsland>(
      world.islands.map((s: IslandSpec) => [s.id, { top: new Vector3(...s.position), size: s.footprint }]),
    );
    oldBuildBridges(world.bridges, oldIslands, oldBatch);

    const newBatch = new VoxelBatch();
    const records = buildBridges(world.bridges, new Map(world.islands.map((s) => [s.id, s])), newBatch);

    expect(newBatch.matrices.length).toBe(oldBatch.matrices.length);
    expect(newBatch.matrices.length).toBeGreaterThan(50);
    for (let i = 0; i < oldBatch.matrices.length; i++) {
      expect(Array.from(newBatch.matrices[i].elements)).toEqual(Array.from(oldBatch.matrices[i].elements));
      expect(newBatch.colors[i].getHex()).toBe(oldBatch.colors[i].getHex());
    }
    expect(records).toHaveLength(world.bridges.length);
  });
});
