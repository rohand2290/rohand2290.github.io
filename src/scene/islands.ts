import { Box3, Matrix4, Quaternion, Vector3, Euler } from 'three';
import { palette, propColors } from '../palette';
import type { IslandSpec } from '../content/types';
import type { VoxelBatch } from './voxels';
import type { LightRig } from '../weather/lights';
import { buildProp } from './props';
import { buildTerrain, TERRAIN_DEPTH, type RimSection, type TerrainBatch } from './terrain';

export const ISLAND_DEPTH = TERRAIN_DEPTH;

export interface IslandRecord {
  spec: IslandSpec;
  /** World position of the top center. */
  top: Vector3;
  size: number;
  /** Hit box for hover and click picking. */
  bounds: Box3;
  labelAnchor: Vector3;
  /** The rim's shape along a world angle (where waterfalls spill over). */
  rimAt: (θ: number) => RimSection;
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
  /** Shaded solids that also bloom (the Grove's mushroom caps). */
  glow: VoxelBatch,
  lights: LightRig,
  terrain: TerrainBatch,
  /** World-space angles (atan2(dz, dx)) toward the islands this one bridges to. */
  bridgeAngles: number[] = [],
): IslandRecord {
  const [x, y, z] = spec.position;
  const s = spec.footprint;
  const top = new Vector3(x, y, z);

  // Body: a faceted low-poly chunk of land with an irregular rim and a rocky underside.
  const rand = rng(hash(spec.id));
  const { maxRim, rimPoints, rimAt } = buildTerrain(terrain, { center: top, footprint: s, bridgeAngles, rand });

  // Rocks: a few tumbled stones sitting on the rim, mostly up on the back knolls.
  const rockCount = 3 + Math.floor(rand() * 4);
  const m = new Matrix4();
  const q = new Quaternion();
  const e = new Euler();
  for (let i = 0; i < rockCount; i++) {
    const r = rimPoints[Math.floor(rand() * rimPoints.length)];
    if (r.knoll < 0.08 && rand() < 0.7) continue;
    const size = 0.25 + rand() * 0.35;
    q.setFromEuler(e.set((rand() - 0.5) * 0.6, rand() * Math.PI, (rand() - 0.5) * 0.6));
    const pos = r.p.clone().add(new Vector3(0, size * 0.3, 0));
    m.compose(pos, q, new Vector3(size * (1 + rand() * 0.5), size * 0.75, size));
    solid.push(m.clone(), propColors.stone);
  }

  // Grass specks: little flat voxels scattered on the wet grass.
  const specks = Math.round((s * s) / 7);
  for (let i = 0; i < specks; i++) {
    const sx = x + (rand() - 0.5) * (s - 1);
    const sz = z + (rand() - 0.5) * (s - 1);
    const along = rand() > 0.5;
    solid.box(sx, y + 0.015, sz, along ? 0.36 : 0.14, 0.03, along ? 0.14 : 0.36, palette.grassSpeck);
  }

  const ctx = { solid, emissive, glow, lights, islandId: spec.id, origin: top };
  for (const prop of spec.props) buildProp(ctx, prop);

  lights.addSplashArea(top, s);

  const half = s / 2 + maxRim;
  return {
    spec,
    top,
    size: s,
    bounds: new Box3(new Vector3(x - half, y - ISLAND_DEPTH, z - half), new Vector3(x + half, y + 6, z + half)),
    labelAnchor: top.clone().add(new Vector3(...spec.label)),
    rimAt,
  };
}
