import { test, expect } from '@playwright/test';
import path from 'node:path';

const fx = (n: string) => path.resolve('tests/fixtures', n);

test('iPhone: Layout passt in den Bildschirm, Griffe sind mit dem Finger greifbar', async ({ page }) => {
  await page.goto('/');
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
  await page.setInputFiles('#file', fx('sample-portrait.heic'));
  await expect(page.locator('#preview[data-ready="1"]')).toBeVisible();
  await page.fill('#levels', '16');
  await page.locator('#levels').dispatchEvent('change');
  await expect(page.locator('.handle')).toHaveCount(15);

  const vw = page.viewportSize()!.width;
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  const boxes = await page.locator('.handle').evaluateAll((els) =>
    els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }));
  for (const b of boxes) { expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x + b.w).toBeLessThanOrEqual(vw); expect(b.h).toBeGreaterThanOrEqual(44); }
  // Keine Überlappung zwischen allen Griffen
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], c = boxes[j];
    const overlap = a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h;
    expect(overlap, `Griff ${i} und ${j}`).toBe(false);
  }
  // Export-Leiste und Vorschau sichtbar
  await expect(page.locator('#save-jpeg')).toBeInViewport();
  await expect(page.locator('#preview')).toBeInViewport();
});

test('iPhone: Sichern läuft in zwei Schritten über das Teilen-Menü', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__shared = null;
    navigator.canShare = () => true;
    navigator.share = async (d: ShareData) => { (window as any).__shared = d.files!.map((f) => [f.name, f.type, f.size]); };
  });
  await page.goto('/');
  await page.setInputFiles('#file', fx('portrait-exif6.jpg'));
  await expect(page.locator('#preview[data-ready="1"]')).toBeVisible();
  await page.tap('#save-jpeg');
  await expect(page.locator('#ready')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__shared)).toBeNull();
  await page.tap('#ready');
  await expect(page.locator('#ready')).toBeHidden();
  const shared = await page.evaluate(() => (window as any).__shared);
  expect(shared[0][0]).toBe('portrait-exif6_4stufen.jpg');
  expect(shared[0][1]).toBe('image/jpeg');
  expect(shared[0][2]).toBeGreaterThan(500);
});
