import './styles.css';
import './print.css';
import { toLuminance } from './core/luminance';
import { defaultThresholds, clampLevels } from './core/thresholds';
import { buildLut } from './core/lut';
import { compose, stroke, layerHistogram, MAX_ZONES, type Layer } from './core/zones';
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
const zonesBar = $('zones');
const brushBox = $('brush');
const brushSize = $<HTMLInputElement>('brush-size');
const showMask = $<HTMLInputElement>('show-mask');
const zoneHint = $('zone-hint');
const brushCursor = $('brush-cursor');
const exportButtons = ['save-jpeg', 'save-pdf', 'print'].map((id) => $<HTMLButtonElement>(id));

const renderer = new RenderClient();

// --- Zustand ---
// zones[0] ist die Grundeinstellung (ganzes Bild), zones[1..] sind gemalte Bereiche.
interface Zone { levels: number; thresholds: number[]; lut: Uint8Array; mask: Uint8Array | null; painted: boolean }
const makeZone = (levels: number, mask: Uint8Array | null): Zone => {
  const thresholds = defaultThresholds(levels);
  return { levels: clampLevels(levels), thresholds, lut: buildLut(thresholds), mask, painted: false };
};
const zones: Zone[] = [makeZone(4, null)];
let active = 0;

interface Loaded { name: string; w: number; h: number; lum: Uint8Array; gray: Uint8Array; out: ImageData; colorBitmap: ImageBitmap }
let loaded: Loaded | null = null;
let hist: ArrayLike<number> | null = null;
let comparing = false;
let busy = false;
let erasing = false;

const cur = () => zones[active];
const paintedLayers = (): Layer[] => zones.slice(1).filter((z) => z.painted).map((z) => ({ lut: z.lut, mask: z.mask! }));

const slider = new ThresholdSlider(
  $('track'),
  (t) => { cur().thresholds = t; cur().lut = buildLut(t); update(); },
  (v) => { $('readout').textContent = v === null ? '' : `Grenze bei ${v}`; },
);

function showError(text: string | null): void {
  message.hidden = text === null;
  message.textContent = text ?? '';
}

// --- Histogramm des gewählten Bereichs ---
function refreshHistogram(): void {
  if (!loaded) { hist = null; return; }
  const masks = zones.slice(1).filter((z) => z.painted).map((z) => z.mask!);
  if (active === 0) hist = layerHistogram(loaded.lum, masks, 0);
  else if (!cur().painted) hist = null;
  else hist = layerHistogram(loaded.lum, masks, masks.indexOf(cur().mask!) + 1);
}

// --- Vorschau (verkleinert, schnell) ---
let scheduled = false;
function update(): void {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => { scheduled = false; paint(); });
}

function paint(): void {
  drawHistogram(histCanvas, hist, cur().lut);
  if (!loaded) return;
  const ctx = preview.getContext('2d')!;
  if (comparing) { ctx.drawImage(loaded.colorBitmap, 0, 0); return; }
  const g = compose(loaded.lum, zones[0].lut, paintedLayers(), loaded.gray);
  const d = loaded.out.data;
  const overlay = active > 0 && showMask.checked && cur().painted ? cur().mask! : null;
  for (let i = 0, j = 0; i < g.length; i++, j += 4) {
    const v = g[i];
    if (overlay && overlay[i]) {
      const a = overlay[i] * 0.45 / 255; // orange Hervorhebung
      d[j] = v + (230 - v) * a; d[j + 1] = v + (90 - v) * a; d[j + 2] = v + (20 - v) * a;
    } else { d[j] = v; d[j + 1] = v; d[j + 2] = v; }
    d[j + 3] = 255;
  }
  ctx.putImageData(loaded.out, 0, 0);
}

function syncControls(): void {
  levelsInput.value = String(cur().levels);
  slider.setThresholds(cur().thresholds);
}

function setLevels(n: number): void {
  const z = cur();
  z.levels = clampLevels(n);
  z.thresholds = defaultThresholds(z.levels);
  z.lut = buildLut(z.thresholds);
  syncControls();
  update();
}

// --- Bereiche: Reiter und Malwerkzeuge ---
function renderZones(): void {
  zonesBar.replaceChildren();
  zones.forEach((_, k) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = k === 0 ? 'Ganzes Bild' : `Bereich ${k}`;
    b.setAttribute('aria-pressed', String(k === active));
    b.dataset.zone = String(k);
    b.addEventListener('click', () => selectZone(k));
    zonesBar.appendChild(b);
  });
  if (loaded && zones.length - 1 < MAX_ZONES) {
    const add = document.createElement('button');
    add.type = 'button';
    add.id = 'zone-add';
    add.className = 'add';
    add.textContent = '+ Bereich';
    add.addEventListener('click', addZone);
    zonesBar.appendChild(add);
  }
  brushBox.hidden = active === 0;
  zoneHint.hidden = active === 0 || cur().painted;
  preview.classList.toggle('painting', active > 0);
  placeCursor();
}

function selectZone(k: number): void {
  active = k;
  renderZones();
  syncControls();
  refreshHistogram();
  update();
}

function addZone(): void {
  if (!loaded || zones.length - 1 >= MAX_ZONES) return;
  // Neuer Bereich startet mit der Einstellung des ganzen Bildes, damit man von dort aus anpasst
  const z = makeZone(zones[0].levels, new Uint8Array(loaded.w * loaded.h));
  z.thresholds = zones[0].thresholds.slice();
  z.lut = buildLut(z.thresholds);
  zones.push(z);
  selectZone(zones.length - 1);
}

function deleteZone(): void {
  if (active === 0) return;
  zones.splice(active, 1);
  selectZone(Math.min(active, zones.length - 1));
}

function setTool(erase: boolean): void {
  erasing = erase;
  $('tool-paint').setAttribute('aria-pressed', String(!erase));
  $('tool-erase').setAttribute('aria-pressed', String(erase));
}

/** Bildschirmposition -> Pixel in der Vorschau (berücksichtigt das eingepasste Bild, object-fit: contain). */
function toImage(ev: PointerEvent) {
  const r = preview.getBoundingClientRect();
  const scale = Math.min(r.width / preview.width, r.height / preview.height);
  const offX = (r.width - preview.width * scale) / 2;
  const offY = (r.height - preview.height * scale) / 2;
  return { x: (ev.clientX - r.left - offX) / scale, y: (ev.clientY - r.top - offY) / scale, scale };
}

let last: { x: number; y: number } | null = null;
preview.addEventListener('pointerdown', (ev) => {
  if (active === 0 || !loaded || comparing) return;
  ev.preventDefault();
  preview.setPointerCapture(ev.pointerId);
  const p = toImage(ev);
  const radius = Number(brushSize.value) / 2 / p.scale;
  stroke(cur().mask!, loaded.w, loaded.h, p.x, p.y, p.x, p.y, radius, erasing);
  cur().painted = true;
  zoneHint.hidden = true;
  last = p;
  update();
});
preview.addEventListener('pointermove', (ev) => {
  if (!last || !loaded) return;
  const p = toImage(ev);
  stroke(cur().mask!, loaded.w, loaded.h, last.x, last.y, p.x, p.y, Number(brushSize.value) / 2 / p.scale, erasing);
  last = p;
  update();
});
const endStroke = () => {
  if (!last) return;
  last = null;
  refreshHistogram();
  update();
};
preview.addEventListener('pointerup', endStroke);
preview.addEventListener('pointercancel', endStroke);

// --- Pinsel-Kreis als Mauszeiger (nur mit Maus/Trackpad) ---
let pointerAt: { x: number; y: number } | null = null;
function placeCursor(): void {
  const show = active > 0 && !!loaded && !!pointerAt && !comparing;
  brushCursor.hidden = !show;
  preview.classList.toggle('with-cursor', show);
  if (!show) return;
  const st = $('stage').getBoundingClientRect();
  const d = Number(brushSize.value);
  brushCursor.style.width = brushCursor.style.height = `${d}px`;
  brushCursor.style.left = `${pointerAt!.x - st.left}px`;
  brushCursor.style.top = `${pointerAt!.y - st.top}px`;
}
preview.addEventListener('pointermove', (ev) => {
  if (ev.pointerType !== 'mouse') return;
  pointerAt = { x: ev.clientX, y: ev.clientY };
  placeCursor();
});
preview.addEventListener('pointerleave', () => { pointerAt = null; placeCursor(); });

/** Pinselgröße ändern, begrenzt auf den Bereich des Reglers. */
function resizeBrush(factor: number): void {
  const min = Number(brushSize.min), max = Number(brushSize.max);
  const cur = Number(brushSize.value);
  let next = Math.round(cur * factor);
  if (next === cur) next = cur + (factor > 1 ? 1 : -1);
  brushSize.value = String(Math.min(max, Math.max(min, next)));
  placeCursor();
}
brushSize.addEventListener('input', placeCursor);

// Umschalt + Scrollrad über dem Bild: Pinsel größer (nach oben) oder kleiner (nach unten).
// macOS meldet Umschalt+Scrollen oft als waagerechtes Scrollen, daher zählt auch deltaX.
preview.addEventListener('wheel', (ev) => {
  if (!ev.shiftKey || active === 0) return;
  ev.preventDefault();
  const delta = ev.deltaY !== 0 ? ev.deltaY : ev.deltaX;
  if (delta === 0) return;
  const unit = ev.deltaMode === 1 ? 33 : ev.deltaMode === 2 ? 300 : 1; // Zeilen/Seiten in Pixel umrechnen
  resizeBrush(Math.exp(-delta * unit * 0.002));
}, { passive: false });

// Tasten P (Pinsel) und R (Radierer), nur wenn ein Bereich gewählt ist und kein Eingabefeld den Fokus hat
window.addEventListener('keydown', (ev) => {
  if (active === 0 || ev.metaKey || ev.ctrlKey || ev.altKey) return;
  const t = ev.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range' && (t as HTMLInputElement).type !== 'checkbox' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  const k = ev.key.toLowerCase();
  if (k === 'p') { setTool(false); ev.preventDefault(); }
  else if (k === 'r') { setTool(true); ev.preventDefault(); }
});

$('tool-paint').addEventListener('click', () => setTool(false));
$('tool-erase').addEventListener('click', () => setTool(true));
$('zone-delete').addEventListener('click', deleteZone);
showMask.addEventListener('change', update);

// --- Laden ---
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
    const lum = toLuminance(ctx.getImageData(0, 0, pw, ph).data);
    loaded?.colorBitmap.close();
    const colorBitmap = await createImageBitmap(c);
    small.close();
    preview.width = pw;
    preview.height = ph;
    const imgW = bitmap.width, imgH = bitmap.height;
    loaded = { name: file.name, w: pw, h: ph, lum, gray: new Uint8Array(pw * ph), out: new ImageData(pw, ph), colorBitmap };
    renderer.load(bitmap); // Original geht an den Worker (Besitz wird übertragen)
    zones.length = 1; // Bereiche gehören zum alten Foto
    dropzone.hidden = true;
    preview.hidden = false;
    $('info').hidden = false;
    $('info-name').textContent = file.name;
    $('info-size').textContent =
      `${imgW} × ${imgH} (${imgH > imgW ? 'Hochformat' : imgW > imgH ? 'Querformat' : 'quadratisch'})` +
      (viaFallback ? ' · HEIC über Reservedekoder' : '');
    preview.dataset.ready = '1';
    selectZone(0);
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
    const spec = { base: zones[0].lut, layers: paintedLayers(), mw: loaded.w, mh: loaded.h };
    const r = await renderer.renderFull(spec, (f) => { status.textContent = `${label}: ${Math.round(f * 100)} % berechnet …`; });
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

const outName = (ext: string) => `${baseName(loaded!.name)}_${zones[0].levels}stufen.${ext}`;
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
    ready.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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
$('minus').addEventListener('click', () => setLevels(cur().levels - 1));
$('plus').addEventListener('click', () => setLevels(cur().levels + 1));
$('reset').addEventListener('click', () => setLevels(cur().levels));
const compare = $('compare');
preview.addEventListener('contextmenu', (e) => e.preventDefault());
const setCompare = (on: boolean) => { comparing = on; paint(); placeCursor(); };
compare.addEventListener('pointerdown', () => setCompare(true));
compare.addEventListener('contextmenu', (e) => e.preventDefault());
['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => compare.addEventListener(ev, () => setCompare(false)));
new ResizeObserver(() => paint()).observe(histCanvas);

renderZones();
syncControls();
update();
(window as unknown as { __app: unknown }).__app = {
  get levels() { return cur().levels; },
  get thresholds() { return cur().thresholds; },
  get zones() { return zones.length - 1; },
};

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch(() => undefined);
}
