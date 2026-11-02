import {
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
} from 'three';
import { palette } from '../palette';

const vertexShader = /* glsl */ `
  attribute vec3 aSeed;
  uniform float uTime;
  uniform vec2 uRes;
  uniform float uSpeed;
  uniform float uLen;
  uniform float uWidth;
  uniform float uDepth;
  void main() {
    // Screen-space streaks in CSS pixels, y pointing down.
    float H = uRes.y + uLen * 2.0;
    float W = uRes.x + H / 6.0;
    float speed = uSpeed * (0.85 + 0.3 * aSeed.z);
    float yDown = mod(aSeed.y * H + uTime * speed, H) - uLen;
    // Slant: 1 unit left for every 6 down.
    float x = aSeed.x * W - (yDown + uLen) / 6.0;
    vec2 dir = normalize(vec2(-1.0, 6.0));
    vec2 perp = vec2(dir.y, -dir.x);
    vec2 p = vec2(x, yDown) + dir * position.y * uLen + perp * position.x * uWidth;
    gl_Position = vec4(p.x / uRes.x * 2.0 - 1.0, 1.0 - p.y / uRes.y * 2.0, uDepth, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    gl_FragColor = vec4(uColor, uOpacity);
  }
`;

interface LayerOpts {
  max: number;
  speed: number;
  len: number;
  width: number;
  opacity: number;
  /** Far rain sits behind the islands; near rain falls in front of everything. */
  far: boolean;
}

class RainLayer {
  readonly mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  readonly max: number;

  constructor(o: LayerOpts) {
    this.max = o.max;
    const base = new PlaneGeometry(1, 1);
    const geo = new InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    const seeds = new Float32Array(o.max * 3);
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    geo.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 3));
    geo.instanceCount = o.max;
    const mat = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: o.far,
      // Screen-space y is flipped, which reverses the winding; draw both sides.
      side: DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uRes: { value: new Vector2(1, 1) },
        uSpeed: { value: o.speed },
        uLen: { value: o.len },
        uWidth: { value: o.width },
        uDepth: { value: o.far ? 0.999 : -0.999 },
        uColor: { value: new Color(palette.rain) },
        uOpacity: { value: o.opacity },
      },
    });
    this.mesh = new Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = o.far ? -1 : 10;
  }

  set count(n: number) {
    this.mesh.geometry.instanceCount = Math.max(0, Math.min(this.max, Math.round(n)));
    this.mesh.visible = this.mesh.geometry.instanceCount > 0;
  }
}

export type RainMode = 'storm' | 'drizzle' | 'none';

/** Two layers of GPU rain. Drops wrap to the top when they fall past the bottom. */
export class Rain {
  readonly far: RainLayer;
  readonly near: RainLayer;
  private mode: RainMode = 'storm';
  private density = 1;
  private reduced = false;
  private time = 0;

  constructor(isPhone: boolean) {
    const total = isPhone ? 500 : 1500;
    this.far = new RainLayer({ max: Math.round(total * 0.6), speed: 620, len: 20, width: 1.4, opacity: 0.4, far: true });
    this.near = new RainLayer({ max: Math.round(total * 0.4), speed: 1050, len: 32, width: 2.4, opacity: 0.55, far: false });
    this.apply();
  }

  get meshes() {
    return [this.far.mesh, this.near.mesh];
  }

  setMode(mode: RainMode) {
    this.mode = mode;
    this.apply();
  }

  setReducedMotion(on: boolean) {
    this.reduced = on;
    this.apply();
  }

  /** 0.25–1, lowered automatically when frame time climbs. */
  setDensity(d: number) {
    this.density = d;
    this.apply();
  }

  getDensity() {
    return this.density;
  }

  private apply() {
    let k = this.mode === 'storm' ? 1 : this.mode === 'drizzle' ? 0.4 : 0;
    if (this.reduced) {
      // A few static streaks, so the weather still reads without moving.
      this.far.count = k ? 70 : 0;
      this.near.count = k ? 35 : 0;
      return;
    }
    k *= this.density;
    this.far.count = this.far.max * k;
    this.near.count = this.near.max * k;
    const speedK = this.mode === 'drizzle' ? 0.8 : 1;
    this.far.mesh.material.uniforms.uSpeed.value = 620 * speedK;
    this.near.mesh.material.uniforms.uSpeed.value = 1050 * speedK;
  }

  resize(w: number, h: number) {
    for (const m of this.meshes) m.material.uniforms.uRes.value.set(w, h);
  }

  update(dt: number) {
    if (!this.reduced) this.time += dt;
    for (const m of this.meshes) m.material.uniforms.uTime.value = this.time;
  }
}
