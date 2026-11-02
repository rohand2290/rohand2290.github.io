import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import { solarized, palette, propColors } from '../palette';
import { ISO_RIGHT } from '../scene/camera';
import { shadedCube, solidMaterial, withFlash } from '../scene/voxels';

interface Glow {
  sprite: Sprite | null;
  pool: Mesh | null;
  poolBase: number;
  island: string;
  base: number;
  phase: number;
  period: number;
}

interface Ripple {
  t0: number;
  life: number;
  pos: Vector3;
  r0: number;
  r1: number;
  alpha: number;
}

const RIPPLE_POOL = 64;
const SMOKE_PER_SOURCE = 6;
const SMOKE_EVERY = 1.3;
const SMOKE_LIFE = 6;
const RAIN_RGB = new Color(palette.rain);

function glowTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.15)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}

/**
 * Everything that glows or moves gently on the islands: window glows and their flicker,
 * arcade screens, chimney smoke, the lighthouse beam, puddles and rain ripples.
 */
export class LightRig {
  readonly group = new Group();
  private readonly glows: Glow[] = [];
  private readonly screens: { index: number; color: Color; phase: number }[] = [];
  private readonly smokeSources: Vector3[] = [];
  private readonly puddles: { pos: Vector3; r: number; next: number }[] = [];
  private readonly splashAreas: { top: Vector3; size: number }[] = [];
  private readonly beams: Group[] = [];
  private readonly ripples: (Ripple | null)[] = new Array(RIPPLE_POOL).fill(null);
  private rippleMesh!: InstancedMesh;
  private smokeMesh!: InstancedMesh;
  private emissiveMesh: InstancedMesh | null = null;
  private readonly texture = glowTexture();
  private poolGeo: PlaneGeometry | null = null;
  private splashAcc = 0;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly s = new Vector3();
  private readonly c = new Color();

  hover: string | null = null;
  active: string | null = null;
  /** Rain splashes per second across the whole archipelago. */
  splashRate = 14;
  private now = 0;
  reducedMotion = false;

  /**
   * A soft warm light. `ground` lays a pool of light on the grass at that height (occluded by the
   * prop that casts it, so buildings are not bleached); `halo` adds a billboard glow in the air,
   * drawn over everything when `overlay` is set (small lamps and graph nodes).
   */
  addGlow(
    island: string,
    pos: Vector3,
    size: number,
    color: string,
    base: number,
    opts: { ground?: number; halo?: number; overlay?: boolean } = {},
  ) {
    const col = new Color(color);
    let sprite: Sprite | null = null;
    const haloBase = opts.halo ?? (opts.ground === undefined ? base : base * 0.35);
    if (haloBase > 0) {
      sprite = new Sprite(
        new SpriteMaterial({
          map: this.texture,
          color: col,
          blending: AdditiveBlending,
          transparent: true,
          depthWrite: false,
          depthTest: !opts.overlay,
          opacity: haloBase,
        }),
      );
      sprite.position.copy(pos);
      sprite.scale.set(size, size, 1);
      sprite.renderOrder = 5;
      this.group.add(sprite);
    }
    let pool: Mesh | null = null;
    if (opts.ground !== undefined) {
      if (!this.poolGeo) {
        this.poolGeo = new PlaneGeometry(1, 1);
        this.poolGeo.rotateX(-Math.PI / 2);
      }
      pool = new Mesh(
        this.poolGeo,
        new MeshBasicMaterial({
          map: this.texture,
          color: col,
          blending: AdditiveBlending,
          transparent: true,
          depthWrite: false,
          opacity: base,
        }),
      );
      pool.position.set(pos.x, opts.ground + 0.04, pos.z);
      pool.scale.set(size * 1.1, 1, size * 1.1);
      pool.renderOrder = 2;
      this.group.add(pool);
    }
    this.glows.push({
      sprite,
      pool,
      poolBase: base,
      island,
      base: haloBase,
      phase: Math.random() * Math.PI * 2,
      period: 3 + Math.random(),
    });
  }

  addScreen(index: number, color: string) {
    this.screens.push({ index, color: new Color(color), phase: Math.random() * 10 });
  }

  addSmokeSource(pos: Vector3) {
    this.smokeSources.push(pos);
  }

  addPuddle(pos: Vector3, r: number) {
    const mesh = new Mesh(
      new CylinderGeometry(r, r, 0.02, 28),
      withFlash(new MeshBasicMaterial({ color: palette.puddle, transparent: true, opacity: 0.6, depthWrite: false }), 0.4),
    );
    mesh.position.copy(pos).setY(pos.y + 0.012);
    this.group.add(mesh);
    this.puddles.push({ pos: mesh.position.clone(), r, next: Math.random() * 2.4 });
  }

  addSplashArea(top: Vector3, size: number) {
    this.splashAreas.push({ top, size });
  }

  addBeam(lamp: Vector3) {
    const h = 13;
    const geo = new ConeGeometry(2.3, h, 28, 1, true);
    geo.translate(0, -h / 2, 0);
    geo.rotateZ(Math.PI / 2); // apex at the lamp, opening along +X
    const mesh = new Mesh(
      geo,
      new MeshBasicMaterial({ color: solarized.gold, transparent: true, opacity: 0.2, depthWrite: false, side: DoubleSide }),
    );
    mesh.renderOrder = 4;
    const pivot = new Group();
    pivot.position.copy(lamp);
    pivot.rotation.y = Math.PI / 4;
    pivot.add(mesh);
    this.group.add(pivot);
    this.beams.push(pivot);
  }

  /** Call once all props are built. */
  finalize(emissiveMesh: InstancedMesh) {
    this.emissiveMesh = emissiveMesh;

    const ring = new RingGeometry(0.78, 1, 24);
    ring.rotateX(-Math.PI / 2);
    this.rippleMesh = new InstancedMesh(
      ring,
      new MeshBasicMaterial({ blending: AdditiveBlending, transparent: true, depthWrite: false }),
      RIPPLE_POOL,
    );
    this.rippleMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.rippleMesh.setColorAt(0, new Color(0, 0, 0));
    this.rippleMesh.instanceColor!.setUsage(DynamicDrawUsage);
    this.rippleMesh.count = 0;
    this.rippleMesh.frustumCulled = false;
    this.rippleMesh.renderOrder = 3;
    this.group.add(this.rippleMesh);

    this.smokeMesh = new InstancedMesh(shadedCube(), solidMaterial(), Math.max(1, this.smokeSources.length * SMOKE_PER_SOURCE));
    this.smokeMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.smokeMesh.count = 0;
    this.smokeMesh.frustumCulled = false;
    for (let i = 0; i < this.smokeMesh.instanceMatrix.count; i++) this.smokeMesh.setColorAt(i, new Color(propColors.smoke));
    this.group.add(this.smokeMesh);
  }

  /** A footstep in a puddle: a quick, bright ring. */
  splash(pos: Vector3) {
    if (!this.rippleMesh) return;
    this.spawnRipple(pos, 0.08, 0.6, 0.55, 0.85, this.now);
    this.spawnRipple(pos.clone(), 0.04, 0.32, 0.4, 0.6, this.now + 0.08);
  }

  private spawnRipple(pos: Vector3, r0: number, r1: number, life: number, alpha: number, now: number) {
    const i = this.ripples.findIndex((r) => r === null || now - r.t0 > r.life);
    if (i < 0) return;
    this.ripples[i] = { pos, r0, r1, life, alpha, t0: now };
  }

  private randomSplashPoint(): Vector3 | null {
    if (!this.splashAreas.length) return null;
    const total = this.splashAreas.reduce((a, s) => a + s.size * s.size, 0);
    let pick = Math.random() * total;
    for (const area of this.splashAreas) {
      pick -= area.size * area.size;
      if (pick <= 0) {
        const h = area.size / 2 - 0.4;
        return new Vector3(
          area.top.x + (Math.random() * 2 - 1) * h,
          area.top.y + 0.035,
          area.top.z + (Math.random() * 2 - 1) * h,
        );
      }
    }
    return null;
  }

  update(t: number, dt: number) {
    this.now = t;
    const still = this.reducedMotion;

    // Glows: 75%–100% of their base on a 3–4s loop, each out of phase. Hover brightens an island.
    for (const g of this.glows) {
      const flicker = still ? 1 : 0.875 + 0.125 * Math.sin((t / g.period) * Math.PI * 2 + g.phase);
      const boost = g.island === this.hover ? 1.7 : g.island === this.active ? 1.2 : 1;
      if (g.sprite) g.sprite.material.opacity = Math.min(1, g.base * flicker * boost);
      if (g.pool) (g.pool.material as MeshBasicMaterial).opacity = Math.min(1, g.poolBase * flicker * boost);
    }

    // Arcade screens: a steady hum with the odd quick dip.
    if (this.emissiveMesh?.instanceColor && this.screens.length) {
      for (const s of this.screens) {
        let k = 1;
        if (!still) {
          const hum = 0.9 + 0.1 * Math.sin(t * 7.3 + s.phase) * Math.sin(t * 2.1 + s.phase * 2);
          const dip = Math.sin(t * 0.9 + s.phase * 3) > 0.985 ? 0.65 : 1;
          k = hum * dip;
        }
        this.emissiveMesh.setColorAt(s.index, this.c.copy(s.color).multiplyScalar(k));
      }
      this.emissiveMesh.instanceColor.needsUpdate = true;
    }

    // Lighthouse beam: slow 9s sweep back and forth.
    for (const b of this.beams) b.rotation.y = Math.PI / 4 + (still ? 0 : 0.6 * Math.sin((t / 9) * Math.PI * 2));

    // Chimney smoke: a voxel every 1.3s rises, drifts left and shrinks away.
    let n = 0;
    if (!still) {
      for (const src of this.smokeSources) {
        for (let k = 0; k < SMOKE_PER_SOURCE; k++) {
          const born = Math.floor(t / SMOKE_EVERY - k) * SMOKE_EVERY;
          const age = t - born;
          if (age < 0 || age > SMOKE_LIFE || born < 0) continue;
          const life = age / SMOKE_LIFE;
          const size = 0.55 * (1 - life) + 0.08;
          this.s.set(size, size, size);
          const p = src.clone().add(new Vector3(0, age * 0.55, 0)).addScaledVector(ISO_RIGHT, -age * 0.32);
          this.m.compose(p, this.q, this.s);
          this.smokeMesh.setMatrixAt(n++, this.m);
        }
      }
    }
    if (this.smokeMesh) {
      this.smokeMesh.count = n;
      this.smokeMesh.instanceMatrix.needsUpdate = true;
    }

    // Ripples: rain splashes on the grass plus a ring on every puddle each 2.4s.
    if (!this.rippleMesh) return;
    if (!still) {
      this.splashAcc += dt * this.splashRate;
      while (this.splashAcc >= 1) {
        this.splashAcc -= 1;
        const p = this.randomSplashPoint();
        if (p) this.spawnRipple(p, 0.05, 0.42, 0.45, 0.55, t);
      }
      if (this.splashRate > 0) {
        for (const pd of this.puddles) {
          if (t >= pd.next) {
            pd.next = t + 2.4;
            this.spawnRipple(pd.pos.clone().setY(pd.pos.y + 0.02), pd.r * 0.15, pd.r * 0.85, 1.6, 0.7, t);
          }
        }
      }
    }
    let r = 0;
    for (const rp of this.ripples) {
      if (!rp) continue;
      const age = (t - rp.t0) / rp.life;
      if (age < 0 || age >= 1) continue;
      const radius = rp.r0 + (rp.r1 - rp.r0) * age;
      this.s.set(radius, 1, radius);
      this.m.compose(rp.pos, this.q, this.s);
      this.rippleMesh.setMatrixAt(r, this.m);
      this.rippleMesh.setColorAt(r, this.c.copy(RAIN_RGB).multiplyScalar(rp.alpha * (1 - age)));
      r++;
    }
    this.rippleMesh.count = r;
    this.rippleMesh.instanceMatrix.needsUpdate = true;
    this.rippleMesh.instanceColor!.needsUpdate = true;
  }
}
