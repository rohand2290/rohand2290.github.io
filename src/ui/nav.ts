import type { IslandSpec } from '../content/types';

/** One button per island along the bottom; the current island uses the dark style. */
export class Nav {
  readonly buttons: HTMLButtonElement[] = [];

  constructor(list: HTMLElement, islands: IslandSpec[], open: (id: string, viaKeyboard: boolean) => void) {
    for (const island of islands) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.textContent = island.name;
      btn.dataset.island = island.id;
      btn.addEventListener('click', (e) => open(island.id, e.detail === 0));
      li.appendChild(btn);
      list.appendChild(li);
      this.buttons.push(btn);
    }
  }

  setActive(id: string | null) {
    for (const b of this.buttons) {
      if (b.dataset.island === id) {
        b.setAttribute('aria-current', 'true');
        b.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      } else {
        b.removeAttribute('aria-current');
      }
    }
  }

  focus(id: string) {
    this.buttons.find((b) => b.dataset.island === id)?.focus();
  }

  contains(el: Element | null) {
    return !!el && this.buttons.includes(el as HTMLButtonElement);
  }
}
