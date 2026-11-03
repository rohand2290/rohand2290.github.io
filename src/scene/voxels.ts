import {
  BoxGeometry,
  BufferAttribute,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
  Vector4,
  type Material,
} from 'three';
import { palette, SHADOW_FACTOR } from '../palette';

/** Most islands the float field supports (one vec4 uniform each). */
export const MAX_ISLANDS = 8;

/** Uniforms shared by every world material so a lightning flash brightens all islands together. */
export const worldUniforms = {
  uFlash: { value: 0 },
  uFlashColor: { value: new Color(palette.flash) },
  /** Per island: center x, center z, radius, current float offset. Radius 0 = unused slot. */
  uIslands: { value: Array.from({ length: MAX_ISLANDS }, () => new Vector4(0, 0, 0, 0)) },
  /** What rock fades toward as it drops away: the sky behind the islands. */
  uHaze: { value: new Color(palette.skyStorm) },
  /** Size of one dither cell in device px, so the rock dissolves in the same pixels as the clouds. */
  uDitherPx: { value: 4 },
};

/**
 * The islands' float. Each island bobs on its own; anything at a world (x, z) moves with the
 * island it sits on, and points between islands (the bridges) blend between them by inverse
 * squared distance, so the planks stay attached at both ends. GLSL and CPU versions must match.
 */
export const BOB_GLSL = /* glsl */ `
uniform vec4 uIslands[${MAX_ISLANDS}];
float islandBob(vec2 p) {
  float ws = 0.0;
  float acc = 0.0;
  for (int i = 0; i < ${MAX_ISLANDS}; i++) {
    vec4 d = uIslands[i];
    if (d.z <= 0.0) continue;
    float dist = max(length(p - d.xy) - d.z * 0.5, 0.0);
    float w = 1.0 / (dist * dist + 0.01);
    ws += w;
    acc += w * d.w;
  }
  return ws > 0.0 ? acc / ws : 0.0;
}
`;

/** CPU twin of `islandBob`, for things placed on the CPU (glow sprites, labels, picking). */
export function islandBobAt(x: number, z: number): number {
  let ws = 0;
  let acc = 0;
  for (const d of worldUniforms.uIslands.value) {
    if (d.z <= 0) continue;
    const dist = Math.max(Math.hypot(x - d.x, z - d.y) - d.z * 0.5, 0);
    const w = 1 / (dist * dist + 0.01);
    ws += w;
    acc += w * d.w;
  }
  return ws > 0 ? acc / ws : 0;
}

/** Moves a built-in material's vertices with the island float (in world space, after instancing). */
export function injectBob(shader: { uniforms: Record<string, unknown>; vertexShader: string }) {
  shader.uniforms.uIslands = worldUniforms.uIslands;
  shader.vertexShader = shader.vertexShader
    .replace('void main() {', `${BOB_GLSL}\nvoid main() {`)
    .replace(
      '#include <project_vertex>',
      `vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
  mvPosition = modelMatrix * mvPosition;
  mvPosition.y += islandBob(mvPosition.xz);
  mvPosition = viewMatrix * mvPosition;
  gl_Position = projectionMatrix * mvPosition;`,
    );
}

/** Makes a material float with the islands (for materials that don't flash). */
export function withBob<M extends Material>(material: M, key = 'bob'): M {
  const prev = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    prev(shader, renderer);
    injectBob(shader);
  };
  material.customProgramCacheKey = () => key;
  return material;
}

/** Adds the flash lift to a material's fragment shader, and the island float to its vertices. */
export function withFlash<M extends Material>(material: M, strength = 1): M {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFlash = worldUniforms.uFlash;
    shader.uniforms.uFlashColor = worldUniforms.uFlashColor;
    injectBob(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float uFlash;\nuniform vec3 uFlashColor;\nvoid main() {')
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>\n  gl_FragColor.rgb = mix(gl_FragColor.rgb, uFlashColor, clamp(uFlash * ${strength.toFixed(2)}, 0.0, 1.0));`,
      );
  };
  // The strength is baked into the shader text, so each strength needs its own compiled program.
  material.customProgramCacheKey = () => `flash-${strength.toFixed(2)}`;
  return material;
}

/**
 * Unit cube with face shading baked into vertex colors. The camera only ever sees the top,
 * the +z face (screen left, lit) and the +x face (screen right, shadow), so faces stay flat.
 */
export function shadedCube(shade = true): BoxGeometry {
  const g = new BoxGeometry(1, 1, 1);
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z
  const f = shade ? [SHADOW_FACTOR, 0.7, 1, 0.6, 1, 0.7] : [1, 1, 1, 1, 1, 1];
  const colors = new Float32Array(24 * 3);
  for (let face = 0; face < 6; face++) {
    for (let v = 0; v < 4; v++) colors.set([f[face], f[face], f[face]], (face * 4 + v) * 3);
  }
  g.setAttribute('color', new BufferAttribute(colors, 3));
  return g;
}

const tmpQ = new Quaternion();
const tmpS = new Vector3();
const tmpP = new Vector3();
const X = new Vector3();
const Y = new Vector3();
const Z = new Vector3();
const UP = new Vector3(0, 1, 0);

/** Matrix for a plank lying along a→b. Shared by the bridge builder and the bridge dip. */
export function plankMatrix(a: Vector3, b: Vector3, width: number, thickness: number, out: Matrix4): Matrix4 {
  X.copy(b).sub(a);
  const len = X.length();
  X.normalize();
  Z.crossVectors(X, UP).normalize();
  Y.crossVectors(Z, X).normalize();
  out.makeBasis(X.multiplyScalar(len), Y.multiplyScalar(thickness), Z.multiplyScalar(width));
  tmpP.copy(a).add(b).multiplyScalar(0.5);
  out.setPosition(tmpP);
  return out;
}

/** Matrix for a square-section beam from a to b. Shared by `beam` and the bridge dip. */
export function beamMatrix(a: Vector3, b: Vector3, thickness: number, out: Matrix4): Matrix4 {
  tmpP.copy(a).add(b).multiplyScalar(0.5);
  tmpQ.setFromUnitVectors(UP, Y.copy(b).sub(a).normalize());
  tmpS.set(thickness, a.distanceTo(b), thickness);
  return out.compose(tmpP, tmpQ, tmpS);
}

/** Collects boxes for one material, then builds a single InstancedMesh (one draw call). */
export class VoxelBatch {
  readonly matrices: Matrix4[] = [];
  readonly colors: Color[] = [];

  /** Axis-aligned box. (x, y, z) is the box center. Returns its instance index. */
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string | Color): number {
    tmpP.set(x, y, z);
    tmpQ.identity();
    tmpS.set(sx, sy, sz);
    return this.push(new Matrix4().compose(tmpP, tmpQ, tmpS), color);
  }

  /** Box whose bottom sits at y (handy for props standing on the grass). */
  standing(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string | Color): number {
    return this.box(x, y + sy / 2, z, sx, sy, sz, color);
  }

  /** A square-section beam from a to b (tree branches, graph edges). */
  beam(a: Vector3, b: Vector3, thickness: number, color: string | Color): number {
    return this.push(beamMatrix(a, b, thickness, new Matrix4()), color);
  }

  /**
   * A regular octagonal slab, W across its flats, h tall, bottom at y. Built from four boxes:
   * two axis-aligned strips and two strips turned 45°, each exactly one face wide.
   */
  octagon(x: number, y: number, z: number, W: number, h: number, color: string | Color) {
    const a = W * (Math.SQRT2 - 1); // face length
    this.standing(x, y, z, W, h, a, color);
    this.standing(x, y, z, a, h, W, color);
    for (const turn of [Math.PI / 4, -Math.PI / 4]) {
      tmpQ.setFromAxisAngle(UP, turn);
      this.push(new Matrix4().compose(tmpP.set(x, y + h / 2, z), tmpQ, tmpS.set(a, h, W)), color);
    }
  }

  /** A plank lying along a→b, `width` wide horizontally and `thickness` tall (bridges). */
  plank(a: Vector3, b: Vector3, width: number, thickness: number, color: string | Color): number {
    return this.push(plankMatrix(a, b, width, thickness, new Matrix4()), color);
  }

  push(m: Matrix4, color: string | Color): number {
    this.matrices.push(m);
    this.colors.push(color instanceof Color ? color.clone() : new Color(color));
    return this.matrices.length - 1;
  }

  build(geometry: BoxGeometry, material: MeshBasicMaterial, dynamicColor = false): InstancedMesh {
    const mesh = new InstancedMesh(geometry, material, Math.max(1, this.matrices.length));
    this.matrices.forEach((m, i) => {
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, this.colors[i]);
    });
    mesh.count = this.matrices.length;
    if (dynamicColor && mesh.instanceColor) mesh.instanceColor.setUsage(DynamicDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    return mesh;
  }
}

export function solidMaterial(): MeshBasicMaterial {
  return withFlash(new MeshBasicMaterial({ vertexColors: true }), 0.45);
}

/**
 * The islands' rock. Going down, it hazes toward the sky color and then dissolves in a Bayer
 * dither, so the undersides melt into the weather. `aFade` runs from 0 (solid) to 1 (gone).
 * Dithering rather than alpha keeps the mesh opaque, so it needs no sorting against the props.
 */
export function terrainMaterial(): MeshBasicMaterial {
  const material = solidMaterial();
  const flash = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    flash(shader, renderer);
    shader.uniforms.uHaze = worldUniforms.uHaze;
    shader.uniforms.uDitherPx = worldUniforms.uDitherPx;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'attribute float aFade;\nvarying float vFade;\nvoid main() {\n  vFade = aFade;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `uniform vec3 uHaze;
uniform float uDitherPx;
varying float vFade;
float bayer2(vec2 p) { return fract(p.x / 2.0 + p.y * p.y * 0.75); }
float bayer4(vec2 p) { return bayer2(0.5 * p) * 0.25 + bayer2(p) + 0.03125; }
void main() {
  if (vFade > bayer4(floor(floor(gl_FragCoord.xy) / uDitherPx))) discard;`,
      )
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb = mix(diffuseColor.rgb, uHaze, min(vFade * 2.2, 0.8));');
  };
  material.customProgramCacheKey = () => 'terrain';
  return material;
}

/** Lit windows, lamps and screens: unshaded, and barely touched by the flash. */
export function emissiveMaterial(): MeshBasicMaterial {
  return withFlash(new MeshBasicMaterial({ vertexColors: true }), 0.15);
}
