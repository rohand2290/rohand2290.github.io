import '@fontsource/pixelify-sans/latin-400.css';
import '@fontsource/pixelify-sans/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import './styles/tokens.css';
import './styles/ui.css';

import { findItem, islandById, itemsByIsland, world as worldSpec } from './content/load';
import type { ScreenRect } from './scene/camera';
import type { WeatherMode, World } from './scene/world';
import { initHeader } from './ui/header';
import { Labels } from './ui/labels';
import { PlayerHint } from './ui/playerHint';
import { Nav } from './ui/nav';
import { Note, Panel } from './ui/note';
import { parseHash, pushRoute, replaceRoute } from './ui/router';
import { Keyboard } from './input/keyboard';
import { initPointer } from './input/pointer';
import { Joystick } from './input/touch';
import type { Interactable } from './world/interactables';
import type { Player } from './player/view';
import { Sound } from './weather/audio';
import { Lightning } from './weather/lightning';
import { buildSky } from './weather/mist';

// ---------- WebGL check: without it, the plain resume has everything ----------
function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
if (!hasWebGL()) location.replace('resume/#no-webgl');

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('world');
const header = document.querySelector<HTMLElement>('.site-header')!;
const navEl = document.querySelector<HTMLElement>('.island-nav')!;
const announcer = $('announcer');
const islandIds = worldSpec.islands.map((i) => i.id);

const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
const phoneQuery = matchMedia('(max-width: 640px)');
const isPhone = phoneQuery.matches || (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 700);

// ---------- State ----------
const state = {
  island: null as string | null,
  item: null as string | null,
  weather: 'storm' as WeatherMode,
  reduced: reducedQuery.matches,
  /** True when the open panel was pushed onto history by this page (so Back can close it). */
  pushedPanel: false,
  /** Header toggle: nav buttons jump the character there instead of walking. */
  skipWalking: readSkip(),
};

function readSkip(): boolean {
  try {
    return localStorage.getItem('skip-walking') === 'on';
  } catch {
    return false;
  }
}
let world: World | null = null;
let player: Player | null = null;
let lastFlash = 0;

// ---------- HTML layer first: it paints before three.js loads ----------
buildSky($('sky'), $('mist'));

const sound = new Sound();
const labels = new Labels($('labels'), worldSpec.islands, { open: openIsland, hover: setHover });
const nav = new Nav($('nav-list'), worldSpec.islands, goToIsland);
const note = new Note({ close: closeNote, read: readNote, pick: pickItem });
const panel = new Panel(closePanel);
const hint = new PlayerHint($('labels'), interact);
const joystick = new Joystick($('app'), () => player?.controller.interrupt());
const fadeEl = $('fade');
const skipBtn = $<HTMLButtonElement>('skip-toggle');
function renderSkip() {
  skipBtn.textContent = `Skip walking: ${state.skipWalking ? 'on' : 'off'}`;
  skipBtn.setAttribute('aria-pressed', String(state.skipWalking));
}
renderSkip();
skipBtn.addEventListener('click', () => {
  state.skipWalking = !state.skipWalking;
  sound.play('click');
  try {
    localStorage.setItem('skip-walking', state.skipWalking ? 'on' : 'off');
  } catch {
    /* storage blocked: the toggle still works for this visit */
  }
  renderSkip();
});
const coarse = matchMedia('(pointer: coarse)');

const lightning = new Lightning($('flash'), $<HTMLElement>('bolt') as unknown as SVGSVGElement, {
  setWorldFlash: (v) => {
    world?.setFlash(v);
    // The character hunches at the first beat of each flash.
    if (v > 0.3 && lastFlash <= 0.3) player?.startle();
    lastFlash = v;
  },
  avoidRects: () => [note.rect(), panel.rect()].filter((r): r is DOMRect => !!r),
  thunder: () => sound.thunder(0.8 + Math.random() * 0.4),
});

initHeader(sound, (mode) => {
  state.weather = mode;
  document.body.classList.toggle('weather-clear', mode === 'clear');
  world?.setWeather(mode);
  sound.setRaining(mode !== 'clear');
  syncLightning();
});

function syncLightning() {
  lightning.setEnabled(!!world && state.weather === 'storm' && !state.reduced);
}

function measureChrome() {
  const root = document.documentElement.style;
  root.setProperty('--header-h', `${Math.round(header.getBoundingClientRect().bottom)}px`);
  root.setProperty('--nav-h', `${Math.round(window.innerHeight - navEl.getBoundingClientRect().top)}px`);
}

/** Screen area not covered by the header, nav and (optionally) the open note. */
function freeRect(withNote: boolean): ScreenRect {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const gutter = w <= 640 ? 12 : 32;
  const r = {
    left: gutter,
    right: w - gutter,
    top: header.getBoundingClientRect().bottom + 12,
    bottom: navEl.getBoundingClientRect().top - 12,
  };
  const n = withNote ? note.rect() : null;
  if (n) {
    if (phoneQuery.matches) r.bottom = Math.min(r.bottom, n.top - 12);
    else r.left = Math.max(r.left, n.right + 24);
  }
  if (r.bottom - r.top < 120) r.bottom = Math.min(h, r.top + 120);
  return r;
}

// ---------- Actions ----------
function setHover(id: string | null) {
  labels.setHover(id);
  world?.setHover(id);
  canvas.classList.toggle('hovering', !!id);
}

function openIsland(id: string, viaKeyboard = false, itemId?: string | null, syncUrl = true) {
  const island = islandById(id);
  const items = itemsByIsland.get(id) ?? [];
  if (!island || !items.length) return;
  const item = (itemId && items.find((i) => i.id === itemId)) || (state.island === id && state.item && items.find((i) => i.id === state.item)) || items[0];
  const changed = state.island !== id;
  const wasOpen = note.open;
  const itemChanged = state.item !== item.id;
  state.island = id;
  state.item = item.id;
  note.show(item, items, island.name);
  if (!wasOpen) sound.play('noteOpen');
  else if (changed || itemChanged) sound.play('notePick');
  nav.setActive(id);
  labels.setActive(id);
  world?.setActive(id);
  world?.focusIsland(id, true);
  if (syncUrl && !panel.open) replaceRoute(id);
  if (changed) announcer.textContent = `${island.name}: ${item.title}`;
  if (viaKeyboard) note.focusTitle();
}

function pickItem(itemId: string) {
  if (!state.island) return;
  openIsland(state.island, false, itemId);
  note.focusItem(itemId);
}

function closeNote() {
  const prev = state.island;
  player?.controller.stopReading();
  if (panel.open) closePanel();
  if (note.open) sound.play('noteClose');
  note.hide();
  state.island = null;
  state.item = null;
  nav.setActive(null);
  labels.setActive(null);
  world?.setActive(null);
  replaceRoute(null);
  if (prev) nav.focus(prev);
}

function readNote() {
  if (!state.island || !state.item) return;
  const item = findItem(state.island, state.item);
  if (!item) return;
  pushRoute(state.island, item.id);
  state.pushedPanel = true;
  sound.play('panelOpen');
  panel.show(item);
}

function hidePanel() {
  if (panel.open) sound.play('panelClose');
  panel.hide();
  state.pushedPanel = false;
  if (note.open) note.readBtn.focus();
}

function closePanel() {
  if (!panel.open) return;
  if (state.pushedPanel) {
    history.back(); // popstate hides the panel
  } else {
    hidePanel();
    replaceRoute(state.island);
  }
}

/** Applies the URL: used on load and on Back/Forward. */
function applyRoute() {
  const { island, item } = parseHash();
  if (!island || !islandById(island)) {
    if (panel.open) hidePanel();
    if (note.open) closeNote();
    return;
  }
  if (item && findItem(island, item)) {
    openIsland(island, false, item, false);
    if (!panel.open) sound.play('panelOpen');
    if (!panel.open || state.item !== item) panel.show(findItem(island, item)!);
  } else {
    if (panel.open) hidePanel();
    openIsland(island);
  }
}

window.addEventListener('popstate', () => {
  state.pushedPanel = false;
  applyRoute();
});

// ---------- Keyboard ----------
// WASD / arrows walk the character. While focus sits on the nav or a label, arrows still move
// between islands as before, and Enter / Space on any focused control does what it always did.
function isWorldFocus(active: Element | null) {
  return !active || active === document.body || active === canvas;
}

const keyboard = new Keyboard({
  capture(e) {
    if (!player || panel.open) return false;
    const active = document.activeElement;
    // Enter and Space keep clicking a focused button; with focus on the world they interact / jump.
    if (e.key === 'Enter' || e.key === ' ') return isWorldFocus(active);
    if (e.key.startsWith('Arrow')) return isWorldFocus(active) || active?.id === 'note-title';
    // Letters: anywhere except text fields.
    return !(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || (active as HTMLElement | null)?.isContentEditable);
  },
  onMoveKey() {},
  onInteract: interact,
  onJump() {
    if (player?.jump()) sound.play('jump');
  },
});

window.addEventListener(
  'keydown',
  (e) => {
    // Pressing any key stops auto-travel where it is.
    if (player?.controller.traveling && !['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) player.controller.interrupt();
  },
  { capture: true },
);

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (panel.open) closePanel();
    else if (note.open) closeNote();
    return;
  }
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) || panel.open) return;
  const active = document.activeElement as HTMLElement | null;
  const onWorldControl = !!active && (nav.contains(active) || active.classList.contains('label'));
  if (!onWorldControl) return;
  e.preventDefault();
  const current = (active?.dataset.island ?? state.island) || null;
  const idx = current ? islandIds.indexOf(current) : -1;
  const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
  const next = islandIds[(idx + step + islandIds.length) % islandIds.length];
  if (note.open) {
    openIsland(next);
    nav.focus(next);
  } else {
    nav.focus(next);
    setHover(next);
    world?.focusIsland(next, false);
  }
});

// ---------- Pointer: drag to pan, wheel / pinch to zoom, tap to walk or read ----------
initPointer(canvas, {
  pan: (dx, dy) => world?.pan(dx, dy),
  zoom: (x, y, f) => world?.zoom(x, y, f),
  hover: (x, y) => world && setHover(world.pick(x, y)),
  leave: () => setHover(null),
  tap(x, y) {
    if (!world) return;
    if (!player) {
      const id = world.pick(x, y);
      if (id) openIsland(id);
      return;
    }
    // A sign or object: walk up to it and read it.
    const thing = player.pickThing(x, y);
    if (thing) {
      player.walkTo(thing.stand, () => readThing(thing));
      return;
    }
    // Ground on any island: walk there, over the bridges if it's another island.
    const ground = world.groundAt(x, y);
    if (ground) {
      const cell = player.grid.cellAt(ground.island, ground.point.x, ground.point.z);
      if (cell) player.walkTo(cell);
    }
  },
});

// ---------- Resize, reduced motion ----------
let resizeTimer: number | undefined;
window.addEventListener('resize', () => {
  measureChrome();
  labels.measure();
  if (!world) return;
  world.resize();
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => world?.refit(state.island, note.open), 120);
});

reducedQuery.addEventListener('change', () => {
  state.reduced = reducedQuery.matches;
  world?.setReducedMotion(state.reduced);
  player?.setReducedMotion(state.reduced);
  syncLightning();
});

measureChrome();
document.fonts?.ready.then(() => {
  labels.measure();
  measureChrome();
});

/** The floating prompt over the character's head: cross a bridge, or read a sign or object. */
function updateHint() {
  if (!player || !world) return;
  const c = player.controller;
  let text: string | null = null;
  const busy = c.traveling || c.sm.state === 'reading';
  const end = busy ? null : c.bridgeHere;
  if (end) {
    text = `Cross to ${player.graph.names.get(end.other)}`;
  } else if (!busy) {
    const thing = c.nearby;
    if (thing) text = thing.item ? `Read: ${findItem(thing.island, thing.item)?.title ?? 'note'}` : 'Read';
  }
  if (!text) return hint.update(null);
  const head = player.focusPoint;
  head.y += 1.9; // above the umbrella
  const p = world.project(head);
  hint.update(text, p.x, p.y);
}

/** E, Enter on the world, or a tap on the hint. */
function interact() {
  const r = player?.interact();
  if (r?.kind === 'read') openIsland(r.thing.island, false, r.thing.item);
}

/** Open a sign's (or object's) note, with the character looking at it. */
function readThing(thing: Interactable) {
  player?.controller.startReading(thing);
  openIsland(thing.island, false, thing.item);
}

/**
 * A nav button. With a mouse or touch, the character walks there (shortest path over the
 * bridges) and reads the island's sign, or jumps there behind a fade with Skip walking on.
 * Keyboard activation opens the note straight away, exactly as before.
 */
function goToIsland(id: string, viaKeyboard: boolean) {
  const sign = player?.sign(id);
  if (!player || !sign || viaKeyboard) return openIsland(id, viaKeyboard);
  if (note.open) closeNote();
  nav.setActive(id);
  const island = islandById(id);
  if (state.skipWalking) {
    sound.play('whoosh');
    player.controller.teleport(sign.stand, () => readThing(sign), sign);
    return;
  }
  if (player.controller.travelTo(sign.stand, 'auto', () => readThing(sign))) {
    announcer.textContent = `Walking to ${island?.name}`;
  } else {
    openIsland(id);
  }
}

// ---------- Then the world: three.js loads after the HTML layer is up ----------
async function boot() {
  const { createWorld } = await import('./scene/world');
  world = createWorld({ canvas, spec: worldSpec, isPhone, reducedMotion: state.reduced, freeRect });
  world.setWeather(state.weather);
  const { Player } = await import('./player/view');
  world.addUpdater(() => {
    let [sx, sy] = keyboard.vector();
    let run = keyboard.running;
    if (!sx && !sy) {
      [sx, sy] = joystick.vector();
      // On touch, pushing the stick near its rim runs.
      run = Math.hypot(sx, sy) > 0.92;
    }
    player?.setInput(sx, sy, run);
    return false;
  });
  player = new Player(world, worldSpec, state.reduced);
  player.onFootfall = (surface) => sound.play(surface === 'plank' ? 'stepPlank' : surface === 'puddle' ? 'stepPuddle' : 'stepGrass');
  world.onFrame = () => {
    for (const [id, island] of world!.islands) {
      const p = world!.project(island.labelAnchor);
      labels.place(id, p.x, p.y);
    }
    updateHint();
    fadeEl.style.opacity = String(player?.controller.fadeLevel ?? 0);
    joystick.setAvailable(coarse.matches && !(phoneQuery.matches && note.open));
  };
  // Phones that stay under 30fps after the rain has thinned: simplify the character too.
  world.onStillSlow = () => {
    if (player) player.detail = 0;
  };
  world.run();
  if (import.meta.env.DEV) Object.assign(window, { __world: world, __player: player, __strike: () => lightning.strike() });
  requestAnimationFrame(() => canvas.classList.add('ready'));
  applyRoute();
  syncLightning();
}

boot().catch((err) => {
  console.error(err);
  location.replace('resume/#no-webgl');
});
