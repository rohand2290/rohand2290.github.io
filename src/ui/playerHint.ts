/**
 * The small floating prompt above the character ("E  Cross to The Lab", later "E  Read").
 * It's a real button, so a tap or click does the same as pressing E.
 */
export class PlayerHint {
  readonly el: HTMLButtonElement;
  private readonly keyEl: HTMLSpanElement;
  private readonly textEl: HTMLSpanElement;
  private text = '';
  private size = { w: 0, h: 0 };

  constructor(root: HTMLElement, onActivate: () => void) {
    this.el = document.createElement('button');
    this.el.type = 'button';
    this.el.className = 'player-hint';
    this.el.hidden = true;
    // Mouse and touch users can press it; keyboard users already have E, so keep it out of the Tab order.
    this.el.tabIndex = -1;
    this.keyEl = document.createElement('span');
    this.keyEl.className = 'player-hint-key';
    this.keyEl.textContent = 'E';
    this.keyEl.setAttribute('aria-hidden', 'true');
    this.textEl = document.createElement('span');
    this.el.append(this.keyEl, this.textEl);
    this.el.addEventListener('click', onActivate);
    root.appendChild(this.el);
  }

  /** Shows `text` centred above screen point (x, y), or hides the hint when text is null. */
  update(text: string | null, x = 0, y = 0) {
    if (!text) {
      if (!this.el.hidden) this.el.hidden = true;
      this.text = '';
      return;
    }
    if (text !== this.text) {
      this.text = text;
      this.textEl.textContent = text;
      this.el.hidden = false;
      this.size = { w: this.el.offsetWidth, h: this.el.offsetHeight };
    }
    this.el.style.transform = `translate(${Math.round(x - this.size.w / 2)}px, ${Math.round(y - this.size.h)}px)`;
  }
}
