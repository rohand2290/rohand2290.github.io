import { BufferAttribute, BufferGeometry, Color, Mesh, Vector3 } from 'three';
import { palette, SHADOW_FACTOR } from '../palette';
import { solidMaterial } from './voxels';

/**
 * Low-poly floating-island terrain. Each island is a faceted grass cap with an irregular rim,
 * knolls along the back edges, and rocky cliffs that taper to a jagged point underneath.
 *
 * The walkable square (the island's footprint) stays at the island's top height so the
 * character, props, puddles and bridges keep standing exactly where they did. All of the
 * topography lives in the rim outside that square and in the underside.
 */

/** How far below the top the underside's point hangs. */
export const TERRAIN_DEPTH = 6;
/** Widest the rim can reach beyond the footprint edge. */
export const MAX_RIM = 2.1;

const N = 40; // angular samples around the top and upper cliffs (multiple of 8 so square corners land on a sample)

const tA = new Vector3();
const tB = new Vector3();
const tN = new Vector3();

/** Collects flat-shaded triangles for every island into one mesh (one draw call). */
export class TerrainBatch {
  private readonly pos: number[] = [];
  private readonly col: number[] = [];

  /** Adds a triangle. Shading is baked from its normal to match the voxel faces' lighting. */
  tri(a: Vector3, b: Vector3, c: Vector3, color: Color) {
    tA.subVectors(b, a);
    tB.subVectors(c, a);
    tN.crossVectors(tA, tB);
    if (tN.lengthSq() < 1e-10) return;
    tN.normalize();
    // Same light as shadedCube: top and +z lit, +x in shadow, undersides darkest.
    let s = 1;
    s -= (1 - SHADOW_FACTOR) * Math.max(0, tN.x);
    s -= 0.14 * Math.max(0, -tN.x);
    s -= 0.3 * Math.max(0, -tN.z);
    s -= 0.42 * Math.max(0, -tN.y);
    for (const v of [a, b, c]) {
      this.pos.push(v.x, v.y, v.z);
      this.col.push(color.r * s, color.g * s, color.b * s);
    }
  }

  build(): Mesh {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.computeBoundingSphere();
    return new Mesh(g, solidMaterial());
  }
}

/** Distance from the center to the footprint square's edge along angle θ, for half-size 1. */
const square = (c: number, s: number) => 1 / Math.max(Math.abs(c), Math.abs(s));
/** Rounded-square outline (superellipse) along angle θ, for half-size 1. */
const roundSquare = (c: number, s: number, p = 5) => 1 / Math.pow(Math.pow(Math.abs(c), p) + Math.pow(Math.abs(s), p), 1 / p);

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function angleDist(a: number, b: number) {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
}

/** Smooth periodic noise in [0, 1] around the island: a few sines with random phases. */
function ringNoise(rand: () => number, freqs: number[]) {
  const phases = freqs.map(() => rand() * Math.PI * 2);
  const amps = freqs.map((_, i) => 1 / (i + 1));
  const total = amps.reduce((a, b) => a + b, 0);
  return (θ: number) => {
    let v = 0;
    freqs.forEach((f, i) => (v += Math.sin(θ * f + phases[i]) * amps[i]));
    return 0.5 + (0.5 * v) / total;
  };
}

function tint(base: string, rand: () => number, amount: number, toward?: string, mix = 0): Color {
  const c = new Color(base);
  if (toward && mix > 0) c.lerp(new Color(toward), mix);
  return c.multiplyScalar(1 + (rand() * 2 - 1) * amount);
}

/** Joins two rings with triangles. `b` may have the same count as `a` or half of it. */
function stitch(
  t: TerrainBatch,
  a: Vector3[],
  b: Vector3[],
  color: (i: number) => Color,
) {
  const n = a.length;
  if (b.length === n) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      // Rings run counter-clockwise seen from above; `a` sits above / inside `b`.
      t.tri(a[i], a[j], b[j], color(i));
      t.tri(a[i], b[j], b[i], color(i));
    }
    return;
  }
  const m = b.length; // n / 2
  for (let k = 0; k < m; k++) {
    const a0 = a[2 * k], a1 = a[2 * k + 1], a2 = a[(2 * k + 2) % n];
    const b0 = b[k], b1 = b[(k + 1) % m];
    t.tri(a0, a1, b0, color(2 * k));
    t.tri(a1, a2, b1, color(2 * k + 1));
    t.tri(a1, b1, b0, color(2 * k + 1));
  }
}

export interface TerrainOptions {
  center: Vector3;
  footprint: number;
  /** World-space angles (atan2(dz, dx)) where bridges meet this island; the rim stays low there. */
  bridgeAngles: number[];
  rand: () => number;
}

export interface TerrainResult {
  /** How far the rim reaches beyond the footprint edge at most. */
  maxRim: number;
  /** Points along the middle of the rim (on the grass), for scattering rocks. */
  rimPoints: { p: Vector3; knoll: number }[];
}

/** Builds one island's terrain into the batch. */
export function buildTerrain(t: TerrainBatch, o: TerrainOptions): TerrainResult {
  const { center: c, footprint, bridgeAngles, rand } = o;
  const H = footprint / 2;
  const rimNoise = ringNoise(rand, [2, 3, 5, 7]);
  const knollNoise = ringNoise(rand, [3, 4, 6]);
  const dropNoise = ringNoise(rand, [2, 5]);

  const angles: number[] = [];
  for (let k = 0; k < N; k++) angles.push((k / N) * Math.PI * 2);

  const at = (θ: number, r: number, h: number) => new Vector3(c.x + Math.cos(θ) * r, c.y + h, c.z + Math.sin(θ) * r);

  // Per-angle rim shape.
  let maxRim = 0;
  const rim = angles.map((θ) => {
    const cs = Math.cos(θ), sn = Math.sin(θ);
    const bridge = bridgeAngles.reduce((m, b) => Math.min(m, smooth(0.1, 0.32, angleDist(θ, b))), 1);
    const edge = square(cs, sn) * H; // footprint edge along θ
    const width = bridge * (0.55 + 1.3 * rimNoise(θ)) + 0.1;
    const outer = Math.max(edge + 0.1, roundSquare(cs, sn) * (H + width));
    maxRim = Math.max(maxRim, outer - edge);
    // Back edges (-x, -z, the top of the screen) rise into knolls; the front stays low so it never hides the character.
    const back = smooth(-0.2, 0.75, -(cs + sn) / Math.SQRT2);
    const knoll = bridge * (back * (0.15 + 0.85 * knollNoise(θ)) * 1.7 + 0.12 * knollNoise(θ + 1.7));
    return { edge, outer, knoll };
  });

  // ---- Grass cap ----
  // Walkable interior: rings at 1/3, 2/3 and the footprint edge, around a center point. Heights
  // only dip a hair below the top so nothing that stands on the grass appears to float.
  const interior: Vector3[][] = [1 / 3, 2 / 3, 1].map((f) =>
    angles.map((θ, k) => {
      const j = f < 1 ? 0.18 : 0;
      const r = rim[k].edge * f + (rand() * 2 - 1) * j;
      const p = at(θ + (f < 1 ? (rand() * 2 - 1) * 0.04 : 0), r, f < 1 ? -rand() * 0.045 : 0);
      return p;
    }),
  );
  const mid = angles.map((θ, k) => {
    const { edge, outer, knoll } = rim[k];
    return at(θ + (rand() * 2 - 1) * 0.03, edge + (outer - edge) * (0.45 + rand() * 0.15), knoll + (rand() * 2 - 1) * 0.06);
  });
  const lip = angles.map((θ, k) => {
    const { outer, knoll } = rim[k];
    return at(θ, outer + (rand() * 2 - 1) * 0.08, knoll * 0.55 - 0.12 - rand() * 0.14);
  });

  // Patchy grass: low-frequency blend toward the speck green, plus per-facet jitter.
  const patch = ringNoise(rand, [1, 2, 3]);
  const grass = (k: number, ring: number) =>
    tint(palette.grassWet, rand, 0.045, palette.grassSpeck, Math.max(0, patch(angles[k] * (1 + ring * 0.35) + ring) - 0.45) * 0.9);
  const centerP = at(0, 0, -0.02);
  for (let k = 0; k < N; k++) t.tri(centerP, interior[0][(k + 1) % N], interior[0][k], grass(k, 0));
  stitch(t, interior[0], interior[1], (k) => grass(k, 1));
  stitch(t, interior[1], interior[2], (k) => grass(k, 2));
  stitch(t, interior[2], mid, (k) => grass(k, 3));
  stitch(t, mid, lip, () => tint(palette.grassWet, rand, 0.05, palette.dirtLit, 0.08));

  // ---- Cliffs and underside ----
  // Each ring pulls inward and drops; vertical jitter gives the rock its faceted look.
  const drop = (k: number) => dropNoise(angles[k]);
  const ring = (src: Vector3[], scale: number, depth: number, jitterY: number, step = 1) => {
    const out: Vector3[] = [];
    for (let k = 0; k < src.length; k += step) {
      const θ = angles[k];
      const r = rim[k].outer * scale * (0.96 + rand() * 0.08);
      out.push(at(θ + (rand() * 2 - 1) * 0.02, r, -depth - drop(k) * jitterY - (rand() * 2 - 1) * jitterY * 0.4));
    }
    return out;
  };
  const sod = ring(lip, 1.0, 0.45, 0.12);
  const cliff1 = ring(lip, 0.99, 1.7, 0.5);
  const cliff2 = ring(lip, 0.92, 3.0, 0.7, 2);
  const under1 = ring(lip, 0.68, 4.1, 0.6, 2);
  const under2 = ring(lip, 0.36, 5.1, 0.5, 4);

  const dirtLit = palette.dirtLit;
  stitch(t, lip, sod, () => tint(palette.grassWet, rand, 0.05, dirtLit, 0.35));
  stitch(t, sod, cliff1, () => tint(dirtLit, rand, 0.06));
  stitch(t, cliff1, cliff2, () => tint(dirtLit, rand, 0.06, palette.dirtShadow, 0.2));
  stitch(t, cliff2, under1, () => tint(dirtLit, rand, 0.06, palette.dirtShadow, 0.45));
  stitch(t, under1, under2, () => tint(palette.dirtShadow, rand, 0.06, palette.bark, 0.2));
  const apex = at(rand() * Math.PI * 2, rand() * 0.6, -TERRAIN_DEPTH + rand() * 0.4);
  for (let k = 0; k < under2.length; k++) {
    t.tri(under2[k], under2[(k + 1) % under2.length], apex, tint(palette.dirtShadow, rand, 0.06, palette.bark, 0.35));
  }

  return { maxRim, rimPoints: mid.map((p, k) => ({ p, knoll: rim[k].knoll })) };
}
