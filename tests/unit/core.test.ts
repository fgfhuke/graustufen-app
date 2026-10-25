import { describe, it, expect } from 'vitest';
import { luminanceOf, toLuminance } from '../../src/core/luminance';
import { defaultThresholds, moveThreshold, clampLevels } from '../../src/core/thresholds';
import { buildLut } from '../../src/core/lut';
import { posterize } from '../../src/core/posterize';
import { histogram } from '../../src/core/histogram';

describe('Luminanz', () => {
  it('Grundfarben', () => {
    expect(luminanceOf(255, 0, 0)).toBe(54);
    expect(luminanceOf(0, 255, 0)).toBe(182);
    expect(luminanceOf(0, 0, 255)).toBe(18);
    expect(luminanceOf(255, 255, 255)).toBe(255);
    expect(luminanceOf(0, 0, 0)).toBe(0);
  });
  it('transparent wird weiß', () => {
    expect(toLuminance(new Uint8Array([0, 0, 0, 0]))[0]).toBe(255);
  });
});

describe('Schwellen', () => {
  it('Standardverteilung für N=2..16', () => {
    for (let n = 2; n <= 16; n++) {
      const t = defaultThresholds(n);
      expect(t).toHaveLength(n - 1);
      for (let i = 0; i < t.length; i++) {
        expect(t[i]).toBeGreaterThanOrEqual(1);
        expect(t[i]).toBeLessThanOrEqual(255);
        if (i) expect(t[i]).toBeGreaterThan(t[i - 1]);
      }
    }
    expect(defaultThresholds(2)).toEqual([128]);
    expect(defaultThresholds(3)).toEqual([85, 171]);
  });
  it('Anzahl wird begrenzt', () => {
    expect(clampLevels(1)).toBe(2);
    expect(clampLevels(99)).toBe(16);
    expect(clampLevels(NaN)).toBe(2);
  });
  it('Griffe kreuzen sich nicht', () => {
    const t = defaultThresholds(4); // 64,128,192
    expect(moveThreshold(t, 1, 500)).toEqual([64, 191, 192]);
    expect(moveThreshold(t, 1, -5)).toEqual([64, 65, 192]);
    expect(moveThreshold(t, 0, -5)[0]).toBe(1);
    expect(moveThreshold(t, 2, 999)[2]).toBe(255);
  });
});

describe('LUT und Posterisieren', () => {
  it('N=2 liefert nur 0 und 255', () => {
    const lut = buildLut(defaultThresholds(2));
    expect(new Set(lut)).toEqual(new Set([0, 255]));
    expect(lut[127]).toBe(0);
    expect(lut[128]).toBe(255);
  });
  it('N=1..16: genau N Werte, monoton, 0 bis 255', () => {
    for (let n = 2; n <= 16; n++) {
      const lut = buildLut(defaultThresholds(n));
      expect(new Set(lut).size).toBe(n);
      expect(lut[0]).toBe(0);
      expect(lut[255]).toBe(255);
      for (let y = 1; y < 256; y++) expect(lut[y]).toBeGreaterThanOrEqual(lut[y - 1]);
    }
  });
  it('Stufenwechsel exakt an der Schwelle', () => {
    const lut = buildLut([85, 171]);
    expect(lut[84]).toBe(0);
    expect(lut[85]).toBe(128);
    expect(lut[170]).toBe(128);
    expect(lut[171]).toBe(255);
  });
  it('posterize setzt RGB gleich und Alpha 255', () => {
    const out = posterize(new Uint8Array([0, 200]), buildLut([128]));
    expect(Array.from(out)).toEqual([0, 0, 0, 255, 255, 255, 255, 255]);
  });
});

describe('Histogramm', () => {
  it('Summe = Pixelzahl, Verlauf ist flach', () => {
    const lum = Uint8Array.from({ length: 256 }, (_, i) => i);
    const h = histogram(lum);
    expect(h.reduce((a, b) => a + b, 0)).toBe(256);
    expect(new Set(h)).toEqual(new Set([1]));
  });
});
