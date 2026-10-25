/// <reference lib="webworker" />
import { luminanceOf } from '../core/luminance';
import { GrayJpegEncoder } from '../core/jpegGray';
import { compose, MaskSampler, type Layer } from '../core/zones';

let original: ImageBitmap | null = null;
const post = (m: unknown) => (self as unknown as Worker).postMessage(m);

/** Maximal ca. 4 Megapixel pro Streifen: weit unter der iOS-Canvas-Grenze von 16,7 Megapixel. */
const STRIP_PIXELS = 4_000_000;

type In =
  | { type: 'load'; bitmap: ImageBitmap }
  | { type: 'export'; id: number; base: Uint8Array; layers: { lut: Uint8Array; mask: Uint8Array }[]; mw: number; mh: number; quality: number };

self.onmessage = async (ev: MessageEvent<In>) => {
  const m = ev.data;
  if (m.type === 'load') {
    original?.close();
    original = m.bitmap;
    return;
  }
  try {
    if (!original) throw new Error('Kein Bild geladen.');
    const { width: w, height: h } = original;
    const rows = Math.min(h, Math.max(8, Math.floor(STRIP_PIXELS / w / 8) * 8));
    const canvas = new OffscreenCanvas(w, rows);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Zeichenfläche nicht verfügbar.');
    const enc = new GrayJpegEncoder(w, h, Math.round(m.quality * 100));
    const lumRow = new Uint8Array(w);
    const line = new Uint8Array(w);
    // Bereiche: Masken liegen in Vorschau-Auflösung vor und werden pro Zeile auf volle Größe vergrößert
    const sampler = m.layers.length ? new MaskSampler(m.mw, m.mh, w, h) : null;
    const rowLayers: Layer[] = m.layers.map((l) => ({ lut: l.lut, mask: new Uint8Array(w) }));
    for (let y0 = 0; y0 < h; y0 += rows) {
      const sh = Math.min(rows, h - y0);
      ctx.fillStyle = '#fff'; // Transparenz wird zu Weiß
      ctx.fillRect(0, 0, w, sh);
      ctx.drawImage(original, 0, y0, w, sh, 0, 0, w, sh);
      const d = ctx.getImageData(0, 0, w, sh).data;
      for (let r = 0; r < sh; r++) {
        let p = r * w * 4;
        for (let x = 0; x < w; x++, p += 4) lumRow[x] = luminanceOf(d[p], d[p + 1], d[p + 2]);
        if (sampler) for (let k = 0; k < rowLayers.length; k++) sampler.row(m.layers[k].mask, y0 + r, rowLayers[k].mask);
        compose(lumRow, m.base, rowLayers, line);
        enc.addRow(line);
      }
      post({ type: 'progress', id: m.id, done: (y0 + sh) / h });
    }
    const bytes = enc.finish();
    post({ type: 'done', id: m.id, blob: new Blob([bytes as BlobPart], { type: 'image/jpeg' }), width: w, height: h });
  } catch (e) {
    post({ type: 'error', id: m.id, message: String((e as Error).message ?? e) });
  }
};
