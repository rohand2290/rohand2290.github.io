import { Crossing } from '../world/bridgeCrossing';
import type { BridgeEnd, IslandGraph, RouteLeg } from '../world/graph';
import { nearestInteractable, type Interactable } from '../world/interactables';
import type { Cell, NavGrid, Point3 } from '../world/navGrid';
import { findGridPath } from '../world/pathfinding';
import { StateMachine } from './stateMachine';

/** Walking speed on the grass, in world units (voxels) per second. */
export const WALK_SPEED = 4;
/** Distance between footfalls; also the length of half a walk cycle. */
export const STRIDE = 0.5;
/** How long the lightning flinch lasts, in seconds. */
export const FLINCH_TIME = 0.5;
/** A fade out and back in (Skip walking, and crossings under reduced motion). */
export const FADE_TIME = 0.36;

export type PlayerEventOut = { type: 'footfall'; island: string; x: number; y: number; z: number };

/**
 * Turns screen-space input (x right, y up, each -1..1) into a grid step. The camera looks down
 * the classic isometric angle, so screen up is world (-x, -z) and screen right is world (+x, -z).
 * The result is snapped to one of 8 directions, or (0, 0) if there is no input.
 */
export function screenToGrid(sx: number, sy: number): [number, number] {
  const vx = sx - sy;
  const vz = -sx - sy;
  const len = Math.hypot(vx, vz);
  if (len < 0.2) return [0, 0];
  // sin(22.5°): beyond this a component counts, so the 8 directions split the circle evenly.
  const T = 0.3827;
  return [Math.abs(vx / len) > T ? Math.sign(vx) : 0, Math.abs(vz / len) > T ? Math.sign(vz) : 0];
}

interface Trip {
  legs: RouteLeg[];
  /** 'auto' = a nav button sent us (autoTraveling); 'walk' = a click somewhere. */
  mode: 'auto' | 'walk';
  onArrive?: () => void;
}

/**
 * The character's game logic: where it is, where it's going, and which state it's in.
 * No three.js here, so all of it can run in unit tests.
 */
export class PlayerController {
  readonly sm = new StateMachine();
  cell: Cell;
  readonly pos: Point3;
  /** Rotation about world y, in radians; 0 faces +z. */
  facing = 0;
  /** Total distance walked; drives the walk cycle so feet never slide. */
  distance = 0;
  /** Counts down from FLINCH_TIME after a lightning flash. */
  flinch = 0;
  /** The bridge being crossed, if any. */
  crossing: Crossing | null = null;
  /** True while actually stepping along a bridge (false when paused mid-bridge). */
  crossingMoving = false;
  /** No sway or wobble, and crossings become a short fade, under reduced motion. */
  reducedMotion = false;
  /** What the character is reading, while in the reading state. */
  reading: Interactable | null = null;

  private input: [number, number] = [0, 0];
  private path: Cell[] = [];
  private trip: Trip | null = null;
  private step: { from: Point3; to: Point3; target: Cell; prev: Cell; t: number; len: number } | null = null;
  private fade: { t: number; action: () => void; fired: boolean } | null = null;
  private events: PlayerEventOut[] = [];

  constructor(
    readonly grid: NavGrid,
    start: Cell,
    readonly graph: IslandGraph | null = null,
    readonly things: Interactable[] = [],
  ) {
    this.cell = start;
    this.pos = { ...grid.center(start) };
  }

  get island(): string {
    return this.cell.island;
  }

  get moving(): boolean {
    return this.step !== null;
  }

  /** On the way somewhere (a click or a nav button), including any bridges in between. */
  get traveling(): boolean {
    return this.trip !== null;
  }

  /** 0 = clear, 1 = fully faded out. */
  get fadeLevel(): number {
    if (!this.fade) return 0;
    const half = FADE_TIME / 2;
    return this.fade.t < half ? this.fade.t / half : Math.max(0, 1 - (this.fade.t - half) / half);
  }

  /** The bridge end the character is standing at (for the "Cross to …" prompt), if any. */
  get bridgeHere(): BridgeEnd | null {
    if (!this.graph || this.crossing || this.step || this.fade) return null;
    return this.graph.endsAt(this.cell)[0] ?? null;
  }

  /** The sign or object within reading range, if any (for the "E Read" hint). */
  get nearby(): Interactable | null {
    if (this.crossing || this.fade) return null;
    return nearestInteractable(this.things, this.cell.island, this.pos);
  }

  /** Curve position (0–1) on the bridge being crossed, or null when on the grass. */
  get bridgeT(): number | null {
    return this.crossing ? this.crossing.sample().t : null;
  }

  /** Roll from balancing; 0 off the bridges. */
  get sway(): number {
    return this.crossing ? this.crossing.balance.roll : 0;
  }

  // ---------- Commands ----------

  /** Held movement keys or joystick, in screen space. Any input takes over from a trip. */
  setInput(sx: number, sy: number) {
    this.input = screenToGrid(sx, sy);
    if (this.input[0] || this.input[1]) {
      if (this.trip) this.interrupt();
      this.path = [];
    }
  }

  /** Stops auto-travel or a click trip where it is (any key does this). */
  interrupt() {
    if (!this.trip) return;
    const auto = this.trip.mode === 'auto';
    this.trip = null;
    this.path = [];
    if (auto) {
      this.sm.send('interrupt');
      // Mid-bridge, the character stays on the rope and waits for keys.
      if (this.crossing) this.sm.send('enterBridge');
    }
    if (this.crossing) this.crossing.auto = false;
  }

  /**
   * Go to a cell anywhere in the archipelago, crossing bridges on the way.
   * mode 'auto' (nav buttons) ends in the reading state; 'walk' (clicks) ends idle.
   */
  travelTo(target: Cell, mode: 'auto' | 'walk', onArrive?: () => void): boolean {
    if (this.fade) return false;
    const goal = this.grid.nearestWalkable(target);
    if (!goal) return false;
    // Mid-bridge, plan from wherever the current crossing lands.
    const from = this.crossing ? this.crossing.to.head : this.step ? this.step.target : this.cell;
    const legs: RouteLeg[] | null = this.graph
      ? this.graph.planRoute(from, goal)
      : from.island === goal.island
        ? [{ kind: 'walk', to: goal }]
        : null;
    if (!legs) return false;
    if (this.crossing) this.crossing.auto = true;
    this.reading = null;
    this.path = [];
    this.trip = { legs, mode, onArrive };
    if (mode === 'auto') this.sm.send('travel');
    else if (this.sm.state === 'reading') this.sm.send('move');
    return true;
  }

  /** Click-to-move. Same island: a grid path. Another island: a trip over the bridges. */
  walkTo(target: Cell, onArrive?: () => void): boolean {
    return this.travelTo(target, 'walk', onArrive);
  }

  /**
   * Skip walking: fade out, appear at `target`, fade back in. `onArrive` runs while the screen
   * is faded, so a note can open as the world comes back.
   */
  teleport(target: Cell, onArrive?: () => void, faceToward?: { x: number; z: number }) {
    const goal = this.grid.nearestWalkable(target);
    if (!goal) return;
    this.trip = null;
    this.path = [];
    this.startFade(() => {
      this.crossing = null;
      this.step = null;
      this.cell = goal;
      Object.assign(this.pos, this.grid.center(goal));
      if (faceToward) this.facing = Math.atan2(faceToward.x - this.pos.x, faceToward.z - this.pos.z);
      if (this.sm.state === 'onBridge') this.sm.send('exitBridge');
      if (this.sm.state === 'autoTraveling') this.sm.send('interrupt');
      if (this.sm.state === 'walking') this.sm.send('stop');
      onArrive?.();
    });
  }

  /** Walk out across a bridge. `auto` keeps going to the far side without holding a key. */
  startCrossing(end: BridgeEnd, auto: boolean): boolean {
    if (!this.graph || this.crossing || this.fade || !this.sm.can('enterBridge')) return false;
    this.path = [];
    this.step = null;
    this.sm.send('enterBridge');
    if (this.reducedMotion) {
      // Reduced motion: no tightrope walk, just a short fade to the far side.
      const far = this.graph.opposite(end);
      this.startFade(() => {
        this.cell = far.head;
        Object.assign(this.pos, this.grid.center(far.head));
        this.facing = Math.atan2(-far.out.x, -far.out.z);
        this.sm.send('exitBridge');
        if (!this.trip && !(this.input[0] || this.input[1])) this.sm.send('stop');
      });
      return true;
    }
    this.crossing = new Crossing(this.graph, end, auto);
    const d = this.crossing.direction;
    this.facing = Math.atan2(d.x, d.z);
    return true;
  }

  /**
   * E / Enter. On a bridge: carry on across. At a bridge end: cross. Near a sign or object:
   * read it (returns it so the page can open its note).
   */
  interact(): { kind: 'cross' } | { kind: 'resume' } | { kind: 'read'; thing: Interactable } | null {
    if (this.fade) return null;
    if (this.crossing) {
      this.crossing.auto = true;
      return { kind: 'resume' };
    }
    const end = this.bridgeHere;
    if (end && this.startCrossing(end, true)) return { kind: 'cross' };
    const thing = this.nearby;
    if (thing && this.startReading(thing)) return { kind: 'read', thing };
    return null;
  }

  /** Face a sign or object and look at it. */
  startReading(thing: Interactable): boolean {
    if (this.crossing) return false;
    if (this.sm.state !== 'reading' && !this.sm.send('read')) {
      // Arriving from auto-travel goes straight into reading.
      if (!this.sm.send('arrive')) return false;
    }
    this.trip = null;
    this.path = [];
    this.reading = thing;
    this.facing = Math.atan2(thing.x - this.pos.x, thing.z - this.pos.z);
    return true;
  }

  /** The note closed. */
  stopReading() {
    this.reading = null;
    this.sm.send('closeRead');
  }

  /** Lightning flashed: a quick hunch, and out on a bridge one big wobble. */
  startle() {
    this.flinch = FLINCH_TIME;
    if (this.crossing && this.crossing.sample().onRope > 0) this.crossing.balance.kick();
  }

  drainEvents(): PlayerEventOut[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ---------- Per frame ----------

  update(dt: number) {
    this.sm.tick(dt);
    this.flinch = Math.max(0, this.flinch - dt);
    if (this.fade) {
      this.updateFade(dt);
      return;
    }
    if (this.crossing) {
      this.updateCrossing(dt);
      return;
    }
    let budget = dt * WALK_SPEED;
    // Walk in a loop so a long frame can finish one step and start the next without stalling.
    for (let guard = 0; guard < 4 && budget > 1e-6; guard++) {
      if (!this.step && !this.beginStep()) break;
      budget = this.advance(budget);
    }
    if (!this.step && !this.crossing && !this.fade) this.settle();
  }

  private startFade(action: () => void) {
    this.fade = { t: 0, action, fired: false };
  }

  private updateFade(dt: number) {
    const f = this.fade!;
    f.t += dt;
    if (!f.fired && f.t >= FADE_TIME / 2) {
      f.fired = true;
      f.action();
    }
    if (f.t >= FADE_TIME) this.fade = null;
  }

  /** Standing still with nothing queued: finish a trip, or just stop. */
  private settle() {
    if (this.path.length || (this.trip && this.trip.legs.length)) return;
    if (this.trip) {
      const { mode, onArrive } = this.trip;
      this.trip = null;
      if (mode === 'auto') this.sm.send('arrive');
      else if (this.sm.state === 'walking') this.sm.send('stop');
      onArrive?.();
      return;
    }
    if (this.sm.state === 'walking') this.sm.send('stop');
  }

  /** Takes the next leg of the current trip. Returns true if it produced a path to walk. */
  private nextLeg(): boolean {
    const trip = this.trip!;
    const leg = trip.legs.shift()!;
    if (leg.kind === 'walk') {
      const path = findGridPath(this.grid, this.cell, leg.to);
      if (!path) {
        this.trip = null;
        return false;
      }
      this.path = path;
      return path.length > 0;
    }
    if (leg.end.head.i !== this.cell.i || leg.end.head.j !== this.cell.j || leg.end.island !== this.cell.island) {
      this.trip = null; // knocked off course; give up quietly
      return false;
    }
    this.startCrossing(leg.end, true);
    return false;
  }

  /** Picks the next cell from held input, the path, or the trip. Returns false if standing still. */
  private beginStep(): boolean {
    let di = 0;
    let dj = 0;
    if (this.input[0] || this.input[1]) {
      [di, dj] = this.input;
      this.facing = Math.atan2(di, dj);
      if (!this.grid.canStep(this.cell, di, dj)) {
        // Walking into the edge right where a bridge starts steps out onto it.
        const end = this.bridgeToward(di, dj);
        if (end) this.startCrossing(end, false);
        // Otherwise, at the island edge or against a prop, the character just stops (facing that way).
        return false;
      }
    } else {
      // Pull legs off the trip until one gives us somewhere to walk (or starts a crossing).
      while (!this.path.length && this.trip && this.trip.legs.length && !this.crossing && !this.fade) {
        if (this.nextLeg()) break;
      }
      if (!this.path.length) return false;
      const next = this.path[0];
      di = next.i - this.cell.i;
      dj = next.j - this.cell.j;
      if (Math.abs(di) > 1 || Math.abs(dj) > 1 || !this.grid.canStep(this.cell, di, dj)) {
        this.path = [];
        this.trip = null;
        return false;
      }
      this.path.shift();
      this.facing = Math.atan2(di, dj);
    }
    const target = { island: this.cell.island, i: this.cell.i + di, j: this.cell.j + dj };
    const from = { ...this.pos };
    const to = this.grid.center(target);
    this.step = { from, to, target, prev: this.cell, t: 0, len: Math.hypot(to.x - from.x, to.z - from.z) };
    if (this.sm.state === 'reading') {
      this.reading = null;
    }
    this.sm.send('move');
    return true;
  }

  private bridgeToward(di: number, dj: number): BridgeEnd | null {
    if (!this.graph) return null;
    const len = Math.hypot(di, dj);
    for (const end of this.graph.endsAt(this.cell)) {
      if ((end.out.x * di + end.out.z * dj) / len > 0.6) return end;
    }
    return null;
  }

  private updateCrossing(dt: number) {
    const c = this.crossing!;
    const [di, dj] = this.input;
    let along: -1 | 0 | 1 = 0;
    if (di || dj) {
      const d = c.direction;
      const dot = (d.x * di + d.z * dj) / Math.hypot(di, dj);
      along = dot > 0.3 ? 1 : dot < -0.3 ? -1 : 0;
    }
    const before = c.s;
    const done = c.update(dt, along, this.reducedMotion);
    const sample = c.sample();
    this.pos.x = sample.p.x;
    this.pos.y = sample.p.y;
    this.pos.z = sample.p.z;
    const moved = c.s - before;
    this.crossingMoving = moved !== 0;
    if (moved !== 0) {
      const d = c.direction;
      const sign = moved > 0 ? 1 : -1;
      this.facing = Math.atan2(d.x * sign, d.z * sign);
      this.addDistance(Math.abs(moved));
    }
    if (done) {
      const end = done === 'far' ? c.to : c.from;
      this.cell = end.head;
      Object.assign(this.pos, this.grid.center(end.head));
      this.crossing = null;
      this.crossingMoving = false;
      this.sm.send('exitBridge');
      // Walked back to where we started: whatever trip was planned no longer applies.
      if (done === 'near') this.trip = null;
      if (!this.trip && !(this.input[0] || this.input[1])) this.sm.send('stop');
    }
  }

  /** Moves along the current step. Returns the distance budget left over. */
  private advance(budget: number): number {
    const s = this.step!;
    // Pressing the opposite way mid-step turns around immediately rather than finishing the step.
    const [ii, ij] = this.input;
    const di = s.target.i - s.prev.i;
    const dj = s.target.j - s.prev.j;
    if ((ii || ij) && ii === -di && ij === -dj) {
      const back = { ...s.from };
      s.from = { ...this.pos };
      s.to = back;
      [s.target, s.prev] = [s.prev, s.target];
      s.len = Math.hypot(s.to.x - s.from.x, s.to.z - s.from.z);
      s.t = 0;
      this.facing = Math.atan2(-di, -dj);
    }
    const remaining = s.len * (1 - s.t);
    const move = Math.min(budget, remaining);
    s.t = s.len > 0 ? Math.min(1, s.t + move / s.len) : 1;
    this.pos.x = s.from.x + (s.to.x - s.from.x) * s.t;
    this.pos.z = s.from.z + (s.to.z - s.from.z) * s.t;
    this.pos.y = s.to.y;
    this.addDistance(move);
    if (s.t >= 1) {
      this.cell = s.target;
      this.step = null;
    }
    return budget - move;
  }

  private addDistance(d: number) {
    const before = Math.floor(this.distance / STRIDE);
    this.distance += d;
    if (Math.floor(this.distance / STRIDE) > before) {
      this.events.push({ type: 'footfall', island: this.cell.island, x: this.pos.x, y: this.pos.y, z: this.pos.z });
    }
  }
}
