/**
 * Mouse and touch on the canvas: drag to pan, wheel or pinch to zoom, hover, and tap/click.
 * A press that moves less than a few pixels counts as a tap.
 */
export interface PointerHooks {
  pan(dx: number, dy: number): void;
  zoom(x: number, y: number, factor: number): void;
  hover(x: number, y: number): void;
  leave(): void;
  tap(x: number, y: number): void;
}

export function initPointer(canvas: HTMLCanvasElement, hooks: PointerHooks) {
  const pointers = new Map<number, { x: number; y: number }>();
  let dragged = false;
  let downAt = { x: 0, y: 0 };
  let pinchDist = 0;

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      dragged = false;
      downAt = { x: e.clientX, y: e.clientY };
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      dragged = true;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) {
      if (e.pointerType === 'mouse') hooks.hover(e.clientX, e.clientY);
      return;
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist > 0) hooks.zoom((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinchDist);
      pinchDist = d;
      return;
    }
    if (!dragged && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) {
      dragged = true;
      canvas.classList.add('dragging');
    }
    if (dragged) hooks.pan(e.clientX - prev.x, e.clientY - prev.y);
  });

  const end = (e: PointerEvent) => {
    const wasDown = pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
    if (pointers.size > 0) return;
    canvas.classList.remove('dragging');
    if (wasDown && !dragged && e.type === 'pointerup') hooks.tap(e.clientX, e.clientY);
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && !pointers.size) hooks.leave();
  });
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      hooks.zoom(e.clientX, e.clientY, Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015)));
    },
    { passive: false },
  );
}
