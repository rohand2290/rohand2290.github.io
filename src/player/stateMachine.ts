/**
 * The character's top-level state. Small and explicit: every allowed transition is listed in
 * TRANSITIONS, and anything else is ignored (and reported as false), so the controller can't
 * drift into an odd combination like "reading while on a bridge".
 */

export type PlayerState = 'idle' | 'walking' | 'onBridge' | 'reading' | 'autoTraveling';

export type PlayerEvent =
  /** A movement key or a click-to-move target on the current island. */
  | 'move'
  /** Reached the destination, or released every key. */
  | 'stop'
  /** Stepped onto a bridge end and started crossing. */
  | 'enterBridge'
  /** Stepped off the far (or near) end of a bridge. */
  | 'exitBridge'
  /** Opened a sign or object's note. */
  | 'read'
  /** Closed the note. */
  | 'closeRead'
  /** A nav button sent the character to another island. */
  | 'travel'
  /** Auto-travel reached its island. */
  | 'arrive'
  /** Any key pressed during auto-travel. */
  | 'interrupt';

const TRANSITIONS: Record<PlayerState, Partial<Record<PlayerEvent, PlayerState>>> = {
  idle: { move: 'walking', enterBridge: 'onBridge', read: 'reading', travel: 'autoTraveling' },
  walking: { stop: 'idle', move: 'walking', enterBridge: 'onBridge', read: 'reading', travel: 'autoTraveling' },
  onBridge: { exitBridge: 'walking', stop: 'onBridge', move: 'onBridge', travel: 'autoTraveling' },
  reading: { closeRead: 'idle', move: 'walking', travel: 'autoTraveling' },
  // Auto-travel crosses bridges internally; it only ends by arriving or being interrupted.
  autoTraveling: { arrive: 'reading', interrupt: 'idle', travel: 'autoTraveling', enterBridge: 'autoTraveling', exitBridge: 'autoTraveling' },
};

export class StateMachine {
  private current: PlayerState = 'idle';
  private since = 0;
  /** Called after every real change of state. */
  onChange: ((to: PlayerState, from: PlayerState, event: PlayerEvent) => void) | null = null;

  get state(): PlayerState {
    return this.current;
  }

  /** Seconds spent in the current state. */
  get time(): number {
    return this.since;
  }

  can(event: PlayerEvent): boolean {
    return TRANSITIONS[this.current][event] !== undefined;
  }

  /** Applies an event. Returns false (and changes nothing) if it isn't allowed from this state. */
  send(event: PlayerEvent): boolean {
    const to = TRANSITIONS[this.current][event];
    if (to === undefined) return false;
    const from = this.current;
    if (to !== from) {
      this.current = to;
      this.since = 0;
      this.onChange?.(to, from, event);
    }
    return true;
  }

  tick(dt: number) {
    this.since += dt;
  }
}
