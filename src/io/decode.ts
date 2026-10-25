import { checkPixels, validateFile, ValidationError } from './validate';

export interface Decoded {
  bitmap: ImageBitmap;
  viaFallback: boolean;
}

/** Dekodiert JPEG/PNG/HEIC. EXIF-Ausrichtung wird angewendet (from-image). */
export async function decodeFile(file: File): Promise<Decoded> {
  const fmt = await validateFile(file);
  let bitmap: ImageBitmap | null = null;
  let viaFallback = false;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    if (fmt !== 'heic') throw new ValidationError('Das Bild ist beschädigt und kann nicht gelesen werden.');
  }
  if (!bitmap) {
    try {
      const { heicTo } = await import('heic-to/csp');
      bitmap = await heicTo({ blob: file, type: 'bitmap' });
      viaFallback = true;
    } catch {
      throw new ValidationError('Das HEIC-Bild ist beschädigt oder wird nicht unterstützt.');
    }
  }
  try {
    checkPixels(bitmap.width, bitmap.height);
  } catch (e) {
    bitmap.close();
    throw e;
  }
  return { bitmap, viaFallback };
}
