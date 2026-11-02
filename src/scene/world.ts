import { ColorManagement, LinearSRGBColorSpace, Scene, Vector3, WebGLRenderer } from 'three';
import type { WorldSpec } from '../content/types';
import { LightRig } from '../weather/lights';
import { Rain, type RainMode } from '../weather/rain';
import { IsoCamera, ISO_RIGHT, ISO_UP, screenPlaneBounds, type ScreenRect } from './camera';
import { BridgeDip, buildBridges, type BridgeRecord } from './bridges';
import { buildIsland, type IslandRecord } from './islands';
import { emissiveMaterial, shadedCube, solidMaterial, VoxelBatch, worldUniforms } from './voxels';

// Work in sRGB numbers end to end so palette hexes render exactly as specified.
ColorManagement.enabled = false;

export type WeatherMode = 'storm' | 'drizzle' | 'clear';

export interface WorldOptions {
  canvas: HTMLCanvasElement;
  spec: WorldSpec;
  isPhone: boolean;
  reducedMotion: boolean;
  /** The part of the screen not covered by UI, optionally leaving room for the open note. */
  freeRect: (withNote: boolean) => ScreenRect;
}

function corners(r: IslandRecord): Vector3[] {
  const { min, max } = r.bounds;
  const out: Vector3[] = [];
  for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) out.push(new Vector3(x, y, z));
  return out;
}

export class World {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly iso = new IsoCamera();
  readonly lights = new LightRig();
  readonly rain: Rain;
  readonly islands = new Map<string, IslandRecord>();
  /** Bridges in the same order as spec.bridges, with the curve the character walks. */
  readonly bridges: BridgeRecord[];
  readonly bridgeDip: BridgeDip;
  /** Called once if a phone stays under 30fps even after the rain is at its thinnest. */
  onStillSlow: (() => void) | null = null;
  private slowChecks = 0;
  /** Called every frame after the camera moves; the HTML layer re-projects labels here. */
  onFrame: (() => void) | null = null;

  private readonly opts: WorldOptions;
  private reduced: boolean;
  private last = performance.now();
  private start = performance.now();
  private frameTimes: number[] = [];
  private perfCheckAt = performance.now() + 3000;
  private fitScale = 24;
  private dirty = true;
  private readonly updaters: ((t: number, dt: number) => boolean)[] = [];
  /** The point the camera eases toward while following the character. */
  private followTarget: Vector3 | null = null;
  private hasFollowed = false;

  constructor(opts: WorldOptions) {
    this.opts = opts;
    this.reduced = opts.reducedMotion;
    const dpr = Math.min(window.devicePixelRatio || 1, opts.isPhone ? 1.75 : 2);
    this.renderer = new WebGLRenderer({
      canvas: opts.canvas,
      alpha: true,
      antialias: dpr < 2,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(dpr);
    this.renderer.outputColorSpace = LinearSRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);

    const solid = new VoxelBatch();
    const emissive = new VoxelBatch();
    for (const spec of opts.spec.islands) {
      this.islands.set(spec.id, buildIsland(spec, solid, emissive, this.lights));
    }
    this.bridges = buildBridges(opts.spec.bridges, new Map(opts.spec.islands.map((s) => [s.id, s])), solid);

    const solidMesh = solid.build(shadedCube(), solidMaterial());
    this.bridgeDip = new BridgeDip(this.bridges, solidMesh);
    const emissiveMesh = emissive.build(shadedCube(false), emissiveMaterial(), true);
    this.lights.finalize(emissiveMesh);
    this.scene.add(solidMesh, emissiveMesh, this.lights.group);

    this.rain = new Rain(opts.isPhone);
    this.scene.add(...this.rain.meshes);

    const all = [...this.islands.values()].flatMap(corners);
    const b = screenPlaneBounds(all);
    this.iso.bounds = b;
    this.setReducedMotion(this.reduced);
    this.resize();
    this.fitAll(0);
  }

  // ---------- Camera ----------

  private freeRectSize(r: ScreenRect) {
    return { w: Math.max(80, r.right - r.left), h: Math.max(80, r.bottom - r.top) };
  }

  /** Default view: the whole archipelago fits between the header and the nav. */
  fitAll(dur = 400) {
    this.stopFollowing();
    const r = this.opts.freeRect(false);
    const { w, h } = this.freeRectSize(r);
    const b = this.iso.bounds;
    const scale = Math.min(w / (b.x1 - b.x0), h / (b.y1 - b.y0));
    this.fitScale = scale;
    this.iso.minScale = scale * 0.7;
    this.iso.maxScale = scale * 2.8;
    const view = this.iso.viewFor((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (r.left + r.right) / 2, (r.top + r.bottom) / 2, scale);
    this.iso.animateTo(view, dur);
    this.dirty = true;
  }

  /** Eases the camera so the island sits centered in the space the note leaves free. */
  focusIsland(id: string, withNote: boolean, dur = 400) {
    const island = this.islands.get(id);
    if (!island) return;
    this.stopFollowing();
    const r = this.opts.freeRect(withNote);
    const { w, h } = this.freeRectSize(r);
    const b = screenPlaneBounds(corners(island));
    const bw = b.x1 - b.x0;
    const bh = b.y1 - b.y0;
    // Never zoom in past the current view; zoom out if the island would not fit beside the note.
    let scale = Math.max(this.iso.scale, this.fitScale);
    scale = Math.min(scale, (w * 0.9) / bw, (h * 0.9) / bh);
    scale = Math.max(scale, this.iso.minScale);
    const view = this.iso.viewFor((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (r.left + r.right) / 2, (r.top + r.bottom) / 2, scale);
    this.iso.animateTo(view, dur);
    this.dirty = true;
  }

  pan(dx: number, dy: number) {
    this.stopFollowing();
    this.iso.panBy(dx, dy);
    this.dirty = true;
  }

  zoom(px: number, py: number, factor: number) {
    this.iso.zoomAt(px, py, factor);
    this.dirty = true;
  }

  /**
   * Follow a moving point (the character) with gentle easing. A drag-to-pan or an island focus
   * stops following; the character's next move calls this again and the camera eases back.
   */
  follow(p: Vector3) {
    if (!this.followTarget) {
      this.followTarget = new Vector3();
      // The first time the character moves, zoom in a little from the overview so it reads clearly.
      if (!this.hasFollowed) {
        this.hasFollowed = true;
        const scale = Math.min(this.iso.maxScale, Math.max(this.iso.scale, this.fitScale * 1.6));
        this.iso.animateTo([this.iso.cx, this.iso.cy, scale], 600);
      }
    }
    this.followTarget.copy(p);
  }

  stopFollowing() {
    this.followTarget = null;
  }

  get following(): boolean {
    return this.followTarget !== null;
  }

  private updateFollow(dt: number) {
    const p = this.followTarget;
    if (!p) return;
    const r = this.opts.freeRect(false);
    const [tx, ty] = this.iso.viewFor(p.dot(ISO_RIGHT), p.dot(ISO_UP), (r.left + r.right) / 2, (r.top + r.bottom) / 2, this.iso.scale);
    // Exponential ease: quick to start, settles softly. Reduced motion snaps.
    const k = this.reduced ? 1 : 1 - Math.exp(-dt * 4);
    this.iso.cx += (tx - this.iso.cx) * k;
    this.iso.cy += (ty - this.iso.cy) * k;
    this.iso.clamp();
    this.iso.apply();
  }

  /** Runs every frame before drawing. Return true if anything changed (forces a redraw under reduced motion). */
  addUpdater(fn: (t: number, dt: number) => boolean) {
    this.updaters.push(fn);
  }

  /** Ground point under a screen position: the island top the ray hits first, and where. */
  groundAt(px: number, py: number): { island: string; point: Vector3 } | null {
    const ray = this.iso.rayAt(px, py);
    let best: { island: string; point: Vector3 } | null = null;
    let bestD = Infinity;
    for (const [id, island] of this.islands) {
      // Where the ray crosses this island's top plane, if that's inside its footprint.
      const t = (island.top.y - ray.origin.y) / ray.direction.y;
      if (t <= 0) continue;
      const hit = ray.origin.clone().addScaledVector(ray.direction, t);
      const half = island.size / 2;
      if (Math.abs(hit.x - island.top.x) > half || Math.abs(hit.z - island.top.z) > half) continue;
      if (t < bestD) {
        bestD = t;
        best = { island: id, point: hit };
      }
    }
    return best;
  }

  project(p: Vector3) {
    return this.iso.toScreen(p);
  }

  /** Screen rectangle an island covers (used to keep the note and bolts off it). */
  islandRect(id: string): ScreenRect | null {
    const island = this.islands.get(id);
    if (!island) return null;
    const pts = corners(island).map((p) => this.iso.toScreen(p));
    return {
      left: Math.min(...pts.map((p) => p.x)),
      right: Math.max(...pts.map((p) => p.x)),
      top: Math.min(...pts.map((p) => p.y)),
      bottom: Math.max(...pts.map((p) => p.y)),
    };
  }

  pick(px: number, py: number): string | null {
    const ray = this.iso.rayAt(px, py);
    let best: string | null = null;
    let bestD = Infinity;
    const hit = new Vector3();
    for (const [id, island] of this.islands) {
      if (ray.intersectBox(island.bounds, hit)) {
        const d = hit.distanceTo(ray.origin);
        if (d < bestD) {
          bestD = d;
          best = id;
        }
      }
    }
    return best;
  }

  // ---------- State ----------

  setHover(id: string | null) {
    this.lights.hover = id;
  }

  setActive(id: string | null) {
    this.lights.active = id;
  }

  setWeather(mode: WeatherMode) {
    const rain: RainMode = mode === 'clear' ? 'none' : mode;
    this.rain.setMode(rain);
    this.lights.splashRate = mode === 'storm' ? 14 : mode === 'drizzle' ? 6 : 0;
  }

  setReducedMotion(on: boolean) {
    this.reduced = on;
    this.iso.reducedMotion = on;
    this.lights.reducedMotion = on;
    this.rain.setReducedMotion(on);
    this.dirty = true;
  }

  setFlash(v: number) {
    worldUniforms.uFlash.value = v * 0.55;
    this.dirty = true;
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.iso.setSize(w, h);
    this.rain.resize(w, h);
    this.dirty = true;
  }

  /** Re-fit after a resize, keeping the current island framed if there is one. */
  refit(activeId: string | null, withNote: boolean) {
    // While following the character, keep the zoom and stay on them (a phone rotating mid-walk).
    const follow = this.followTarget?.clone();
    const scale = this.iso.scale;
    this.fitAll(0);
    if (follow) {
      this.iso.scale = Math.min(this.iso.maxScale, Math.max(this.iso.minScale, scale));
      this.followTarget = follow;
      const reduced = this.reduced;
      this.reduced = true; // snap rather than ease
      this.updateFollow(0);
      this.reduced = reduced;
      return;
    }
    if (activeId) this.focusIsland(activeId, withNote, 0);
  }

  // ---------- Loop ----------

  run() {
    const frame = (now: number) => {
      requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      const t = (now - this.start) / 1000;
      let changed = false;
      for (const fn of this.updaters) changed = fn(t, dt) || changed;
      changed = this.bridgeDip.update(dt) || changed;
      const moving = this.iso.update(now);
      if (!moving) this.updateFollow(dt);
      // Under reduced motion nothing animates, so only draw when something changed.
      if (this.reduced && !moving && !this.dirty && !changed) return;
      this.lights.update(t, dt);
      this.rain.update(dt);
      this.onFrame?.();
      this.renderer.render(this.scene, this.iso.camera);
      this.dirty = false;
      this.watchPerformance(now, dt);
    };
    requestAnimationFrame(frame);
  }

  /** Thin out the rain if frames get slow (60fps target on desktop, 30fps on phones). */
  private watchPerformance(now: number, dt: number) {
    if (this.reduced) return;
    this.frameTimes.push(dt * 1000);
    if (now < this.perfCheckAt) return;
    this.perfCheckAt = now + 2000;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    this.frameTimes = [];
    const median = sorted[Math.floor(sorted.length / 2)] ?? 16;
    const budget = this.opts.isPhone ? 34 : 18.5;
    const density = this.rain.getDensity();
    if (median > budget && density > 0.25) this.rain.setDensity(Math.max(0.25, density * 0.75));
    // Rain first, then the character's animation detail: two slow checks in a row (about 4s) at minimum rain.
    else if (median > budget && this.opts.isPhone && this.onStillSlow) {
      if (++this.slowChecks >= 2) {
        this.onStillSlow();
        this.onStillSlow = null;
      }
    } else this.slowChecks = 0;
  }
}

export function createWorld(opts: WorldOptions): World {
  return new World(opts);
}
