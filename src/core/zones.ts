/** Bereiche: eigene Nachschlagetabellen, die gemäß einer Maske (0-255) über die Grundeinstellung gelegt werden. */

export const MAX_ZONES = 3;

export interface Layer {
  lut: Uint8Array;
  /** Maske, gleich lang wie die Helligkeitswerte (0 = nicht im Bereich, 255 = ganz im Bereich) */
  mask: Uint8Array;
}

/** Grauwerte berechnen: Grundtabelle, danach jede Ebene gemäß Maske darüber (Reihenfolge zählt). */
export function compose(lum: Uint8Array, base: Uint8Array, layers: readonly Layer[], out: Uint8Array = new Uint8Array(lum.length)): Uint8Array {
  const n = lum.length;
  if (layers.length === 0) {
    for (let i = 0; i < n; i++) out[i] = base[lum[i]];
    return out;
  }
  for (let i = 0; i < n; i++) {
    const y = lum[i];
    let g = base[y];
    for (let k = 0; k < layers.length; k++) {
      const m = layers[k].mask[i];
      if (m === 255) g = layers[k].lut[y];
      else if (m !== 0) g += Math.round(((layers[k].lut[y] - g) * m) / 255);
    }
    out[i] = g;
  }
  return out;
}

/** Ein runder Pinselabdruck mit weichem Rand. Radierer senkt die Maske entsprechend ab. */
export function stamp(mask: Uint8Array, w: number, h: number, cx: number, cy: number, r: number, erase: boolean): void {
  const hard = r * 0.6;
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(w - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(h - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= r) continue;
      let v = 255;
      if (d > hard) {
        const t = 1 - (d - hard) / (r - hard);
        v = Math.round(255 * t * t * (3 - 2 * t));
      }
      const i = y * w + x;
      if (erase) { const lim = 255 - v; if (mask[i] > lim) mask[i] = lim; }
      else if (mask[i] < v) mask[i] = v;
    }
  }
}

/** Pinselstrich von (x0,y0) nach (x1,y1): Abdrücke in kurzen Abständen, damit keine Lücken entstehen. */
export function stroke(mask: Uint8Array, w: number, h: number, x0: number, y0: number, x1: number, y1: number, r: number, erase: boolean): void {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(dist / Math.max(1, r * 0.25)));
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    stamp(mask, w, h, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, erase);
  }
}

/** Vergrößert eine Maske zeilenweise bilinear von (mw × mh) auf (W × H). */
export class MaskSampler {
  private xi0: Int32Array;
  private xi1: Int32Array;
  private fx: Float32Array;
  constructor(private mw: number, private mh: number, W: number, private H: number) {
    this.xi0 = new Int32Array(W); this.xi1 = new Int32Array(W); this.fx = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      const sx = Math.min(mw - 1, Math.max(0, ((x + 0.5) * mw) / W - 0.5));
      const i0 = Math.floor(sx);
      this.xi0[x] = i0; this.xi1[x] = Math.min(mw - 1, i0 + 1); this.fx[x] = sx - i0;
    }
  }
  row(mask: Uint8Array, y: number, out: Uint8Array): void {
    const { mw, mh, H, xi0, xi1, fx } = this;
    const sy = Math.min(mh - 1, Math.max(0, ((y + 0.5) * mh) / H - 0.5));
    const r0 = Math.floor(sy) * mw, r1 = Math.min(mh - 1, Math.floor(sy) + 1) * mw;
    const fy = sy - Math.floor(sy);
    for (let x = 0; x < out.length; x++) {
      const a = mask[r0 + xi0[x]], b = mask[r0 + xi1[x]], c = mask[r1 + xi0[x]], d = mask[r1 + xi1[x]];
      const top = a + (b - a) * fx[x], bot = c + (d - c) * fx[x];
      out[x] = Math.round(top + (bot - top) * fy);
    }
  }
}

/**
 * Histogramm der Pixel, die im Ergebnis von Ebene `k` bestimmt werden (0 = Grundeinstellung, 1.. = Bereiche).
 * Gewicht = eigene Maske × Anteil, der nicht von späteren Bereichen überdeckt wird.
 */
export function layerHistogram(lum: Uint8Array, masks: readonly Uint8Array[], k: number): Float64Array {
  const h = new Float64Array(256);
  for (let i = 0; i < lum.length; i++) {
    let w = k === 0 ? 1 : masks[k - 1][i] / 255;
    if (w === 0) continue;
    for (let j = k; j < masks.length; j++) w *= 1 - masks[j][i] / 255;
    h[lum[i]] += w;
  }
  return h;
}
