import { isPlaceholder, renderBody, resolveHref, type ContentItem } from '../content/load';
import type { ContentLink } from '../content/types';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function linkEl(link: ContentLink): HTMLElement {
  if (isPlaceholder(link.href)) {
    // Keep the gap visible instead of inventing a URL.
    const span = document.createElement('span');
    span.className = 'btn is-placeholder';
    span.textContent = `${link.label} ${link.href}`;
    span.title = `Not filled in yet: ${link.href}`;
    return span;
  }
  const a = document.createElement('a');
  a.className = 'btn';
  a.href = resolveHref(link.href);
  a.textContent = link.label;
  if (/^https?:/.test(a.href) && a.host !== location.host) {
    a.target = '_blank';
    a.rel = 'noopener';
    a.setAttribute('aria-label', `${link.label} (opens in a new tab)`);
  }
  return a;
}

export interface NoteHandlers {
  close(): void;
  read(): void;
  pick(itemId: string): void;
}

/** The parchment card that opens beside an island. */
export class Note {
  readonly el = $('note');
  private readonly eyebrow = $('note-eyebrow');
  private readonly title = $('note-title');
  private readonly summary = $('note-summary');
  private readonly items = $<HTMLUListElement>('note-items');
  private readonly actions = $('note-actions');
  readonly readBtn = $<HTMLButtonElement>('note-read');

  constructor(handlers: NoteHandlers) {
    $('note-close').addEventListener('click', handlers.close);
    this.readBtn.addEventListener('click', handlers.read);
    this.items.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-item]');
      if (btn) handlers.pick(btn.dataset.item!);
    });
  }

  get open() {
    return !this.el.hidden;
  }

  show(item: ContentItem, siblings: ContentItem[], islandName: string) {
    this.el.hidden = false;
    this.el.setAttribute('aria-label', `${islandName} note`);
    this.eyebrow.textContent = item.eyebrow;
    this.title.textContent = item.title;
    this.summary.textContent = item.summary;
    this.readBtn.setAttribute('aria-label', `Read note: ${item.title}`);

    // Islands with several items show a small list; picking one swaps the note.
    this.items.replaceChildren(
      ...(siblings.length > 1
        ? siblings.map((s) => {
            const li = document.createElement('li');
            const b = document.createElement('button');
            b.type = 'button';
            b.dataset.item = s.id;
            b.textContent = s.title;
            b.setAttribute('aria-pressed', String(s.id === item.id));
            li.appendChild(b);
            return li;
          })
        : []),
    );

    // Swap only the links: re-inserting the Read note button would drop its focus.
    for (const child of [...this.actions.children]) if (child !== this.readBtn) child.remove();
    this.actions.append(...item.links.slice(0, 2).map(linkEl));
  }

  hide() {
    this.el.hidden = true;
  }

  focusTitle() {
    this.title.focus();
  }

  focusItem(id: string) {
    this.items.querySelector<HTMLButtonElement>(`button[data-item="${CSS.escape(id)}"]`)?.focus();
  }

  rect(): DOMRect | null {
    return this.open ? this.el.getBoundingClientRect() : null;
  }
}

/** The scrollable Read note panel, rendered from the item's Markdown. */
export class Panel {
  readonly el = $('panel');
  private readonly backdrop = $('panel-backdrop');
  private readonly eyebrow = $('panel-eyebrow');
  private readonly title = $('panel-title');
  private readonly body = $('panel-body');
  private readonly links = $('panel-links');

  constructor(close: () => void) {
    $('panel-close').addEventListener('click', close);
    this.backdrop.addEventListener('click', close);
    // Keep Tab inside the panel while it is open.
    this.el.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const focusables = [...this.el.querySelectorAll<HTMLElement>('a[href], button, [tabindex="0"]')];
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === this.title)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  get open() {
    return !this.el.hidden;
  }

  show(item: ContentItem) {
    this.eyebrow.textContent = item.eyebrow;
    this.title.textContent = item.title;
    this.body.innerHTML = renderBody(item);
    this.links.replaceChildren(...item.links.map(linkEl));
    this.backdrop.hidden = false;
    this.el.hidden = false;
    this.el.scrollTop = 0;
    this.title.focus();
  }

  hide() {
    this.el.hidden = true;
    this.backdrop.hidden = true;
  }

  rect(): DOMRect | null {
    return this.open ? this.el.getBoundingClientRect() : null;
  }
}
