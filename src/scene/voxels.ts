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
  type Material,
} from 'three';
import { palette, SHADOW_FACTOR } from '../palette';

/** Uniforms shared by every world material so a lightning flash brightens all islands together. */
export const worldUniforms = {
  uFlash: { value: 0 },
  uFlashColor: { value: new Color(palette.flash) },
};

/** Adds the flash lift to a material's fragment shader. */
export function withFlash<M extends Material>(material: M, strength = 1): M {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFlash = worldUniforms.uFlash;
    shader.uniforms.uFlashColor = worldUniforms.uFlashColor;
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float uFlash;\nuniform vec3 uFlashColor;\nvoid main() {')
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>\n  gl_FragColor.rgb = mix(gl_FragColor.rgb, uFlashColor, clamp(uFlash * ${strength.toFixed(2)}, 0.0, 1.0));`,
      );
  };
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
    const len = a.distanceTo(b);
    tmpP.copy(a).add(b).multiplyScalar(0.5);
    tmpQ.setFromUnitVectors(UP, Y.copy(b).sub(a).normalize());
    tmpS.set(thickness, len, thickness);
    return this.push(new Matrix4().compose(tmpP, tmpQ, tmpS), color);
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

/** Lit windows, lamps and screens: unshaded, and barely touched by the flash. */
export function emissiveMaterial(): MeshBasicMaterial {
  return withFlash(new MeshBasicMaterial({ vertexColors: true }), 0.15);
}
