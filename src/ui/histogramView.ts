/** Zeichnet Grau-Bänder der Stufen und darüber das Histogramm (Wurzel-Skalierung). */
export function drawHistogram(canvas: HTMLCanvasElement, hist: Uint32Array | null, lut: Uint8Array): void {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 300;
  const cssH = canvas.clientHeight || 80;
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  const binW = W / 256;
  for (let v = 0; v < 256; v++) {
    const g = lut[v];
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    ctx.fillRect(Math.floor(v * binW), 0, Math.ceil(binW) + 1, H);
  }
  if (!hist) return;
  let max = 0;
  for (let v = 0; v < 256; v++) if (hist[v] > max) max = hist[v];
  if (max === 0) return;
  const root = Math.sqrt(max);
  ctx.fillStyle = 'rgba(230, 90, 20, 0.9)';
  for (let v = 0; v < 256; v++) {
    const h = (Math.sqrt(hist[v]) / root) * H;
    ctx.fillRect(Math.floor(v * binW), H - h, Math.ceil(binW), h);
  }
}
