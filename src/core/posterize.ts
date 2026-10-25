/** Helligkeit + LUT -> RGBA (Alpha 255). out darf wiederverwendet werden. */
export function posterize(
  lum: Uint8Array,
  lut: Uint8Array,
  out: Uint8ClampedArray = new Uint8ClampedArray(lum.length * 4),
): Uint8ClampedArray {
  for (let i = 0, j = 0; i < lum.length; i++, j += 4) {
    const g = lut[lum[i]];
    out[j] = g;
    out[j + 1] = g;
    out[j + 2] = g;
    out[j + 3] = 255;
  }
  return out;
}
