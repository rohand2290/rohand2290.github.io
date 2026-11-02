import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import worldJson from '../content/islands.json';
import type { WorldSpec } from '../src/content/types';
import { buildBridges } from '../src/scene/bridges';
import { VoxelBatch } from '../src/scene/voxels';

const world = worldJson as WorldSpec;

describe('rope bridges', () => {
  const batch = new VoxelBatch();
  const records = buildBridges(world.bridges, new Map(world.islands.map((s) => [s.id, s])), batch);

  it('builds one record per bridge', () => {
    expect(records).toHaveLength(world.bridges.length);
  });

  it('keeps the same number of boards as before (weight 1 sparse, heavier bridges dense)', () => {
    for (const r of records) {
      const step = r.path.spec.weight === 1 ? 0.7 : 0.5;
      expect(r.planks).toHaveLength(Math.max(2, Math.floor(r.path.length / step)));
    }
  });

  it('lays every board on the curve the character walks', () => {
    const pos = new Vector3();
    for (const r of records) {
      r.planks.forEach(({ t0, t1 }, i) => {
        pos.setFromMatrixPosition(batch.matrices[r.first + i]);
        const a = r.path.point(t0);
        const c = r.path.point(t1);
        expect(pos.x).toBeCloseTo((a.x + c.x) / 2, 6);
        expect(pos.y).toBeCloseTo((a.y + c.y) / 2, 6);
        expect(pos.z).toBeCloseTo((a.z + c.z) / 2, 6);
      });
    }
  });

  it('strings two handrails along every bridge, one segment per bend', () => {
    for (const r of records) {
      expect(r.ropes.rails).toHaveLength(2);
      for (const side of r.ropes.rails) expect(side).toHaveLength(r.planks.length + 1);
    }
  });
});
