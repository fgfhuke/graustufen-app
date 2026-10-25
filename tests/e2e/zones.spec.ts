import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const fx = (n: string) => path.resolve('tests/fixtures', n);
const frames = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

async function load(page: Page, name: string) {
  await page.goto('/');
  await page.setInputFiles('#file', fx(name));
  await expect(page.locator('#preview[data-ready="1"]')).toBeVisible();
}
async function setLevels(page: Page, n: number) {
  await page.fill('#levels', String(n));
  await page.locator('#levels').dispatchEvent('change');
  await frames(page);
}
/** Bildkoordinate der Vorschau -> Bildschirmposition (Bild ist eingepasst, object-fit: contain) */
async function screenPos(page: Page, ix: number, iy: number) {
  const box = (await page.locator('#preview').boundingBox())!;
  const [cw, ch] = await page.evaluate(() => { const c = document.getElementById('preview') as HTMLCanvasElement; return [c.width, c.height]; });
  const s = Math.min(box.width / cw, box.height / ch);
  return { x: box.x + (box.width - cw * s) / 2 + ix * s, y: box.y + (box.height - ch * s) / 2 + iy * s };
}
async function paintLine(page: Page, from: [number, number], to: [number, number]) {
  await page.locator('#brush-size').evaluate((e: HTMLInputElement) => { e.value = '200'; });
  const a = await screenPos(page, ...from), b = await screenPos(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await page.mouse.up();
  await frames(page);
}
const px = (page: Page, x: number, y: number) =>
  page.evaluate(([x, y]) => (document.getElementById('preview') as HTMLCanvasElement).getContext('2d')!.getImageData(x, y, 1, 1).data[0], [x, y]);

async function exportedGray(page: Page, points: [number, number][]) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.click('#save-jpeg')]);
  const b64 = readFileSync((await dl.path())!).toString('base64');
  return page.evaluate(async ([b64, points]) => {
    const bin = Uint8Array.from(atob(b64 as string), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bin], { type: 'image/jpeg' }));
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = c.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0);
    return { w: bmp.width, h: bmp.height, v: (points as [number, number][]).map(([x, y]) => ctx.getImageData(x, y, 1, 1).data[0]) };
  }, [b64, points] as const);
}

test('Bereich: eigene Stufen nur im bemalten Teil, in Vorschau und Export', async ({ page }) => {
  await load(page, 'gradient-256.png');
  await setLevels(page, 2);                 // ganzes Bild: 0 / 255, Grenze 128
  await page.click('#zone-add');
  await expect(page.locator('#brush')).toBeVisible();
  await expect(page.locator('#zone-hint')).toBeVisible();
  await setLevels(page, 3);                 // Bereich 1: 0 / 128 / 255
  await paintLine(page, [95, 32], [150, 32]);
  await expect(page.locator('#zone-hint')).toBeHidden();
  await page.uncheck('#show-mask');
  await frames(page);
  expect(await px(page, 120, 32)).toBe(128); // im Bereich
  expect(await px(page, 20, 32)).toBe(0);    // außerhalb, Grundeinstellung
  expect(await px(page, 240, 32)).toBe(255);
  // Grundeinstellung bleibt beim Wechsel erhalten
  await page.click('#zones button[data-zone="0"]');
  await expect(page.locator('.handle')).toHaveCount(1);
  const e = await exportedGray(page, [[120, 32], [20, 32], [240, 32]]);
  expect([e.w, e.h]).toEqual([256, 64]);
  expect(Math.abs(e.v[0] - 128)).toBeLessThanOrEqual(3);
  expect(e.v[1]).toBeLessThanOrEqual(3);
  expect(e.v[2]).toBeGreaterThanOrEqual(252);
  // Bereich löschen stellt die Grundeinstellung wieder her
  await page.click('#zones button[data-zone="1"]');
  await page.click('#zone-delete');
  await frames(page);
  expect(await px(page, 120, 32)).toBe(0);
  await expect(page.locator('#brush')).toBeHidden();
});

test('Bereich: Radierer nimmt Teile wieder heraus', async ({ page }) => {
  await load(page, 'gradient-256.png');
  await setLevels(page, 2);
  await page.click('#zone-add');
  await setLevels(page, 3);
  await paintLine(page, [95, 32], [150, 32]);
  await page.click('#tool-erase');
  await paintLine(page, [95, 32], [150, 32]);
  await page.uncheck('#show-mask');
  await frames(page);
  expect(await px(page, 120, 32)).toBe(0);
});

test('Bereich: Masken werden für den Export auf volle Größe vergrößert', async ({ page }) => {
  await load(page, 'gradient-wide-4000x400.png');
  const [cw] = await page.evaluate(() => { const c = document.getElementById('preview') as HTMLCanvasElement; return [c.width]; });
  expect(cw).toBe(2000);
  await setLevels(page, 2);
  await page.click('#zone-add');
  await setLevels(page, 3);
  await paintLine(page, [850, 100], [950, 100]);
  const e = await exportedGray(page, [[1800, 200], [200, 200], [3800, 200]]);
  expect([e.w, e.h]).toEqual([4000, 400]);
  expect(Math.abs(e.v[0] - 128)).toBeLessThanOrEqual(3); // Grauwert 115: Bereich -> 128, Grundeinstellung wäre 0
  expect(e.v[1]).toBeLessThanOrEqual(3);
  expect(e.v[2]).toBeGreaterThanOrEqual(252);
});

test('Höchstens drei Bereiche, neues Foto entfernt sie', async ({ page }) => {
  await load(page, 'gradient-256.png');
  for (let i = 0; i < 3; i++) await page.click('#zone-add');
  await expect(page.locator('#zone-add')).toHaveCount(0);
  await expect(page.locator('#zones button[data-zone]')).toHaveCount(4);
  await page.setInputFiles('#file', fx('portrait-exif6.jpg'));
  await expect(page.locator('#zones button[data-zone]')).toHaveCount(1);
  await expect(page.locator('#zone-add')).toHaveCount(1);
});

test('Tasten P/R und Umschalt + Scrollrad für die Pinselgröße', async ({ page }) => {
  await load(page, 'gradient-256.png');
  // Ohne gewählten Bereich passiert nichts
  await page.keyboard.press('r');
  await page.click('#zone-add');
  await expect(page.locator('#keys-hint')).toBeVisible();
  await page.locator('body').click({ position: { x: 1, y: 1 } }).catch(() => undefined);
  await page.keyboard.press('r');
  await expect(page.locator('#tool-erase')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('p');
  await expect(page.locator('#tool-paint')).toHaveAttribute('aria-pressed', 'true');
  // Im Zahlenfeld werden Buchstaben nicht abgefangen
  await page.focus('#levels');
  await page.keyboard.press('r');
  await expect(page.locator('#tool-paint')).toHaveAttribute('aria-pressed', 'true');
  // Strg/Cmd + R bleibt dem Browser vorbehalten
  await page.locator('#tool-erase').click();
  await page.keyboard.press('ControlOrMeta+p');
  await expect(page.locator('#tool-erase')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('p');
  // Kreis sitzt mittig unter dem Mauszeiger
  const pb = (await page.locator('#preview').boundingBox())!;
  await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2);
  const cb0 = (await page.locator('#brush-cursor').boundingBox())!;
  expect(Math.abs(cb0.x + cb0.width / 2 - (pb.x + pb.width / 2))).toBeLessThanOrEqual(2);
  expect(Math.abs(cb0.y + cb0.height / 2 - (pb.y + pb.height / 2))).toBeLessThanOrEqual(2);
  // Pinselkreis folgt der Maus in Pinselgröße
  await expect(page.locator('#brush-cursor')).toBeVisible();
  const size = async () => Number(await page.locator('#brush-size').inputValue());
  const start = await size();
  expect((await page.locator('#brush-cursor').boundingBox())!.width).toBeCloseTo(start, 0);
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, -200);
  await expect.poll(size).toBeGreaterThan(start);
  const bigger = await size();
  await page.mouse.wheel(0, 400);
  await expect.poll(size).toBeLessThan(bigger);
  await page.keyboard.up('Shift');
  // Ohne Umschalt ändert das Scrollrad die Größe nicht
  const now = await size();
  await page.mouse.wheel(0, -200);
  await page.waitForTimeout(100);
  expect(await size()).toBe(now);
  expect((await page.locator('#brush-cursor').boundingBox())!.width).toBeCloseTo(now, 0);
});
