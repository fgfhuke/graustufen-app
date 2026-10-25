import { describe, it, expect } from 'vitest';
import { GrayJpegEncoder, quantTable, AC_BITS, AC_VALS, DC_BITS, DC_VALS, ZIGZAG } from '../../src/core/jpegGray';

function encode(w: number, h: number, f: (x: number, y: number) => number, q = 92) {
  const e = new GrayJpegEncoder(w, h, q);
  for (let y = 0; y < h; y++) e.addRow(Uint8Array.from({ length: w }, (_, x) => f(x, y)));
  return e.finish();
}

describe('Graustufen-JPEG-Encoder (Aufbau)', () => {
  it('Tabellen sind vollständig', () => {
    expect(AC_VALS).toHaveLength(162);
    expect(AC_BITS.reduce((a, b) => a + b, 0)).toBe(162);
    expect(DC_BITS.reduce((a, b) => a + b, 0)).toBe(DC_VALS.length);
    expect([...ZIGZAG].sort((a, b) => a - b)).toEqual(Array.from({ length: 64 }, (_, i) => i));
    expect(new Set(AC_VALS).size).toBe(162);
  });
  it('Qualität steuert die Quantisierung', () => {
    expect(quantTable(100).every((v) => v === 1)).toBe(true);
    expect(quantTable(92)[0]).toBeLessThan(quantTable(50)[0]);
  });
  it('Datei beginnt mit SOI, enthält Maße, endet mit EOI', () => {
    for (const [w, h] of [[1, 1], [8, 8], [13, 7], [300, 41]]) {
      const b = encode(w, h, (x, y) => (x * 7 + y * 3) & 255);
      expect([b[0], b[1]]).toEqual([0xff, 0xd8]);
      expect([b[b.length - 2], b[b.length - 1]]).toEqual([0xff, 0xd9]);
      let found = false;
      for (let i = 2; i < 200; i++) if (b[i] === 0xff && b[i + 1] === 0xc0) { expect(b[i + 5] << 8 | b[i + 6]).toBe(h); expect(b[i + 7] << 8 | b[i + 8]).toBe(w); found = true; break; }
      expect(found).toBe(true);
    }
  });
  it('Byte-Stuffing: nach jedem 0xFF im Datenstrom folgt 0x00 (außer Marker)', () => {
    const b = encode(64, 64, (x, y) => ((x ^ y) * 37) & 255, 100);
    const sos = b.findIndex((v, i) => v === 0xff && b[i + 1] === 0xda);
    for (let i = sos + 10; i < b.length - 2; i++) if (b[i] === 0xff) expect(b[i + 1]).toBe(0);
  });
  it('falsche Zeilenzahl wird gemeldet', () => {
    const e = new GrayJpegEncoder(8, 8);
    e.addRow(new Uint8Array(8));
    expect(() => e.finish()).toThrow();
  });
});
