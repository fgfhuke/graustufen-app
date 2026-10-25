/** Helligkeit nach Rec. 709 auf gamma-kodierten sRGB-Werten (0-255). */
export function luminanceOf(r: number, g: number, b: number): number {
  return Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
}

/** RGBA-Pixel -> Helligkeit pro Pixel. Alpha wird auf Weiß gelegt. */
export function toLuminance(rgba: Uint8ClampedArray | Uint8Array): Uint8Array {
  const n = rgba.length >> 2;
  const out = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const a = rgba[j + 3] / 255;
    const r = rgba[j] * a + 255 * (1 - a);
    const g = rgba[j + 1] * a + 255 * (1 - a);
    const b = rgba[j + 2] * a + 255 * (1 - a);
    out[i] = luminanceOf(r, g, b);
  }
  return out;
}
