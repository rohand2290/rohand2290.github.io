import type { ScreenRect } from '../scene/camera';

/** Overlay opacity over time (ms): two quick beats, then a 300ms fade. */
const PULSE: [number, number][] = [
  [0, 0],
  [50, 0.5],
  [110, 0.04],
  [170, 0.65],
  [470, 0],
];
const PULSE_MS = PULSE[PULSE.length - 1][0];

/** Photosensitivity guard: never more than 3 flashes (beats) in any 10s window. */
const WINDOW_MS = 10_000;
const MAX_IN_WINDOW = 3;
const BEATS_PER_FLASH = 2;

function pulseAt(ms: number): number {
  for (let i = 1; i < PULSE.length; i++) {
    const [t1, v1] = PULSE[i];
    const [t0, v0] = PULSE[i - 1];
    if (ms <= t1) return v0 + ((v1 - v0) * (ms - t0)) / (t1 - t0);
  }
  return 0;
}

export interface LightningHooks {
  /** Raise the world's ambient light (0–1). */
  setWorldFlash(v: number): void;
  /** Rectangles the bolt must not cross (the open note, the panel). */
  avoidRects(): ScreenRect[];
  thunder(): void;
}

export class Lightning {
  private enabled = false;
  private timer: number | undefined;
  private beats: number[] = [];
  private readonly loadedAt = performance.now();

  constructor(
    private readonly overlay: HTMLElement,
    private readonly bolt: SVGSVGElement,
    private readonly hooks: LightningHooks,
  ) {}

  setEnabled(on: boolean) {
    if (on === this.enabled) return;
    this.enabled = on;
    window.clearTimeout(this.timer);
    if (on) this.schedule();
    else this.clear();
  }

  private schedule() {
    const sinceLoad = performance.now() - this.loadedAt;
    // First flash no sooner than 8s after load; then every 12–25s.
    const next = sinceLoad < 8000 && this.beats.length === 0
      ? 8000 - sinceLoad + Math.random() * 6000
      : 12_000 + Math.random() * 13_000;
    this.timer = window.setTimeout(() => {
      if (!this.enabled) return;
      if (document.visibilityState === 'visible') this.strike();
      this.schedule();
    }, next);
  }

  private canFlash(now: number): boolean {
    this.beats = this.beats.filter((t) => now - t < WINDOW_MS);
    return this.beats.length + BEATS_PER_FLASH <= MAX_IN_WINDOW;
  }

  strike() {
    const now = performance.now();
    if (!this.canFlash(now)) return;
    this.beats.push(now, now + PULSE[3][0]);
    this.drawBolt();
    const start = performance.now();
    const step = () => {
      const ms = performance.now() - start;
      const v = ms >= PULSE_MS ? 0 : pulseAt(ms);
      this.overlay.style.opacity = String(v);
      this.hooks.setWorldFlash(v);
      this.bolt.style.opacity = ms < PULSE_MS - 120 ? '1' : String(Math.max(0, (PULSE_MS - ms) / 120));
      if (ms < PULSE_MS) requestAnimationFrame(step);
      else this.clear();
    };
    requestAnimationFrame(step);
    window.setTimeout(() => this.hooks.thunder(), 800 + Math.random() * 1700);
  }

  private clear() {
    this.overlay.style.opacity = '0';
    this.bolt.style.opacity = '0';
    this.hooks.setWorldFlash(0);
  }

  /** A jagged bolt somewhere in the sky that doesn't cross the open note. */
  private drawBolt() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const avoid = this.hooks.avoidRects();
    let points: [number, number][] = [];
    for (let attempt = 0; attempt < 30; attempt++) {
      points = [];
      let x = w * (0.08 + Math.random() * 0.84);
      let y = -10;
      const bottom = h * (0.2 + Math.random() * 0.12);
      const segs = 6 + Math.floor(Math.random() * 3);
      points.push([x, y]);
      for (let i = 0; i < segs; i++) {
        y += (bottom + 10) / segs;
        x += (Math.random() - 0.5) * 70 + (i % 2 ? 22 : -22);
        points.push([x, y]);
      }
      const xs = points.map((p) => p[0]);
      const box = { left: Math.min(...xs) - 12, right: Math.max(...xs) + 12, top: 0, bottom: bottom + 12 };
      const hits = avoid.some((r) => box.left < r.right && box.right > r.left && box.top < r.bottom && box.bottom > r.top);
      if (!hits) break;
      if (attempt === 29) points = [];
    }
    this.bolt.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const d = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    this.bolt.innerHTML = d
      ? `<polyline points="${d}" fill="none" stroke="#839496" stroke-width="9" stroke-linejoin="miter" stroke-linecap="square"/>
         <polyline points="${d}" fill="none" stroke="#fdf6e3" stroke-width="4" stroke-linejoin="miter" stroke-linecap="square"/>`
      : '';
  }
}
