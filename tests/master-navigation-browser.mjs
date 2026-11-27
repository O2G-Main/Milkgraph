import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const root = process.env.BASE_URL ?? 'http://localhost:3100';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? '/usr/bin/chromium-browser', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
try {
  await page.goto(`${root}/login`);
  await page.getByRole('button', { name: 'Email', exact: true }).click();
  await page.getByRole('option').filter({ hasText: 'bagas.wicaksono@milkgraph.id' }).click();
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.waitForURL(`${root}/`);
  assert.equal(await page.locator('#desktop-navigation .nav-list a.nav-item').count(), 8);
  for (const [route, group] of [['/penjadwalan', 'Operasional'], ['/kondisi-pabrik', 'Operasional'], ['/qc-produk', 'Operasional'], ['/produksi', 'Master'], ['/alat', 'Master'], ['/produk', 'Master']]) {
    await page.goto(`${root}${route}`);
    await page.getByRole('heading', { level: 1 }).waitFor();
    assert.equal(await page.locator('#desktop-navigation .nav-item.active').getAttribute('aria-label'), group, route);
    assert.equal(await page.locator('#desktop-navigation .nav-sub[aria-current=page]').getAttribute('href'), route, route);
    assert.ok((await page.locator('.breadcrumb').innerText()).includes(group), `Breadcrumb missing ${group} on ${route}`);
  }
  if (process.env.QA_ARTIFACT_DIR) await page.screenshot({ path: `${process.env.QA_ARTIFACT_DIR}/master-sidebar-desktop.png` });
  await page.setViewportSize({ width: 390, height: 812 });
  await page.goto(`${root}/produk`);
  await page.getByRole('button', { name: 'Buka menu' }).click();
  const drawer = page.getByRole('dialog', { name: 'Menu navigasi' });
  await drawer.waitFor();
  assert.ok(await drawer.locator('.nav-section[data-open] .nav-item[aria-label="Master"]').count());
  if (process.env.QA_ARTIFACT_DIR) await page.screenshot({ path: `${process.env.QA_ARTIFACT_DIR}/master-sidebar-mobile.png` });
  await drawer.locator('.nav-sub[href="/alat"]').click();
  await page.waitForURL(`${root}/alat`);
  assert.equal(await page.locator('dialog[open]').count(), 0);
  console.log('PASS: Master & Operasional groups, active states, breadcrumbs, mobile drawer navigation');
} finally { await browser.close(); }
