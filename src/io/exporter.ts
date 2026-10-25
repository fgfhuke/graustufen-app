import { jsPDF } from 'jspdf';

export const JPEG_QUALITY = 0.92;

export interface Rendered { blob: Blob; width: number; height: number }

/** Was der Worker zum Rechnen braucht: Grundtabelle und Bereiche mit Masken in Vorschau-Auflösung (mw × mh). */
export interface RenderSpec { base: Uint8Array; layers: { lut: Uint8Array; mask: Uint8Array }[]; mw: number; mh: number }

export class RenderClient {
  private worker = new Worker(new URL('../workers/render.worker.ts', import.meta.url), { type: 'module' });
  private nextId = 1;
  private pending = new Map<number, { ok: (r: Rendered) => void; fail: (e: Error) => void; progress?: (f: number) => void }>();

  constructor() {
    this.worker.onmessage = (ev) => {
      const m = ev.data;
      const p = this.pending.get(m.id);
      if (!p) return;
      if (m.type === 'progress') { p.progress?.(m.done); return; }
      this.pending.delete(m.id);
      if (m.type === 'done') p.ok({ blob: m.blob, width: m.width, height: m.height });
      else p.fail(new Error(m.message));
    };
  }

  /** Übergibt das Original an den Worker (kein Kopieren: spart auf dem iPhone viel Arbeitsspeicher). */
  load(bitmap: ImageBitmap): void {
    this.worker.postMessage({ type: 'load', bitmap }, [bitmap]);
  }

  renderFull(spec: RenderSpec, progress?: (fraction: number) => void): Promise<Rendered> {
    const id = this.nextId++;
    return new Promise((ok, fail) => {
      this.pending.set(id, { ok, fail, progress });
      this.worker.postMessage({ type: 'export', id, ...spec, quality: JPEG_QUALITY });
    });
  }
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '') || 'bild';
}

export const A4_MM = { w: 210, h: 297 };
export const MARGIN_MM = 10;

/** Berechnet Seitenausrichtung und eingepasste, zentrierte Bildgröße (mm). */
export function pdfLayout(imgW: number, imgH: number) {
  const landscape = imgW > imgH;
  const pageW = landscape ? A4_MM.h : A4_MM.w;
  const pageH = landscape ? A4_MM.w : A4_MM.h;
  const boxW = pageW - 2 * MARGIN_MM;
  const boxH = pageH - 2 * MARGIN_MM;
  const scale = Math.min(boxW / imgW, boxH / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  return { landscape, pageW, pageH, x: (pageW - w) / 2, y: (pageH - h) / 2, w, h };
}

export async function makePdf(r: Rendered): Promise<Blob> {
  const L = pdfLayout(r.width, r.height);
  const pdf = new jsPDF({ orientation: L.landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4', compress: false });
  const bytes = new Uint8Array(await r.blob.arrayBuffer());
  pdf.addImage(bytes, 'JPEG', L.x, L.y, L.w, L.h, undefined, 'NONE');
  return pdf.output('blob');
}

export async function printImage(r: Rendered): Promise<void> {
  const L = pdfLayout(r.width, r.height);
  const url = URL.createObjectURL(r.blob);
  const style = document.createElement('style');
  style.textContent = `@page { size: A4 ${L.landscape ? 'landscape' : 'portrait'}; margin: ${MARGIN_MM}mm; }`;
  const box = document.createElement('div');
  box.id = 'print-area';
  const img = document.createElement('img');
  img.src = url;
  img.style.width = `${L.w}mm`;
  img.style.height = `${L.h}mm`;
  box.appendChild(img);
  document.head.appendChild(style);
  document.body.appendChild(box);
  try {
    await img.decode();
    window.print();
  } finally {
    setTimeout(() => { box.remove(); style.remove(); URL.revokeObjectURL(url); }, 1000);
  }
}
