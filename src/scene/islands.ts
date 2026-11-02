import { Box3, Vector3 } from 'three';
import { palette } from '../palette';
import type { IslandSpec } from '../content/types';
import type { VoxelBatch } from './voxels';
import type { LightRig } from '../weather/lights';
import { buildProp } from './props';

export const ISLAND_DEPTH = 3;
const GRASS = 0.06;

export interface IslandRecord {
  spec: IslandSpec;
  /** World position of the top center. */
  top: Vector3;
  size: number;
  /** Hit box for hover and click picking. */
  bounds: Box3;
  labelAnchor: Vector3;
}

/** Small deterministic RNG so specks land in the same place on every load. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h;
}

export function buildIsland(
  spec: IslandSpec,
  solid: VoxelBatch,
  emissive: VoxelBatch,
  lights: LightRig,
): IslandRecord {
  const [x, y, z] = spec.position;
  const s = spec.footprint;
  const top = new Vector3(x, y, z);

  // Body: the voxel block reads as one solid slab, so it is drawn as a single scaled cube
  // whose faces carry the lit / shadow dirt colors. Grid lines never appear in the build.
  solid.box(x, y - GRASS - (ISLAND_DEPTH - GRASS) / 2, z, s, ISLAND_DEPTH - GRASS, s, palette.dirtLit);
  solid.box(x, y - GRASS / 2, z, s, GRASS, s, palette.grassWet);

  // Grass specks: little flat voxels scattered on the wet grass.
  const rand = rng(hash(spec.id));
  const specks = Math.round((s * s) / 7);
  for (let i = 0; i < specks; i++) {
    const sx = x + (rand() - 0.5) * (s - 1);
    const sz = z + (rand() - 0.5) * (s - 1);
    const along = rand() > 0.5;
    solid.box(sx, y + 0.015, sz, along ? 0.36 : 0.14, 0.03, along ? 0.14 : 0.36, palette.grassSpeck);
  }

  const ctx = { solid, emissive, lights, islandId: spec.id, origin: top };
  for (const prop of spec.props) buildProp(ctx, prop);

  lights.addSplashArea(top, s);

  const half = s / 2;
  return {
    spec,
    top,
    size: s,
    bounds: new Box3(new Vector3(x - half, y - ISLAND_DEPTH, z - half), new Vector3(x + half, y + 6, z + half)),
    labelAnchor: top.clone().add(new Vector3(...spec.label)),
  };
}
