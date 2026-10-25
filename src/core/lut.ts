/** Grauwert der Stufe i bei N Stufen, gleichmäßig von 0 bis 255. */
export function grayOfLevel(i: number, levels: number): number {
  return Math.round((255 * i) / (levels - 1));
}

/** Nachschlagetabelle: Helligkeit 0-255 -> Ausgabe-Grauwert. */
export function buildLut(thresholds: readonly number[]): Uint8Array {
  const levels = thresholds.length + 1;
  const lut = new Uint8Array(256);
  let level = 0;
  for (let y = 0; y < 256; y++) {
    while (level < thresholds.length && thresholds[level] <= y) level++;
    lut[y] = grayOfLevel(level, levels);
  }
  return lut;
}
