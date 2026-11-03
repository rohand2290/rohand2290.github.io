import {
  HalfFloatType,
  MeshBasicMaterial,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type Material,
  type Mesh,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { withBob } from './voxels';

/**
 * Post-processing for the archipelago: a selective bloom on the things that glow (lit windows,
 * screens, the lighthouse lamp, the Grove's mushrooms) and a tilt-shift blur that keeps a band
 * of the screen sharp and softens the top and bottom, so the islands read as a miniature.
 *
 * The canvas is transparent over the CSS sky, so every pass keeps premultiplied alpha: bloom
 * adds light (and alpha) over the sky instead of painting a black backdrop.
 */

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// Tilt-shift: 9-tap gaussian along one axis, its spread growing with distance from the focus line.
const BLUR_COMMON = /* glsl */ `
uniform vec2 uTexel;
uniform vec2 uDir;
uniform float uFocus;
uniform float uBand;
uniform float uRamp;
uniform float uMaxPx;
varying vec2 vUv;
const float W0 = 0.2270, W1 = 0.1945, W2 = 0.1216, W3 = 0.0540, W4 = 0.0162;
float spread() {
  return smoothstep(uBand, uBand + uRamp, abs(vUv.y - uFocus)) * uMaxPx * 0.25;
}
vec4 blur(vec2 uv, float s) {
  vec2 d = uDir * uTexel * s;
  vec4 c = SRC(uv) * W0;
  c += (SRC(uv + d) + SRC(uv - d)) * W1;
  c += (SRC(uv + 2.0 * d) + SRC(uv - 2.0 * d)) * W2;
  c += (SRC(uv + 3.0 * d) + SRC(uv - 3.0 * d)) * W3;
  c += (SRC(uv + 4.0 * d) + SRC(uv - 4.0 * d)) * W4;
  return c;
}`;

/** First pass: scene + bloom, blurred horizontally. */
const COMPOSITE_H = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform float uBloom;
vec4 composite(vec2 uv) {
  vec4 s = texture2D(tScene, uv);
  vec3 b = texture2D(tBloom, uv).rgb * uBloom;
  return vec4(s.rgb + b, clamp(s.a + max(b.r, max(b.g, b.b)), 0.0, 1.0));
}
#define SRC composite
${BLUR_COMMON}
void main() {
  float s = spread();
  gl_FragColor = s < 0.02 ? composite(vUv) : blur(vUv, s);
}`;

/** Second pass: the vertical half of the blur, straight to the canvas. */
const BLUR_V = /* glsl */ `
uniform sampler2D tScene;
vec4 sampleIt(vec2 uv) { return texture2D(tScene, uv); }
#define SRC sampleIt
${BLUR_COMMON}
void main() {
  float s = spread();
  gl_FragColor = s < 0.02 ? sampleIt(vUv) : blur(vUv, s);
}`;

export interface PostFxOptions {
  /** Meshes that bloom, and how strongly (1 = full color). */
  bloom: [Mesh, number][];
  isPhone: boolean;
}

export class PostFx {
  enabled = true;
  /** Tilt-shift focus line, as a fraction of the screen height from the top. */
  private focus = 0.5;
  private focusTarget = 0.5;

  private readonly sceneRT: WebGLRenderTarget;
  private readonly bloomSrcRT: WebGLRenderTarget;
  private readonly blurRT: WebGLRenderTarget;
  private readonly bloomPass: UnrealBloomPass;
  private readonly hMat: ShaderMaterial;
  private readonly vMat: ShaderMaterial;
  private readonly quad = new FullScreenQuad();
  // Stand-ins for the bloom render. They float with the islands so they line up with the real scene.
  private readonly black = withBob(new MeshBasicMaterial({ color: 0x000000 }), 'bloom-black');
  private readonly bloomMaterials = new Map<Object3D, Material>();
  private readonly swapped: [Mesh, Material | Material[]][] = [];
  private readonly hidden: Object3D[] = [];
  private readonly size = new Vector2();

  constructor(
    private readonly renderer: WebGLRenderer,
    opts: PostFxOptions,
  ) {
    const msaa = renderer.getPixelRatio() < 2 ? 4 : 0;
    this.sceneRT = new WebGLRenderTarget(1, 1, { samples: msaa });
    this.bloomSrcRT = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
    this.blurRT = new WebGLRenderTarget(1, 1, { depthBuffer: false });
    // strength, radius, threshold: a soft, wide glow that only catches the bright emissive colors.
    this.bloomPass = new UnrealBloomPass(new Vector2(256, 256), 0.85, 0.6, 0.18);

    for (const [mesh, k] of opts.bloom) {
      const base = mesh.material as MeshBasicMaterial;
      this.bloomMaterials.set(
        mesh,
        k >= 1 ? base : withBob(new MeshBasicMaterial({ vertexColors: true, color: base.color.clone().multiplyScalar(k) }), 'bloom-dim'),
      );
    }

    const common = {
      uTexel: { value: new Vector2() },
      uFocus: { value: 0.5 },
      // Sharp within ±band of the focus line, fully soft after another `ramp`.
      uBand: { value: opts.isPhone ? 0.26 : 0.2 },
      uRamp: { value: 0.32 },
      uMaxPx: { value: 0 },
    };
    this.hMat = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: COMPOSITE_H,
      uniforms: {
        ...structuredClone(common),
        uTexel: { value: new Vector2() },
        uDir: { value: new Vector2(1, 0) },
        tScene: { value: this.sceneRT.texture },
        tBloom: { value: null },
        uBloom: { value: 1.0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.vMat = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: BLUR_V,
      uniforms: {
        ...structuredClone(common),
        uTexel: { value: new Vector2() },
        uDir: { value: new Vector2(0, 1) },
        tScene: { value: this.blurRT.texture },
      },
      depthTest: false,
      depthWrite: false,
    });
  }

  setSize(w: number, h: number) {
    const dpr = this.renderer.getPixelRatio();
    const W = Math.max(1, Math.round(w * dpr));
    const H = Math.max(1, Math.round(h * dpr));
    this.size.set(W, H);
    this.sceneRT.setSize(W, H);
    this.blurRT.setSize(W, H);
    const bw = Math.max(1, Math.round(W / 2));
    const bh = Math.max(1, Math.round(H / 2));
    this.bloomSrcRT.setSize(bw, bh);
    this.bloomPass.setSize(bw, bh);
    // Up to ~3 CSS px of blur at the very top and bottom edges.
    const maxPx = 3 * dpr;
    for (const m of [this.hMat, this.vMat]) {
      m.uniforms.uTexel.value.set(1 / W, 1 / H);
      m.uniforms.uMaxPx.value = maxPx;
    }
  }

  /** Where the eye is: the tilt-shift band eases toward this screen height (0 top, 1 bottom). */
  setFocus(fromTop: number, snap = false) {
    this.focusTarget = Math.min(0.85, Math.max(0.15, fromTop));
    if (snap) this.focus = this.focusTarget;
  }

  /** True while the focus band is still easing (so reduced-motion rendering keeps drawing). */
  update(dt: number, reduced: boolean): boolean {
    const d = this.focusTarget - this.focus;
    if (Math.abs(d) < 0.001) return false;
    this.focus += reduced ? d : d * (1 - Math.exp(-dt * 3));
    return true;
  }

  render(scene: Scene, camera: Camera) {
    const r = this.renderer;
    if (!this.enabled) {
      r.setRenderTarget(null);
      r.render(scene, camera);
      return;
    }

    // 1. The scene as usual, into a buffer.
    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(scene, camera);

    // 2. Bloom source: glowing meshes in color, every other opaque mesh black (so it still hides
    //    the glow behind it), sprites, rain and other transparent things left out.
    this.prepareBloomScene(scene);
    r.setRenderTarget(this.bloomSrcRT);
    r.clear();
    r.render(scene, camera);
    this.restoreScene();
    this.bloomPass.render(r, this.bloomSrcRT, this.bloomSrcRT, 0, false);
    // The pass leaves the bloom on its own (without the source) in its first horizontal target.
    const bloomTex = (this.bloomPass as unknown as { renderTargetsHorizontal: WebGLRenderTarget[] }).renderTargetsHorizontal[0].texture;

    // 3. Composite + horizontal tilt-shift, then vertical tilt-shift to the canvas.
    const uvFocus = 1 - this.focus;
    this.hMat.uniforms.tBloom.value = bloomTex;
    this.hMat.uniforms.uFocus.value = uvFocus;
    this.vMat.uniforms.uFocus.value = uvFocus;
    this.quad.material = this.hMat;
    r.setRenderTarget(this.blurRT);
    r.clear();
    this.quad.render(r);
    this.quad.material = this.vMat;
    r.setRenderTarget(null);
    r.clear();
    this.quad.render(r);
  }

  private prepareBloomScene(scene: Scene) {
    scene.traverseVisible((o) => {
      const glow = this.bloomMaterials.get(o);
      const mesh = o as Mesh;
      if (glow) {
        this.swapped.push([mesh, mesh.material]);
        mesh.material = glow;
        return;
      }
      if (!mesh.isMesh) {
        if ((o as { isSprite?: boolean }).isSprite || (o as { isPoints?: boolean }).isPoints || (o as { isLine?: boolean }).isLine) {
          o.visible = false;
          this.hidden.push(o);
        }
        return;
      }
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (mats.some((m) => m.transparent)) {
        o.visible = false;
        this.hidden.push(o);
      } else {
        this.swapped.push([mesh, mesh.material]);
        mesh.material = this.black;
      }
    });
  }

  private restoreScene() {
    for (const [mesh, mat] of this.swapped) mesh.material = mat;
    for (const o of this.hidden) o.visible = true;
    this.swapped.length = 0;
    this.hidden.length = 0;
  }
}
