import { describe, it, expect } from 'vitest';
import { compose, stamp, stroke, MaskSampler, layerHistogram } from '../../src/core/zones';
import { buildLut } from '../../src/core/lut';

const base = buildLut([128]);        // 2 Stufen: 0 / 255
const zone = buildLut([85, 171]);    // 3 Stufen: 0 / 128 / 255

describe('Überlagerung', () => {
  it('ohne Bereiche = Grundeinstellung', () => {
    expect(Array.from(compose(Uint8Array.of(10, 120, 200), base, []))).toEqual([0, 0, 255]);
  });
  it('Maske 0, 255 und halb', () => {
    const lum = Uint8Array.of(120, 120, 120);
    const out = compose(lum, base, [{ lut: zone, mask: Uint8Array.of(0, 255, 128) }]);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(128);
    expect(out[2]).toBe(64);
  });
  it('spätere Bereiche liegen oben', () => {
    const top = buildLut([1]); // alles 255 außer 0
    const out = compose(Uint8Array.of(120), base, [{ lut: zone, mask: Uint8Array.of(255) }, { lut: top, mask: Uint8Array.of(255) }]);
    expect(out[0]).toBe(255);
  });
});

describe('Pinsel', () => {
  it('Mitte voll, außerhalb leer, Rand weich', () => {
    const m = new Uint8Array(41 * 41);
    stamp(m, 41, 41, 20.5, 20.5, 10, false);
    expect(m[20 * 41 + 20]).toBe(255);
    expect(m[0]).toBe(0);
    const edge = m[20 * 41 + 29]; // Abstand 9 von der Mitte, im weichen Rand
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(255);
  });
  it('Radierer entfernt, Strich hat keine Lücken', () => {
    const m = new Uint8Array(100 * 20);
    stroke(m, 100, 20, 5, 10, 95, 10, 4, false);
    for (let x = 5; x <= 95; x++) expect(m[10 * 100 + x]).toBe(255);
    stamp(m, 100, 20, 50, 10, 6, true);
    expect(m[10 * 100 + 50]).toBe(0);
    expect(m[10 * 100 + 20]).toBe(255);
  });
  it('bleibt innerhalb des Bildes', () => {
    const m = new Uint8Array(10 * 10);
    expect(() => stamp(m, 10, 10, -5, 50, 30, false)).not.toThrow();
    expect(m.length).toBe(100);
  });
});

describe('Maskenvergrößerung', () => {
  it('konstante Maske bleibt konstant', () => {
    const s = new MaskSampler(4, 4, 13, 9);
    const out = new Uint8Array(13);
    s.row(new Uint8Array(16).fill(200), 5, out);
    expect(new Set(out)).toEqual(new Set([200]));
  });
  it('Übergang wird interpoliert, Ränder bleiben exakt', () => {
    const s = new MaskSampler(2, 1, 8, 4);
    const out = new Uint8Array(8);
    s.row(Uint8Array.of(0, 255), 0, out);
    expect(out[0]).toBe(0);
    expect(out[7]).toBe(255);
    for (let x = 1; x < 8; x++) expect(out[x]).toBeGreaterThanOrEqual(out[x - 1]);
  });
});

describe('Histogramm je Bereich', () => {
  it('teilt die Pixel nach Masken auf', () => {
    const lum = Uint8Array.of(10, 20, 30, 40);
    const mask = Uint8Array.of(255, 255, 0, 0);
    const hb = layerHistogram(lum, [mask], 0);
    const hz = layerHistogram(lum, [mask], 1);
    expect([hb[10], hb[20], hb[30], hb[40]]).toEqual([0, 0, 1, 1]);
    expect([hz[10], hz[20], hz[30], hz[40]]).toEqual([1, 1, 0, 0]);
  });
});
