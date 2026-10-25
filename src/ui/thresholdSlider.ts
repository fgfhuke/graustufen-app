import { moveThreshold } from '../core/thresholds';

/** Mehrgriff-Leiste: ein Griff pro Schwelle, Werte 1..255, kein Überkreuzen. */
export class ThresholdSlider {
  private handles: HTMLButtonElement[] = [];
  private thresholds: number[] = [];

  constructor(
    private track: HTMLElement,
    private onChange: (t: number[]) => void,
    private onFocusValue: (v: number | null) => void,
  ) {}

  setThresholds(t: readonly number[]): void {
    if (t.length !== this.handles.length) this.rebuild(t.length);
    this.thresholds = t.slice();
    this.handles.forEach((h, k) => this.place(h, k));
  }

  private place(h: HTMLButtonElement, k: number): void {
    const v = this.thresholds[k];
    h.style.left = `${(v / 255) * 100}%`;
    h.setAttribute('aria-valuenow', String(v));
    h.setAttribute('aria-valuemin', String(k === 0 ? 1 : this.thresholds[k - 1] + 1));
    h.setAttribute('aria-valuemax', String(k === this.thresholds.length - 1 ? 255 : this.thresholds[k + 1] - 1));
    h.title = `Grenze ${k + 1}: ${v}`;
  }

  private rebuild(count: number): void {
    this.track.replaceChildren();
    this.handles = [];
    for (let k = 0; k < count; k++) {
      const h = document.createElement('button');
      h.type = 'button';
      h.className = 'handle';
      h.setAttribute('role', 'slider');
      h.setAttribute('aria-label', `Grenze ${k + 1} von ${count}`);
      h.addEventListener('pointerdown', (e) => this.startDrag(e, h, k));
      h.addEventListener('keydown', (e) => this.onKey(e, k));
      h.addEventListener('focus', () => this.onFocusValue(this.thresholds[k]));
      h.addEventListener('blur', () => this.onFocusValue(null));
      this.track.appendChild(h);
      this.handles.push(h);
    }
  }

  private commit(next: number[]): void {
    let changed = false;
    for (let i = 0; i < next.length; i++) if (next[i] !== this.thresholds[i]) changed = true;
    if (!changed) return;
    this.setThresholds(next);
    this.onChange(next);
  }

  private startDrag(e: PointerEvent, h: HTMLButtonElement, k: number): void {
    e.preventDefault();
    h.focus();
    h.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const r = this.track.getBoundingClientRect();
      const v = ((ev.clientX - r.left) / r.width) * 255;
      this.commit(moveThreshold(this.thresholds, k, v));
      this.onFocusValue(this.thresholds[k]);
    };
    const up = () => {
      h.removeEventListener('pointermove', move);
      h.removeEventListener('pointerup', up);
      h.removeEventListener('pointercancel', up);
    };
    h.addEventListener('pointermove', move);
    h.addEventListener('pointerup', up);
    h.addEventListener('pointercancel', up);
  }

  private onKey(e: KeyboardEvent, k: number): void {
    const step = e.shiftKey ? 10 : 1;
    let v = this.thresholds[k];
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') v -= step;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') v += step;
    else if (e.key === 'Home') v = 1;
    else if (e.key === 'End') v = 255;
    else return;
    e.preventDefault();
    this.commit(moveThreshold(this.thresholds, k, v));
    this.onFocusValue(this.thresholds[k]);
  }
}
