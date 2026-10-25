import './styles.css';
import './print.css';
import { toLuminance } from './core/luminance';
import { defaultThresholds, clampLevels } from './core/thresholds';
import { buildLut } from './core/lut';
import { posterize } from './core/posterize';
import { histogram } from './core/histogram';
import { decodeFile } from './io/decode';
import { ValidationError } from './io/validate';
import { RenderClient, baseName, download, makePdf, printImage, type Rendered } from './io/exporter';
import { ThresholdSlider } from './ui/thresholdSlider';
import { drawHistogram } from './ui/histogramView';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const preview = $<HTMLCanvasElement>('preview');
const histCanvas = $<HTMLCanvasElement>('histogram');
const levelsInput = $<HTMLInputElement>('levels');
const dropzone = $('dropzone');
const message = $('message');
const status = $('status');
const fileInput = $<HTMLInputElement>('file');
const exportButtons = ['save-jpeg', 'save-pdf', 'print'].map((id) => $<HTMLButtonElement>(id));

const renderer = new RenderClient();

let levels = 4;
let thresholds = defaultThresholds(levels);
let lut = buildLut(thresholds);

interface Loaded { name: string; lum: Uint8Array; hist: Uint32Array; out: ImageData; colorBitmap: ImageBitmap }
let loaded: Loaded | null = null;
let comparing = false;
let busy = false;

const slider = new ThresholdSlider(
  $('track'),
  (t) => { thresholds = t; update(); },
  (v) => { $('readout').textContent = v === null ? '' : `Grenze bei ${v}`; },
);

function showError(text: string | null): void {
  message.hidden = text === null;
  message.textContent = text ?? '';
}

// --- Vorschau (verkleinert, schnell) ---
let scheduled = false;
function update(): void {
  lut = buildLut(thresholds);
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    paint();
  });
}

function paint(): void {
  drawHistogram(histCanvas, loaded?.hist ?? null, lut);
  if (!loaded) return;
  if (comparing) {
    preview.getContext('2d')!.drawImage(loaded.colorBitmap, 0, 0);
  } else {
    posterize(loaded.lum, lut, loaded.out.data);
    preview.getContext('2d')!.putImageData(loaded.out, 0, 0);
  }
}

function setLevels(n: number): void {
  levels = clampLevels(n);
  levelsInput.value = String(levels);
  thresholds = defaultThresholds(levels);
  slider.setThresholds(thresholds);
  update();
}

const PREVIEW_MAX = 2000;

async function loadFile(file: File): Promise<void> {
  showError(null);
  status.textContent = 'Foto wird geladen …';
  setExportEnabled(false);
  try {
    const { bitmap, viaFallback } = await decodeFile(file);
    const scale = Math.min(1, PREVIEW_MAX / Math.max(bitmap.width, bitmap.height));
    const pw = Math.max(1, Math.round(bitmap.width * scale));
    const ph = Math.max(1, Math.round(bitmap.height * scale));
    const small = scale < 1
      ? await createImageBitmap(bitmap, { resizeWidth: pw, resizeHeight: ph, resizeQuality: 'high' })
      : await createImageBitmap(bitmap);
    const c = new OffscreenCanvas(pw, ph);
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, pw, ph);
    ctx.drawImage(small, 0, 0);
    const rgba = ctx.getImageData(0, 0, pw, ph);
    const lum = toLuminance(rgba.data);
    // Vorheriges Bild freigeben
    loaded?.colorBitmap.close();
    const colorBitmap = await createImageBitmap(c);
    small.close();
    preview.width = pw;
    preview.height = ph;
    const imgW = bitmap.width, imgH = bitmap.height;
    loaded = { name: file.name, lum, hist: histogram(lum), out: new ImageData(pw, ph), colorBitmap };
    renderer.load(bitmap); // Original geht an den Worker (Besitz wird übertragen)
    dropzone.hidden = true;
    preview.hidden = false;
    $('info').hidden = false;
    $('info-name').textContent = file.name;
    $('info-size').textContent =
      `${imgW} × ${imgH} (${imgH > imgW ? 'Hochformat' : imgW > imgH ? 'Querformat' : 'quadratisch'})` +
      (viaFallback ? ' · HEIC über Reservedekoder' : '');
    preview.dataset.ready = '1';
    paint();
    setExportEnabled(true);
    status.textContent = '';
  } catch (e) {
    status.textContent = '';
    showError(e instanceof ValidationError ? e.message : 'Das Foto konnte nicht geladen werden.');
    setExportEnabled(loaded !== null);
  }
}

// --- Export (Originalauflösung) ---
function setExportEnabled(on: boolean): void {
  exportButtons.forEach((b) => (b.disabled = !on || busy));
}

async function runExport(label: string, action: (r: Rendered) => Promise<void>): Promise<void> {
  if (!loaded || busy) return;
  busy = true;
  setExportEnabled(false);
  showError(null);
  status.textContent = `${label}: Foto wird in voller Auflösung berechnet …`;
  try {
    const r = await renderer.renderFull(lut, (f) => { status.textContent = `${label}: ${Math.round(f * 100)} % berechnet …`; });
    await action(r);
    status.textContent = `Fertig (${r.width} × ${r.height})`;
  } catch (e) {
    status.textContent = '';
    showError(`Export fehlgeschlagen: ${(e as Error).message}`);
  } finally {
    busy = false;
    setExportEnabled(true);
  }
}

const outName = (ext: string) => `${baseName(loaded!.name)}_${levels}stufen.${ext}`;
// Auf Touch-Geräten (iPhone): fertige Datei erst nach einem zweiten Fingertipp teilen/sichern,
// weil Safari das Teilen nur direkt nach einer Berührung erlaubt, nicht nach langer Rechenzeit.
const ready = $<HTMLButtonElement>('ready');
const coarse = window.matchMedia('(pointer: coarse)').matches;
let pending: { blob: Blob; name: string } | null = null;

async function deliver(blob: Blob, name: string): Promise<void> {
  const file = new File([blob], name, { type: blob.type });
  if (coarse && navigator.canShare?.({ files: [file] })) {
    pending = { blob, name };
    ready.textContent = `Fertig: „${name}“ sichern oder teilen`;
    ready.hidden = false;
    return;
  }
  download(blob, name);
}
ready.addEventListener('click', async () => {
  if (!pending) return;
  const { blob, name } = pending;
  try {
    await navigator.share({ files: [new File([blob], name, { type: blob.type })] });
  } catch (e) {
    if ((e as Error).name !== 'AbortError') download(blob, name);
  }
  pending = null;
  ready.hidden = true;
});

$('save-jpeg').addEventListener('click', () => runExport('JPEG', (r) => deliver(r.blob, outName('jpg'))));
$('save-pdf').addEventListener('click', () => runExport('PDF', async (r) => deliver(await makePdf(r), outName('pdf'))));
$('print').addEventListener('click', () => runExport('Drucken', (r) => printImage(r)));

// --- Eingabe ---
const pick = () => fileInput.click();
dropzone.addEventListener('click', pick);
dropzone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
$('open').addEventListener('click', pick);
fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0];
  if (f) void loadFile(f);
  fileInput.value = '';
});
window.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('over'); });
window.addEventListener('dragleave', () => dropzone.classList.remove('over'));
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('over');
  const f = e.dataTransfer?.files?.[0];
  if (f) void loadFile(f);
});

// --- Bedienelemente ---
levelsInput.addEventListener('change', () => setLevels(Number(levelsInput.value)));
$('minus').addEventListener('click', () => setLevels(levels - 1));
$('plus').addEventListener('click', () => setLevels(levels + 1));
$('reset').addEventListener('click', () => setLevels(levels));
const compare = $('compare');
const setCompare = (on: boolean) => { comparing = on; paint(); };
compare.addEventListener('pointerdown', () => setCompare(true));
['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => compare.addEventListener(ev, () => setCompare(false)));
new ResizeObserver(() => paint()).observe(histCanvas);

setLevels(levels);
(window as unknown as { __app: unknown }).__app = { get levels() { return levels; }, get thresholds() { return thresholds; } };

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch(() => undefined);
}
