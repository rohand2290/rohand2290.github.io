// Clouds are stepped voxel slabs behind the world; mist bands drift across the lower half in front of it.
// Both are flat HTML shapes animated with CSS, so they cost nothing on the GPU and stop under reduced motion.

interface CloudSpec {
  x: number; // % of width
  y: number; // % of height
  w: number; // px
  h: number;
  near: boolean;
  dur: number;
  b1x?: number; b1w?: number; h1?: number;
  b2x?: number; b2w?: number; h2?: number;
}

// Placement follows 01-storm-hero.png.
const CLOUDS: CloudSpec[] = [
  { x: -2, y: 9, w: 440, h: 22, near: true, dur: 26, b1x: 4, b1w: 70, h1: 26, b2x: 18, b2w: 40, h2: 0 },
  { x: 26, y: 16, w: 270, h: 20, near: false, dur: 22, b1x: 18, b1w: 52, h1: 18, h2: 0 },
  { x: 54, y: 7.5, w: 520, h: 18, near: false, dur: 28, b1x: 6, b1w: 70, h1: 22, b2x: 14, b2w: 30, h2: 14 },
  { x: 86, y: 13, w: 380, h: 26, near: true, dur: 24, b1x: 10, b1w: 46, h1: 20 },
  { x: 13, y: 37, w: 780, h: 28, near: false, dur: 30, b1x: 30, b1w: 22, h1: 0, h2: 0 },
  { x: -3, y: 70, w: 840, h: 34, near: true, dur: 27, b1x: 0, b1w: 8, h1: 34, h2: 0 },
  { x: 45, y: 86, w: 1200, h: 40, near: false, dur: 29, b1x: 0, b1w: 5, h1: 0, h2: 0 },
];

const MIST = [
  { y: 58, h: 30, dur: 46 },
  { y: 74, h: 22, dur: 38 },
  { y: 88, h: 34, dur: 52 },
];

export function buildSky(sky: HTMLElement, mist: HTMLElement) {
  for (const c of CLOUDS) {
    const el = document.createElement('div');
    el.className = `cloud ${c.near ? 'near' : 'far'}`;
    const s = el.style;
    s.left = `${c.x}%`;
    s.top = `${c.y}%`;
    s.setProperty('--w', `${c.w}px`);
    s.setProperty('--h', `${c.h}px`);
    s.setProperty('--dur', `${c.dur}s`);
    s.setProperty('--delay', `${-Math.random() * c.dur}s`);
    s.setProperty('--drift', `${40 + Math.random() * 50}px`);
    if (c.b1x !== undefined) s.setProperty('--b1x', `${c.b1x}%`);
    if (c.b1w !== undefined) s.setProperty('--b1w', `${c.b1w}%`);
    if (c.h1 !== undefined) s.setProperty('--h1', `${c.h1}px`);
    if (c.b2x !== undefined) s.setProperty('--b2x', `${c.b2x}%`);
    if (c.b2w !== undefined) s.setProperty('--b2w', `${c.b2w}%`);
    if (c.h2 !== undefined) s.setProperty('--h2', `${c.h2}px`);
    sky.appendChild(el);
  }
  for (const m of MIST) {
    const el = document.createElement('div');
    el.className = 'mist-band';
    el.style.top = `${m.y}%`;
    el.style.setProperty('--h', `${m.h}px`);
    el.style.setProperty('--dur', `${m.dur}s`);
    el.style.animationDelay = `${-Math.random() * m.dur}s`;
    mist.appendChild(el);
  }
}
