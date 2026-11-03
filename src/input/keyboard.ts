/**
 * Held movement keys (WASD and arrows) as a screen-space vector, Shift to run, Space to jump,
 * and E / Enter to interact.
 * `capture` decides per event whether the world gets the key, so arrows on a focused nav button,
 * typing in a field, or browser shortcuts keep working as before.
 */

const DIRS: Record<string, [number, number]> = {
  w: [0, 1], arrowup: [0, 1],
  s: [0, -1], arrowdown: [0, -1],
  a: [-1, 0], arrowleft: [-1, 0],
  d: [1, 0], arrowright: [1, 0],
};

export interface KeyboardHooks {
  /** Return false to leave this key event alone. */
  capture(e: KeyboardEvent): boolean;
  /** A movement key went down (used to interrupt auto-travel and snap the camera back). */
  onMoveKey(): void;
  onInteract(): void;
  /** Space. */
  onJump(): void;
}

export class Keyboard {
  private readonly held = new Map<string, [number, number]>();
  /** Shift is down: run. Read from every key event so it can't get stuck. */
  private shift = false;

  constructor(private readonly hooks: KeyboardHooks) {
    window.addEventListener('keydown', (e) => {
      this.shift = e.shiftKey;
      this.down(e);
    });
    window.addEventListener('keyup', (e) => {
      this.shift = e.shiftKey;
      this.held.delete(e.key.toLowerCase());
    });
    window.addEventListener('blur', () => this.clear());
  }

  get running(): boolean {
    return this.shift;
  }

  private down(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.toLowerCase();
    const dir = DIRS[key];
    const interact = key === 'e' || key === 'enter';
    const jump = key === ' ';
    if (!dir && !interact && !jump) return;
    if (!this.hooks.capture(e)) return;
    e.preventDefault();
    if (dir) {
      if (!e.repeat) this.hooks.onMoveKey();
      this.held.set(key, dir);
    } else if (e.repeat) {
      return;
    } else if (jump) {
      this.hooks.onJump();
    } else {
      this.hooks.onInteract();
    }
  }

  /** Screen-space direction from the held keys: x right, y up. */
  vector(): [number, number] {
    let x = 0;
    let y = 0;
    for (const [dx, dy] of this.held.values()) {
      x += dx;
      y += dy;
    }
    return [Math.sign(x), Math.sign(y)];
  }

  get active(): boolean {
    const [x, y] = this.vector();
    return x !== 0 || y !== 0;
  }

  clear() {
    this.held.clear();
    this.shift = false;
  }
}
