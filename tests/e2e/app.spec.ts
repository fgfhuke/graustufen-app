import { test, expect, type Page } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const fx = (n: string) => path.resolve('tests/fixtures', n);

async function load(page: Page, name: string) {
  await page.goto('/');
  await page.setInputFiles('#file', fx(name));
  await expect(page.locator('#preview[data-ready="1"]')).toBeVisible();
}
const size = (page: Page) => page.evaluate(() => { const c = document.getElementById('preview') as HTMLCanvasElement; return [c.width, c.height]; });
const px = (page: Page, x: number, y: number) =>
  page.evaluate(([x, y]) => (document.getElementById('preview') as HTMLCanvasElement).getContext('2d')!.getImageData(x, y, 1, 1).data[0], [x, y]);
async function setLevels(page: Page, n: number) {
  await page.fill('#levels', String(n));
  await page.locator('#levels').dispatchEvent('change');
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}
function jpegSize(buf: Buffer): [number, number] {
  for (let i = 2; i < buf.length - 9; ) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error('kein SOF');
}

test('Gradient: 2 Stufen trennen genau bei 128', async ({ page }) => {
  await load(page, 'gradient-256.png');
  expect(await size(page)).toEqual([256, 64]);
  await setLevels(page, 2);
  expect(await px(page, 0, 10)).toBe(0);
  expect(await px(page, 127, 10)).toBe(0);
  expect(await px(page, 128, 10)).toBe(255);
  expect(await px(page, 255, 10)).toBe(255);
});

test('Gradient: 3 Stufen ergeben 0, 128, 255', async ({ page }) => {
  await load(page, 'gradient-256.png');
  await setLevels(page, 3);
  expect([await px(page, 10, 5), await px(page, 120, 5), await px(page, 250, 5)]).toEqual([0, 128, 255]);
});

test('Anzahl ändern: Griffe passen, gleichmäßig verteilt', async ({ page }) => {
  await load(page, 'gradient-256.png');
  for (const n of [2, 5, 16, 2]) {
    await setLevels(page, n);
    await expect(page.locator('.handle')).toHaveCount(n - 1);
  }
  await setLevels(page, 3);
  const vals = await page.locator('.handle').evaluateAll((els) => els.map((e) => Number(e.getAttribute('aria-valuenow'))));
  expect(vals).toEqual([85, 171]);
  await setLevels(page, 99);
  await expect(page.locator('.handle')).toHaveCount(15);
});

test('Griff per Tastatur stoppt vor dem Nachbarn', async ({ page }) => {
  await load(page, 'gradient-256.png');
  await setLevels(page, 3);
  const h0 = page.locator('.handle').first();
  await h0.focus();
  await page.keyboard.press('End');
  await expect(h0).toHaveAttribute('aria-valuenow', '170');
  await page.keyboard.press('ArrowLeft');
  await expect(h0).toHaveAttribute('aria-valuenow', '169');
});

test('Griff per Maus ziehen, Nachbar bleibt unüberholt', async ({ page }) => {
  await load(page, 'gradient-256.png');
  await setLevels(page, 3);
  const h0 = page.locator('.handle').first();
  const box = (await h0.boundingBox())!;
  const track = (await page.locator('#track').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width - 2, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(h0).toHaveAttribute('aria-valuenow', '170');
});

for (const [name, w, h] of [['portrait-exif6.jpg', 300, 400], ['landscape-exif8.jpg', 300, 400]] as const) {
  test(`EXIF-Ausrichtung ${name}`, async ({ page }) => {
    await load(page, name);
    expect(await size(page)).toEqual([w, h]);
    await expect(page.locator('#info-size')).toContainText('Hochformat');
  });
}

test('HEIC lädt (nativ oder Reserve)', async ({ page }) => {
  await load(page, 'sample-portrait.heic');
  const [w, h] = await size(page);
  console.log('HEIC-Maße', w, h, await page.locator('#info-size').textContent());
  expect(w * h).toBe(120000);
});

test('Defekte Dateien zeigen eine Meldung, App bleibt benutzbar', async ({ page }) => {
  await page.goto('/');
  for (const n of ['truncated.jpg', 'fake.heic']) {
    await page.setInputFiles('#file', fx(n));
    await expect(page.locator('#message')).toBeVisible();
  }
  await page.setInputFiles('#file', fx('gradient-256.png'));
  await expect(page.locator('#preview[data-ready="1"]')).toBeVisible();
  await expect(page.locator('#message')).toBeHidden();
});

test('JPEG-Export in Originalgröße', async ({ page }) => {
  await load(page, 'portrait-exif6.jpg');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#save-jpeg')]);
  expect(dl.suggestedFilename()).toBe('portrait-exif6_4stufen.jpg');
  expect(jpegSize(readFileSync((await dl.path())!))).toEqual([300, 400]);
});

test('PDF-Export: A4 hoch bzw. quer', async ({ page }) => {
  for (const [name, mb] of [['portrait-exif6.jpg', [595.28, 841.89]], ['gradient-256.png', [841.89, 595.28]]] as [string, number[]][]) {
    await load(page, name);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#save-pdf')]);
    const pdf = readFileSync((await dl.path())!).toString('latin1');
    expect(pdf.startsWith('%PDF')).toBe(true);
    const m = pdf.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/)!;
    expect([Number(m[1]), Number(m[2])].map((v) => Math.round(v * 100) / 100)).toEqual(mb);
    expect((pdf.match(/\/Type\s*\/Page\b/g) ?? []).length).toBe(1);
  }
});

test('60-Megapixel-Bild: Export in voller Auflösung', async ({ page }) => {
  test.skip(!existsSync(fx('huge-9000x6700.jpg')), 'generate.py ausführen');
  await load(page, 'huge-9000x6700.jpg');
  const [pw, ph] = await size(page);
  expect(Math.max(pw, ph)).toBe(2000);
  const t0 = Date.now();
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.click('#save-jpeg')]);
  console.log('Exportdauer ms', Date.now() - t0);
  expect(jpegSize(readFileSync((await dl.path())!))).toEqual([9000, 6700]);
});

test('Nach dem Laden ist die Ablagefläche weg und die Vorschau passt in den Bereich', async ({ page }) => {
  await load(page, 'gradient-256.png');
  await expect(page.locator('#dropzone')).toBeHidden();
  const stage = (await page.locator('#stage').boundingBox())!;
  const prev = (await page.locator('#preview').boundingBox())!;
  expect(prev.x + prev.width).toBeLessThanOrEqual(stage.x + stage.width + 1);
});

test('Exportierte JPEG-Datei ist ein gültiges Graustufenbild mit den richtigen Werten', async ({ page }) => {
  await load(page, 'gradient-256.png');
  await setLevels(page, 3);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#save-jpeg')]);
  const b64 = readFileSync((await dl.path())!).toString('base64');
  const r = await page.evaluate(async (b64) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bin], { type: 'image/jpeg' }));
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = c.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0);
    const at = (x: number) => Array.from(ctx.getImageData(x, 32, 1, 1).data.slice(0, 3));
    return { w: bmp.width, h: bmp.height, a: at(20), b: at(120), c: at(240) };
  }, b64);
  expect([r.w, r.h]).toEqual([256, 64]);
  for (const [px, want] of [[r.a, 0], [r.b, 128], [r.c, 255]] as const) {
    expect(px[0]).toBe(px[1]);
    expect(px[1]).toBe(px[2]);
    expect(Math.abs(px[0] - want)).toBeLessThanOrEqual(3);
  }
});

test('PDF bettet das Graustufen-JPEG ein', async ({ page }) => {
  await load(page, 'gradient-256.png');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#save-pdf')]);
  const pdf = readFileSync((await dl.path())!).toString('latin1');
  expect(pdf).toContain('/DCTDecode');
  expect(pdf).toContain('/DeviceGray');
});
