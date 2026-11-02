/**
 * Optional on-screen joystick for touch screens, in the lower left. Drag the knob to walk;
 * let go to stop. Tap-to-move works without it, so it can be hidden with its own button.
 */
export class Joystick {
  readonly el: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly toggle: HTMLButtonElement;
  private vec: [number, number] = [0, 0];
  private pointer: number | null = null;
  private shown: boolean;

  constructor(root: HTMLElement, private readonly onMove: () => void) {
    this.el = document.createElement('div');
    this.el.className = 'joystick';
    this.el.setAttribute('aria-hidden', 'true'); // touch-only; keyboard users have WASD
    this.knob = document.createElement('div');
    this.knob.className = 'joystick-knob';
    this.el.appendChild(this.knob);

    this.toggle = document.createElement('button');
    this.toggle.type = 'button';
    this.toggle.className = 'joystick-toggle btn';
    this.toggle.tabIndex = -1;
    root.append(this.el, this.toggle);

    let stored: string | null = null;
    try {
      stored = localStorage.getItem('joystick');
    } catch {
      /* storage blocked: default to shown */
    }
    this.shown = stored !== 'off';
    this.render();

    this.toggle.addEventListener('click', () => {
      this.shown = !this.shown;
      try {
        localStorage.setItem('joystick', this.shown ? 'on' : 'off');
      } catch {
        /* fine */
      }
      this.render();
    });

    this.el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.pointer = e.pointerId;
      this.el.setPointerCapture(e.pointerId);
      this.track(e);
      this.onMove();
    });
    this.el.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.pointer) this.track(e);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.pointer) return;
      this.pointer = null;
      this.vec = [0, 0];
      this.knob.style.transform = '';
    };
    this.el.addEventListener('pointerup', end);
    this.el.addEventListener('pointercancel', end);
  }

  private render() {
    this.el.hidden = !this.shown;
    this.toggle.textContent = this.shown ? 'Hide stick' : 'Joystick';
    if (!this.shown) {
      this.vec = [0, 0];
      this.pointer = null;
    }
  }

  private track(e: PointerEvent) {
    const r = this.el.getBoundingClientRect();
    const radius = r.width / 2;
    let dx = (e.clientX - (r.left + radius)) / radius;
    let dy = (e.clientY - (r.top + radius)) / radius;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    this.knob.style.transform = `translate(${dx * radius * 0.55}px, ${dy * radius * 0.55}px)`;
    // A small dead zone in the middle; screen y points down, the world's "up" is positive.
    this.vec = len < 0.25 ? [0, 0] : [dx, -dy];
  }

  /** Screen-space direction: x right, y up. */
  vector(): [number, number] {
    return this.vec;
  }

  /** Show only on touch screens, and hide while a phone's bottom-sheet note is open. */
  setAvailable(on: boolean) {
    this.el.classList.toggle('unavailable', !on);
    this.toggle.classList.toggle('unavailable', !on);
  }
}
