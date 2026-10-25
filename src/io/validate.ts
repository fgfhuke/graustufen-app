export const MAX_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_PIXELS = 100_000_000;

export type Format = 'jpeg' | 'png' | 'heic';

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1']);

/** Erkennt das Format an den ersten Bytes (nicht an Endung oder MIME-Typ). */
export function detectFormat(b: Uint8Array): Format | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.length >= 12 && String.fromCharCode(b[4], b[5], b[6], b[7]) === 'ftyp') {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
    if (HEIC_BRANDS.has(brand)) return 'heic';
  }
  return null;
}

export class ValidationError extends Error {}

/** Ist das Dateiende vorhanden? JPEG endet mit FFD9, PNG mit IEND (Prüfung im letzten Abschnitt). */
export function looksComplete(fmt: Format, tail: Uint8Array): boolean {
  if (fmt === 'jpeg') {
    for (let i = tail.length - 2; i >= 0; i--) if (tail[i] === 0xff && tail[i + 1] === 0xd9) return true;
    return false;
  }
  if (fmt === 'png') {
    const iend = [0x49, 0x45, 0x4e, 0x44];
    for (let i = tail.length - 4; i >= 0; i--) if (iend.every((v, k) => tail[i + k] === v)) return true;
    return false;
  }
  return true;
}

export async function validateFile(file: File): Promise<Format> {
  if (file.size === 0) throw new ValidationError('Die Datei ist leer.');
  if (file.size > MAX_FILE_BYTES)
    throw new ValidationError('Die Datei ist größer als 100 MB und wird nicht unterstützt.');
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const fmt = detectFormat(head);
  if (!fmt) throw new ValidationError('Dieses Dateiformat wird nicht unterstützt. Erlaubt sind JPEG, PNG und HEIC/HEIF.');
  const tail = new Uint8Array(await file.slice(Math.max(0, file.size - 65536)).arrayBuffer());
  if (!looksComplete(fmt, tail)) throw new ValidationError('Die Datei ist unvollständig oder beschädigt.');
  return fmt;
}

export function checkPixels(w: number, h: number): void {
  if (w * h > MAX_PIXELS)
    throw new ValidationError(`Das Bild hat ${(w * h / 1e6).toFixed(0)} Megapixel. Erlaubt sind höchstens 100.`);
}
