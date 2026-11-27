import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const root = process.env.BASE_URL ?? 'http://127.0.0.1:3100';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? '/usr/bin/chromium-browser', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 812 }, reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(`${root}/login`);
  await page.getByRole('button', { name: 'Email', exact: true }).click();
  await page.getByRole('option').filter({ hasText: 'bagas.wicaksono@milkgraph.id' }).click();
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.waitForURL(`${root}/`);
  await page.goto(`${root}/alat`);
  await page.getByRole('heading', { name: 'Alat', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Pengaturan', exact: true }).count(), 0);
  const button = page.getByRole('button', { name: /^Perbarui kondisi / }).first();
  await button.waitFor();
  const metrics = await button.evaluate(el => ({ height: el.getBoundingClientRect().height, fontSize: parseFloat(getComputedStyle(el).fontSize), text: el.textContent?.trim() }));
  assert.ok(metrics.height >= 44 && metrics.fontSize >= 15 && metrics.text === 'Ubah kondisi', JSON.stringify(metrics));
  await button.click();
  const dialog = page.getByRole('dialog', { name: /Kondisi / });
  await dialog.waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await dialog.count(), 0);
  await page.goto(`${root}/produksi`);
  await page.getByRole('button', { name: 'Pengaturan produksi', exact: true }).click();
  await page.getByRole('heading', { name: 'Batas operasional' }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: demo Alat status actions and relocated global settings');
} finally { await browser.close(); }
