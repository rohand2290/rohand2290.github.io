import { OrthographicCamera, Ray, Vector3 } from 'three';

/** Screen right, screen up and view direction for the classic isometric angle (45° yaw, 35.26° pitch). */
export const ISO_RIGHT = new Vector3(1, 0, -1).normalize();
export const ISO_UP = new Vector3(-1, 2, -1).normalize();
export const ISO_DIR = new Vector3(1, 1, 1).normalize();

export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Orthographic camera that never rotates. Its state is a view center in screen-plane
 * world units (cx along ISO_RIGHT, cy along ISO_UP) plus a scale in pixels per world unit.
 */
export class IsoCamera {
  readonly camera = new OrthographicCamera(-1, 1, 1, -1, -400, 400);
  cx = 0;
  cy = 0;
  scale = 24;
  width = 1;
  height = 1;
  minScale = 8;
  maxScale = 80;
  /** Archipelago bounds in screen-plane units; the view center may not leave it. */
  bounds = { x0: -50, x1: 50, y0: -50, y1: 50 };
  reducedMotion = false;
  private anim: { from: [number, number, number]; to: [number, number, number]; t0: number; dur: number } | null = null;

  setSize(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.apply();
  }

  apply() {
    const c = this.camera;
    const hw = this.width / 2 / this.scale;
    const hh = this.height / 2 / this.scale;
    c.left = -hw;
    c.right = hw;
    c.top = hh;
    c.bottom = -hh;
    c.updateProjectionMatrix();
    const center = ISO_RIGHT.clone().multiplyScalar(this.cx).addScaledVector(ISO_UP, this.cy);
    c.position.copy(center).addScaledVector(ISO_DIR, 200);
    c.up.set(0, 1, 0);
    c.lookAt(center);
    c.updateMatrixWorld();
  }

  /** World point → CSS pixel position. Cheap, no matrix math. */
  toScreen(p: Vector3): { x: number; y: number } {
    return {
      x: (p.dot(ISO_RIGHT) - this.cx) * this.scale + this.width / 2,
      y: this.height / 2 - (p.dot(ISO_UP) - this.cy) * this.scale,
    };
  }

  /** CSS pixel → ray into the world. */
  rayAt(px: number, py: number): Ray {
    const sx = this.cx + (px - this.width / 2) / this.scale;
    const sy = this.cy - (py - this.height / 2) / this.scale;
    const origin = ISO_RIGHT.clone().multiplyScalar(sx).addScaledVector(ISO_UP, sy).addScaledVector(ISO_DIR, 200);
    return new Ray(origin, ISO_DIR.clone().negate());
  }

  clamp() {
    this.scale = Math.min(this.maxScale, Math.max(this.minScale, this.scale));
    // The view may slide until only a sliver of the archipelago (KEEP units) is left on screen, no further.
    const b = this.bounds;
    const KEEP = 8;
    const hw = this.width / 2 / this.scale;
    const hh = this.height / 2 / this.scale;
    const x0 = Math.min(b.x0 + KEEP - hw, (b.x0 + b.x1) / 2);
    const x1 = Math.max(b.x1 - KEEP + hw, (b.x0 + b.x1) / 2);
    const y0 = Math.min(b.y0 + KEEP - hh, (b.y0 + b.y1) / 2);
    const y1 = Math.max(b.y1 - KEEP + hh, (b.y0 + b.y1) / 2);
    this.cx = Math.min(x1, Math.max(x0, this.cx));
    this.cy = Math.min(y1, Math.max(y0, this.cy));
  }

  panBy(dxPx: number, dyPx: number) {
    this.anim = null;
    this.cx -= dxPx / this.scale;
    this.cy += dyPx / this.scale;
    this.clamp();
    this.apply();
  }

  /** Zoom around a screen point so whatever is under the cursor stays put. */
  zoomAt(px: number, py: number, factor: number) {
    this.anim = null;
    const wx = this.cx + (px - this.width / 2) / this.scale;
    const wy = this.cy - (py - this.height / 2) / this.scale;
    this.scale = Math.min(this.maxScale, Math.max(this.minScale, this.scale * factor));
    this.cx = wx - (px - this.width / 2) / this.scale;
    this.cy = wy + (py - this.height / 2) / this.scale;
    this.clamp();
    this.apply();
  }

  /** View that places screen-plane point (sx, sy) at pixel (px, py) for a given scale. */
  viewFor(sx: number, sy: number, px: number, py: number, scale: number): [number, number, number] {
    return [sx - (px - this.width / 2) / scale, sy + (py - this.height / 2) / scale, scale];
  }

  animateTo(view: [number, number, number], dur = 400) {
    if (this.reducedMotion || dur <= 0) {
      [this.cx, this.cy, this.scale] = view;
      this.anim = null;
      this.clamp();
      this.apply();
      return;
    }
    this.anim = { from: [this.cx, this.cy, this.scale], to: view, t0: performance.now(), dur };
  }

  /** Returns true while an eased move is in progress. */
  update(now: number): boolean {
    if (!this.anim) return false;
    const { from, to, t0, dur } = this.anim;
    const t = Math.min(1, (now - t0) / dur);
    const k = ease(t);
    this.cx = from[0] + (to[0] - from[0]) * k;
    this.cy = from[1] + (to[1] - from[1]) * k;
    // Interpolate zoom geometrically so it feels even.
    this.scale = from[2] * Math.pow(to[2] / from[2], k);
    if (t >= 1) this.anim = null;
    this.clamp();
    this.apply();
    return true;
  }
}

/** Projects a set of world points onto the screen plane and returns their bounds. */
export function screenPlaneBounds(points: Vector3[]) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of points) {
    const x = p.dot(ISO_RIGHT);
    const y = p.dot(ISO_UP);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return { x0, x1, y0, y1 };
}
