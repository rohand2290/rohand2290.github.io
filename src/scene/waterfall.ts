import { BoxGeometry, Color, Group, Matrix4, Mesh, ShaderMaterial, Vector3 } from 'three';
import { palette, propColors, SHADOW_FACTOR } from '../palette';
import type { IslandSpec } from '../content/types';
import type { LightRig } from '../weather/lights';
import type { IslandRecord } from './islands';
import { TERRAIN_DEPTH } from './terrain';
import { BOB_GLSL, worldUniforms, type VoxelBatch } from './voxels';

/**
 * Waterfalls: a spring among a few stones on the rim, a short stream to the lip, and a sheet of
 * water that spills over and falls past the island's underside, thinning into mist. Every
 * piece is a box whose shader scrolls streaks along it, shaded like the voxels, floating with
 * its island and lifted by the lightning like the rest of the world.
 */

const UP = new Vector3(0, 1, 0);

/** A unit box spanning y ∈ [-1, 0]: local y = 0 is the start of a segment, -1 its end. */
const geometry = new BoxGeometry(1, 1, 1);
geometry.translate(0, -0.5, 0);

const VERT = /* glsl */ `
${BOB_GLSL}
varying float vF;
varying float vX;
varying float vShade;
void main() {
  vF = -position.y;
  vX = position.x + 0.5 + position.z * 0.6;
  vec3 n = normalize(mat3(modelMatrix) * normal);
  vec3 n2 = n * n;
  vShade = n2.y * (n.y > 0.0 ? 1.0 : 0.6) + n2.z * (n.z > 0.0 ? 1.0 : 0.7) + n2.x * (n.x > 0.0 ? ${SHADOW_FACTOR.toFixed(4)} : 0.7);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  wp.y += islandBob(wp.xz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform float uLen;
uniform float uFall;
uniform float uOffset;
uniform float uFlash;
uniform vec3 uFlashColor;
uniform vec3 uDeep;
uniform vec3 uLight;
uniform vec3 uFoam;
varying float vF;
varying float vX;
varying float vShade;
float hash(float n) { return fract(sin(n * 91.3458) * 47453.5453); }
void main() {
  // Five columns across the sheet, each with its own tint and its own train of streaks.
  float c = floor(clamp(vX, 0.0, 0.999) * 5.0);
  float along = vF * uLen + uOffset;
  float speed = mix(0.7, 2.2, uFall);
  float streak = fract(along * 0.6 - uTime * speed + hash(c) * 3.0);
  float dash = step(0.74, streak) * step(streak, 0.74 + mix(0.12, 0.2, hash(c + 3.0)));
  vec3 col = mix(uDeep, uLight, 0.25 + 0.5 * hash(c + 7.0));
  col = mix(col, uFoam, dash * 0.85);
  float a = 0.9;
  if (uFall > 0.5) {
    // White water where it tips over the lip, then the sheet thins out as it falls.
    col = mix(col, uFoam, 1.0 - smoothstep(0.0, 0.05, vF));
    a *= 1.0 - smoothstep(0.4, 1.0, vF);
  }
  col *= vShade;
  col = mix(col, uFlashColor, clamp(uFlash * 0.4, 0.0, 1.0));
  gl_FragColor = vec4(col, a);
}`;

export interface WaterfallSpec {
  /** World angle in degrees (0 = +x, 90 = +z) where the water spills over the rim. */
  angle: number;
  /** Width of the falling sheet. */
  width?: number;
}

/** Builds the matrix for a box running from a to b: `w` wide sideways, `d` thick. */
function segmentMatrix(a: Vector3, b: Vector3, w: number, d: number): Matrix4 {
  const dir = b.clone().sub(a);
  const side = new Vector3().crossVectors(dir, UP);
  if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
  side.normalize();
  const thick = new Vector3().crossVectors(side, dir).normalize();
  // Local +y points back from b to a, so the box's y = 0 face sits at a and y = -1 at b.
  const m = new Matrix4().makeBasis(side.multiplyScalar(w), dir.clone().negate(), thick.multiplyScalar(d));
  return m.setPosition(a);
}

export class Waterfalls {
  readonly group = new Group();
  private readonly time = { value: 0 };

  constructor(specs: IslandSpec[], islands: Map<string, IslandRecord>, lights: LightRig, solid: VoxelBatch) {
    for (const spec of specs) {
      const island = islands.get(spec.id);
      for (const wf of spec.waterfalls ?? []) {
        if (island) this.build(island, wf, lights, solid);
      }
    }
  }

  private material(len: number, fall: boolean, offset: number) {
    const m = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uIslands: worldUniforms.uIslands,
        uFlash: worldUniforms.uFlash,
        uFlashColor: worldUniforms.uFlashColor,
        uTime: this.time,
        uLen: { value: len },
        uFall: { value: fall ? 1 : 0 },
        uOffset: { value: offset },
        uDeep: { value: new Color(propColors.waterDeep) },
        uLight: { value: new Color(propColors.waterLight) },
        uFoam: { value: new Color(propColors.waterFoam) },
      },
      transparent: true,
      depthWrite: false,
    });
    return m;
  }

  private segment(a: Vector3, b: Vector3, w: number, d: number, fall: boolean, offset: number) {
    const mesh = new Mesh(geometry, this.material(a.distanceTo(b), fall, offset));
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(segmentMatrix(a, b, w, d));
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    this.group.add(mesh);
    return a.distanceTo(b);
  }

  private build(island: IslandRecord, wf: WaterfallSpec, lights: LightRig, solid: VoxelBatch) {
    const θ = (wf.angle * Math.PI) / 180;
    const w = wf.width ?? 0.9;
    const { edge, mid, lip, out } = island.rimAt(θ);
    const lift = new Vector3(0, 0.05, 0);

    // The spring: water wells up among three stones on the rim, just outside the walkable square.
    const spring = mid.clone().lerp(edge, 0.4).setY(island.top.y);
    const side = new Vector3(-out.z, 0, out.x);
    for (const [s, f, k] of [[-0.55, -0.15, 0.36], [0.5, -0.25, 0.3], [0.1, -0.5, 0.26]] as const) {
      const p = spring.clone().addScaledVector(side, s * w).addScaledVector(out, f);
      solid.standing(p.x, p.y - 0.04, p.z, k * 1.3, k * 0.8, k, propColors.stone);
    }

    // Stream across the rim to the lip, then a short tip over the edge, then the fall.
    const a = spring.clone().add(lift);
    const b = mid.clone().add(lift);
    const c = lip.clone().addScaledVector(out, 0.05).add(lift);
    const tip = c.clone().addScaledVector(out, 0.35).add(new Vector3(0, -0.4, 0));
    const fallLen = TERRAIN_DEPTH + 4;
    const bottom = tip.clone().add(new Vector3(0, -fallLen, 0));
    let along = 0;
    along += this.segment(a, b, w * 0.6, 0.05, false, along);
    along += this.segment(b, c, w * 0.7, 0.05, false, along);
    along += this.segment(c, tip, w * 0.85, 0.12, false, along);
    this.segment(tip, bottom, w, 0.16, true, along);

    // Spray: a soft pale haze where the sheet frays out under the island.
    const haze = tip.clone().add(new Vector3(0, -fallLen * 0.55, 0));
    lights.addGlow(island.spec.id, haze, 3.6 + w * 1.5, palette.rain, 0.1, {});
    lights.addGlow(island.spec.id, c.clone().add(new Vector3(0, 0.1, 0)), 1.6 + w, propColors.waterFoam, 0.12, {});
  }

  update(t: number, reduced: boolean) {
    if (!reduced) this.time.value = t;
  }
}
