import { describe, it, expect } from 'vitest';
import { detectFormat, looksComplete, checkPixels, validateFile, ValidationError } from '../../src/io/validate';

const b = (...v: number[]) => new Uint8Array(v);
const ascii = (s: string) => Array.from(s).map((c) => c.charCodeAt(0));

describe('Formaterkennung', () => {
  it('JPEG, PNG, HEIC', () => {
    expect(detectFormat(b(0xff, 0xd8, 0xff, 0xe0))).toBe('jpeg');
    expect(detectFormat(b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('png');
    expect(detectFormat(b(0, 0, 0, 0x18, ...ascii('ftypheic')))).toBe('heic');
    expect(detectFormat(b(0, 0, 0, 0x18, ...ascii('ftypmif1')))).toBe('heic');
  });
  it('lehnt anderes ab', () => {
    expect(detectFormat(new TextEncoder().encode('Das ist kein Bild.'))).toBeNull();
    expect(detectFormat(b(0, 0, 0, 0x18, ...ascii('ftypisom')))).toBeNull();
    expect(detectFormat(b())).toBeNull();
  });
});

describe('Vollständigkeit', () => {
  it('JPEG braucht FFD9, PNG braucht IEND', () => {
    expect(looksComplete('jpeg', b(1, 2, 0xff, 0xd9))).toBe(true);
    expect(looksComplete('jpeg', b(1, 2, 3, 4))).toBe(false);
    expect(looksComplete('png', b(...ascii('xxIEND'), 1, 2, 3, 4))).toBe(true);
    expect(looksComplete('png', b(...ascii('xxxxxx')))).toBe(false);
  });
});

describe('Grenzen', () => {
  it('zu viele Pixel werden abgelehnt', () => {
    expect(() => checkPixels(9000, 6700)).not.toThrow();
    expect(() => checkPixels(12000, 9000)).toThrow(ValidationError);
  });
  it('leere und zu große Dateien', async () => {
    await expect(validateFile(new File([], 'a.jpg'))).rejects.toThrow(ValidationError);
    const big = { size: 101 * 1024 * 1024 } as File;
    await expect(validateFile(big)).rejects.toThrow(/100 MB/);
  });
  it('falsche Endung mit richtigem Inhalt wird akzeptiert, umgekehrt nicht', async () => {
    const jpeg = new File([b(0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9)], 'foto.png');
    await expect(validateFile(jpeg)).resolves.toBe('jpeg');
    await expect(validateFile(new File(['text'], 'foto.jpg'))).rejects.toThrow(ValidationError);
  });
});
