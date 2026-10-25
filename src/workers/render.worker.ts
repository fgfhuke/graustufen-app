/// <reference lib="webworker" />
import { luminanceOf } from '../core/luminance';

let original: ImageBitmap | null = null;

type In =
  | { type: 'load'; bitmap: ImageBitmap }
  | { type: 'export'; id: number; lut: Uint8Array; quality: number };

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
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Zeichenfläche nicht verfügbar.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(original, 0, 0);
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const lut = m.lut;
    for (let i = 0; i < d.length; i += 4) {
      const g = lut[luminanceOf(d[i], d[i + 1], d[i + 2])];
      d[i] = d[i + 1] = d[i + 2] = g;
    }
    ctx.putImageData(img, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: m.quality });
    (self as unknown as Worker).postMessage({ type: 'done', id: m.id, blob, width: w, height: h });
  } catch (e) {
    (self as unknown as Worker).postMessage({ type: 'error', id: m.id, message: String((e as Error).message ?? e) });
  }
};
