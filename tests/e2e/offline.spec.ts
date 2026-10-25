import { test, expect } from '@playwright/test';
import path from 'node:path';

test.use({ serviceWorkers: 'allow' });

test('App startet und arbeitet ohne Netz (Service Worker)', async ({ page, context }) => {
  const problems: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  // Seite einmal mit aktivem Service Worker neu laden, damit alles im Cache liegt
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await page.setInputFiles('#file', path.resolve('tests/fixtures/sample-portrait.heic'));
  await expect(page.locator('#preview[data-ready="1"]')).toBeVisible();
  expect(problems).toEqual([]);
});
