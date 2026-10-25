export function histogram(lum: Uint8Array): Uint32Array {
  const h = new Uint32Array(256);
  for (let i = 0; i < lum.length; i++) h[lum[i]]++;
  return h;
}
