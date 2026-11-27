import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const root = process.env.BASE_URL ?? 'http://127.0.0.1:3100';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? '/usr/bin/chromium-browser', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
try {
  // Login's role switch is a POST; keep it local while all operational reads use the GET-only proxy.
  await page.route('**/api/v1/session/role', route => route.request().method() === 'POST'
    ? route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }) : route.continue());
  await page.route(url => url.pathname === '/api/v1/production/plans', route => {
    const week = new URL(route.request().url()).searchParams.get('week') ?? '2026-11-22';
    const items = [1, 2].map(index => ({ proposal_id: `QA-${index}`, week: 1, week_start_sunday: week,
      finished_sku_id: `QA-SKU-${index}`, product_name: 'Data uji', pack_size_ml: 1000,
      market: null, target_packs: 1000, target_volume_l: 1000,
      batch_id: null, batch_code: null, production_date: null }));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: items.length, items }) });
  });
  await page.goto(`${root}/login`);
  await page.getByRole('button', { name: 'Email', exact: true }).click();
  await page.getByRole('option').filter({ hasText: 'bagas.wicaksono@milkgraph.id' }).click();
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.waitForURL(`${root}/`);

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 812 });
    await page.goto(`${root}/penjadwalan`);
    const filter = page.getByRole('group', { name: 'Filter tanggal' });
    await filter.waitFor();
    const week = filter.locator('span[aria-live="polite"]');
    const initialWeek = await week.innerText();
    assert.ok(await filter.getByRole('button', { name: 'Tanggal penjadwalan' }).isVisible());
    assert.ok(await filter.getByRole('button', { name: 'Hari ini' }).isVisible());
    const layout = await filter.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, viewport: window.innerWidth,
        overflow: document.documentElement.scrollWidth > window.innerWidth };
    });
    assert.ok(layout.left >= 0 && layout.right <= width && !layout.overflow, `Filter overflowing at ${width}: ${JSON.stringify(layout)}`);
    await filter.getByRole('button', { name: 'Minggu sebelumnya' }).click();
    assert.notEqual(await week.innerText(), initialWeek, 'Previous week did not change the filter');
    await filter.getByRole('button', { name: 'Tanggal penjadwalan' }).click();
    const day = page.getByRole('dialog', { name: 'Tanggal penjadwalan' }).getByRole('gridcell', { name: '14', exact: true });
    await day.click();
    assert.equal(await filter.getByRole('button', { name: 'Tanggal penjadwalan' }).getAttribute('aria-expanded'), 'false');
    await filter.getByRole('button', { name: 'Hari ini' }).click();
    assert.equal(await week.innerText(), initialWeek, 'Hari ini did not reset the week');
    if (process.env.QA_ARTIFACT_DIR) await page.screenshot({ path: `${process.env.QA_ARTIFACT_DIR}/penjadwalan-${width}.png`, fullPage: true });
  }
  const count = page.locator('[class*="planSummary"] strong');
  await count.waitFor({ timeout: 20_000 });
  assert.equal((await count.innerText()).replace(/\s+/g, ' '), '2 usulan mingguan');
  const size = await count.evaluate(element => ({ number: parseFloat(getComputedStyle(element.querySelector('span')).fontSize),
    label: parseFloat(getComputedStyle(element).fontSize) }));
  assert.ok(size.number >= 24 && size.label >= 16, `Weekly proposal count too small: ${JSON.stringify(size)}`);
  await page.getByRole('button', { name: 'PO & versi jadwal' }).click();
  await page.getByRole('heading', { name: 'PO & versi jadwal' }).waitFor();
  const table = page.locator('dialog .schedule-table').first();
  if (await table.count()) {
    const font = await table.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    assert.ok(font >= 14, `Scheduling table text too small: ${font}`);
  }
  console.log('PASS: unified left date filter, week/calendar/today synchronization, responsive layout, proposal count and table typography');
} finally { await browser.close(); }
