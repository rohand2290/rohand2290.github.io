// The sky behind and around the world: scrolling banks of dithered pixel cloud, a sea of cloud
// under the islands, and a thin mist in front of them. Each layer is painted once into a small
// tile and scrolled with a CSS transform, so it costs nothing on the GPU and stops under reduced motion.

/** One cloud pixel, in CSS px. */
const PIXEL = 4;
/** Tile width in CSS px. Layers repeat seamlessly at this period. */
const TILE = 1800;

interface LayerSpec {
  /** Placement: % from the top, or omitted to sit on the bottom of the screen. */
  top?: number;
  /** Layer height in CSS px. */
  h: number;
  /** Seconds to scroll one tile. */
  dur: number;
  opacity: number;
  /** Shadow to lit, darkest first. */
  tones: string[];
  /** Vertical density profile: v is 0 at the layer's top, 1 at its bottom. */
  bias: (v: number) => number;
  seed: number;
}

const bank = (peak: number) => (v: number) => -0.9 + (peak + 0.9) * Math.pow(Math.sin(Math.PI * v), 1.5);
const sea = (rise: number) => (v: number) => -0.9 + rise * Math.pow(v, 1.4);

const BACK: LayerSpec[] = [
  { top: 2, h: 240, dur: 260, opacity: 0.9, tones: ['#123c48', '#1b4450', '#2a4f5b'], bias: bank(-0.2), seed: 11 },
  { top: 30, h: 200, dur: 180, opacity: 0.8, tones: ['#1d4551', '#2b505c', '#42616a'], bias: bank(-0.24), seed: 23 },
  { h: 340, dur: 120, opacity: 1, tones: ['#173f4c', '#234a56', '#31545f', '#4a6771'], bias: sea(1.3), seed: 37 },
];

const FRONT: LayerSpec[] = [
  { h: 220, dur: 80, opacity: 0.16, tones: ['#586e75', '#839496'], bias: sea(0.95), seed: 53 },
];

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Value noise on a lattice that wraps in both directions, so the tile repeats without a seam. */
function lattice(rand: () => number, cols: number, rows: number) {
  const cells = Float32Array.from({ length: cols * rows }, rand);
  const at = (i: number, j: number) => cells[((j + rows) % rows) * cols + ((i + cols) % cols)];
  const ease = (t: number) => t * t * (3 - 2 * t);
  return (u: number, v: number) => {
    const x = u * cols, y = v * rows;
    const i = Math.floor(x), j = Math.floor(y);
    const fx = ease(x - i), fy = ease(y - j);
    const top = at(i, j) + (at(i + 1, j) - at(i, j)) * fx;
    const bot = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fx;
    return top + (bot - top) * fy;
  };
}

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

/** Paints a layer: fractal noise thresholded through a Bayer matrix, lit along its upper edges. */
function paintLayer(spec: LayerSpec): string {
  const W = Math.round(TILE / PIXEL);
  const H = Math.round(spec.h / PIXEL);
  const rand = rng(spec.seed);
  // Wider than tall, but with enough height in the lower octaves that the banks billow.
  const octaves = [[8, 2, 0.5], [17, 4, 0.27], [37, 8, 0.15], [73, 15, 0.08]].map(([c, r, amp]) => ({
    noise: lattice(rand, c, r),
    amp,
  }));
  const density = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const v = y / H;
    const bias = spec.bias(v);
    for (let x = 0; x < W; x++) {
      let n = 0;
      for (const o of octaves) n += o.noise(x / W, v) * o.amp;
      density[y * W + x] = n + bias;
    }
  }

  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  const tones = spec.tones.map(hex);
  const LIFT = 3; // rows up to look for open sky when deciding how lit a pixel is
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = density[y * W + x];
      const threshold = bayer(x, y);
      if (Math.min(1, d / 0.09) <= threshold) continue;
      const above = y >= LIFT ? density[(y - LIFT) * W + x] : d - 0.1;
      const lit = Math.min(1, Math.max(0, 0.3 + (d - above) * 9));
      const tone = tones[Math.min(tones.length - 1, Math.floor(lit * (tones.length - 1) + threshold))];
      const i = (y * W + x) * 4;
      img.data[i] = tone[0];
      img.data[i + 1] = tone[1];
      img.data[i + 2] = tone[2];
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

function addLayer(parent: HTMLElement, spec: LayerSpec) {
  const el = document.createElement('div');
  el.className = spec.top === undefined ? 'cloud-layer' : 'cloud-layer bank';
  const s = el.style;
  if (spec.top !== undefined) s.top = `${spec.top}%`;
  else s.bottom = '0';
  s.opacity = String(spec.opacity);
  s.backgroundImage = `url(${paintLayer(spec)})`;
  s.setProperty('--tile', `${TILE}px`);
  s.setProperty('--h', `${spec.h}px`);
  s.setProperty('--dur', `${spec.dur}s`);
  s.animationDelay = `${-rng(spec.seed)() * spec.dur}s`;
  parent.appendChild(el);
}

/** A faint tile of film grain, laid over everything in the world to tie its layers together. */
function grainTile(): string {
  const SIZE = 128;
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d')!;
  const img = g.createImageData(SIZE, SIZE);
  const rand = rng(71);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = rand() < 0.5 ? 0 : 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = rand() * 255;
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

export function buildSky(sky: HTMLElement, mist: HTMLElement, grade: HTMLElement) {
  for (const spec of BACK) addLayer(sky, spec);
  for (const spec of FRONT) addLayer(mist, spec);
  grade.style.setProperty('--grain', `url(${grainTile()})`);
}
