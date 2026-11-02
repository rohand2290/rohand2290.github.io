import { Box3, Vector3 } from 'three';
import type { WorldSpec } from '../content/types';
import type { World } from '../scene/world';
import { IslandGraph } from '../world/graph';
import { buildInteractables, type Interactable } from '../world/interactables';
import { NavGrid, type Cell } from '../world/navGrid';
import { computePose, type AnimMode } from './animation';
import { PlayerController } from './controller';
import { CharacterModel } from './model';

/** How far planks sink under the character, for bridge weights 1, 2, 3. */
const DIP_DEPTH = [0.3, 0.2, 0.12] as const;

/**
 * Glue between the pure controller and the three.js world: owns the model, applies poses,
 * turns footfalls into puddle splashes, and tells the camera what to follow.
 */
export class Player {
  readonly grid: NavGrid;
  readonly graph: IslandGraph;
  readonly things: Interactable[];
  readonly controller: PlayerController;
  readonly model = new CharacterModel();
  /** 1 = full animation detail; lowered on struggling phones. */
  detail = 1;
  private reduced: boolean;
  private shownYaw: number;
  private modeTime = 0;
  private lastMode: AnimMode = 'idle';
  private lastFade = 0;
  private readonly tmp = new Vector3();

  constructor(private readonly world: World, spec: WorldSpec, reducedMotion: boolean) {
    this.grid = new NavGrid(spec.islands);
    const s = spec.spawn ?? { island: spec.islands[0].id, at: [0, 0] as [number, number] };
    const start = this.grid.nearestWalkable(this.grid.localCell(s.island, s.at[0], s.at[1])!)!;
    this.graph = new IslandGraph(spec, this.grid);
    this.things = buildInteractables(spec.islands, this.grid);
    this.controller = new PlayerController(this.grid, start, this.graph, this.things);
    this.controller.reducedMotion = reducedMotion;
    this.controller.facing = Math.PI / 4; // face the viewer to start
    this.shownYaw = this.controller.facing;
    this.reduced = reducedMotion;
    world.scene.add(this.model.root);
    this.sync(0, 0);
    world.addUpdater((t, dt) => this.update(t, dt));
  }

  setReducedMotion(on: boolean) {
    this.reduced = on;
    this.controller.reducedMotion = on;
  }

  /** E / Enter. */
  interact() {
    return this.controller.interact();
  }

  /** World-space position of the character's feet. */
  get position(): Vector3 {
    const p = this.controller.pos;
    return this.tmp.set(p.x, p.y, p.z);
  }

  /** Point at chest height, for the camera to follow and for hint placement. */
  get focusPoint(): Vector3 {
    const p = this.controller.pos;
    return new Vector3(p.x, p.y + 1, p.z);
  }

  setInput(sx: number, sy: number) {
    this.controller.setInput(sx, sy);
  }

  walkTo(cell: Cell, onArrive?: () => void): boolean {
    return this.controller.walkTo(cell, onArrive);
  }

  /** The island's signpost. */
  sign(island: string): Interactable | undefined {
    return this.things.find((t) => t.island === island && t.kind === 'sign');
  }

  /** The sign or object under a screen point, if any (for click-to-read). */
  pickThing(px: number, py: number): Interactable | null {
    const ray = this.world.iso.rayAt(px, py);
    const box = new Box3();
    const hit = new Vector3();
    let best: Interactable | null = null;
    let bestD = Infinity;
    for (const t of this.things) {
      // A little padding so small things (signs, graph nodes) are easy to hit.
      box.min.set(t.x - t.hw - 0.15, t.y, t.z - t.hd - 0.15);
      box.max.set(t.x + t.hw + 0.15, t.y + t.height + 0.15, t.z + t.hd + 0.15);
      if (ray.intersectBox(box, hit)) {
        const d = hit.distanceTo(ray.origin);
        if (d < bestD) {
          bestD = d;
          best = t;
        }
      }
    }
    return best;
  }

  startle() {
    this.controller.startle();
  }

  private mode(): AnimMode {
    if (this.controller.crossing) return 'bridge';
    switch (this.controller.sm.state) {
      case 'walking':
        return 'walk';
      case 'onBridge':
        return 'bridge';
      case 'reading':
        return 'read';
      case 'autoTraveling':
        return this.controller.moving ? 'walk' : 'idle';
      default:
        return 'idle';
    }
  }

  private update(t: number, dt: number): boolean {
    const c = this.controller;
    const wasMoving = c.moving || c.crossingMoving;
    c.update(dt);
    for (const e of this.controller.drainEvents()) {
      if (e.type === 'footfall' && this.grid.isPuddle(e.island, e.x, e.z)) {
        this.world.lights.splash(new Vector3(e.x, e.y + 0.03, e.z));
      }
    }
    // Out on a bridge, the planks dip under the character's weight (not under reduced motion).
    const bt = c.bridgeT;
    this.world.bridgeDip.load =
      bt !== null && c.crossing && !this.reduced
        ? { bridge: c.crossing.from.bridge, t: bt, depth: DIP_DEPTH[c.crossing.weight - 1] }
        : null;
    this.sync(t, dt);
    const moving = c.moving || c.crossingMoving;
    if (moving) this.world.follow(this.focusPoint);
    // Under reduced motion the world only redraws when something changes (a fade counts,
    // including the frame where it clears).
    const fade = c.fadeLevel;
    const fading = fade > 0 || this.lastFade > 0;
    this.lastFade = fade;
    return moving || wasMoving || fading || !this.reduced;
  }

  private sync(t: number, dt: number) {
    const c = this.controller;
    // Keep the feet on the planks as they dip.
    const bt = c.bridgeT;
    const dip = bt !== null && c.crossing ? this.world.bridgeDip.offsetAt(c.crossing.from.bridge, bt) : 0;
    this.model.root.position.set(c.pos.x, c.pos.y - dip, c.pos.z);

    // Turn smoothly toward the walking direction (instantly under reduced motion).
    let diff = c.facing - this.shownYaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.shownYaw += this.reduced ? diff : diff * Math.min(1, dt * 14);
    this.model.yaw.rotation.y = this.shownYaw;

    const mode = this.mode();
    if (mode !== this.lastMode) {
      this.lastMode = mode;
      this.modeTime = 0;
    }
    this.modeTime += dt;
    this.model.apply(
      computePose({
        mode,
        t,
        modeTime: this.modeTime,
        distance: c.distance,
        flinch: c.flinch,
        sway: c.sway,
        // Look up at signs and tall things, down at the little graph nodes.
        look: c.reading ? (c.reading.height < 1.4 ? 0.3 : -0.38) : 0,
        reducedMotion: this.reduced,
        detail: this.detail,
      }),
    );
  }
}
