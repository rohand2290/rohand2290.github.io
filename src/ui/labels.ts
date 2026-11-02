import type { IslandSpec } from '../content/types';

export interface LabelHandlers {
  open(id: string, viaKeyboard: boolean): void;
  hover(id: string | null): void;
}

/** Dark plate signs that float above each island, positioned from the 3D anchor every frame. */
export class Labels {
  private readonly els = new Map<string, HTMLButtonElement>();
  private readonly sizes = new Map<string, { w: number; h: number }>();

  constructor(root: HTMLElement, islands: IslandSpec[], handlers: LabelHandlers) {
    for (const island of islands) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'label';
      el.textContent = island.name;
      el.dataset.island = island.id;
      el.setAttribute('aria-label', `${island.name}: open note`);
      el.addEventListener('click', (e) => handlers.open(island.id, e.detail === 0));
      el.addEventListener('pointerenter', () => handlers.hover(island.id));
      el.addEventListener('pointerleave', () => handlers.hover(null));
      root.appendChild(el);
      this.els.set(island.id, el);
    }
    this.measure();
  }

  measure() {
    for (const [id, el] of this.els) this.sizes.set(id, { w: el.offsetWidth, h: el.offsetHeight });
  }

  place(id: string, x: number, y: number) {
    const el = this.els.get(id);
    const size = this.sizes.get(id);
    if (!el || !size) return;
    // Nudge a sign fully on screen when its island is near an edge; let it go when the island has left.
    const onScreen = x >= 0 && x <= window.innerWidth;
    const left = onScreen ? Math.min(window.innerWidth - size.w - 4, Math.max(4, x - size.w / 2)) : x - size.w / 2;
    el.style.transform = `translate(${Math.round(left)}px, ${Math.round(y - size.h)}px)`;
    el.classList.add('placed');
  }

  setHover(id: string | null) {
    for (const [key, el] of this.els) el.classList.toggle('hover', key === id);
  }

  setActive(id: string | null) {
    for (const [key, el] of this.els) {
      if (key === id) el.setAttribute('aria-current', 'true');
      else el.removeAttribute('aria-current');
    }
  }
}
