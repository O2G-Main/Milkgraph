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

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 812 });
    await page.goto(`${root}/penjadwalan`);
    // Next's dev-only bottom badge overlaps this popup at 320px; production has no badge.
    await page.addStyleTag({ content: 'nextjs-portal { pointer-events: none !important; }' });
    const filter = page.getByRole('group', { name: 'Filter tanggal' });
    await filter.waitFor();
    const trigger = filter.getByRole('button', { name: 'Tanggal penjadwalan' });
    assert.ok(await trigger.isVisible());
    assert.equal(await page.getByRole('button', { name: 'Minggu sebelumnya' }).count(), 0, 'Week slider must live inside dropdown');
    assert.equal(await page.getByRole('button', { name: 'Hari ini' }).count(), 0, 'Today belongs in date dropdown');
    const layout = await filter.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, viewport: window.innerWidth,
        overflow: document.documentElement.scrollWidth > window.innerWidth };
    });
    assert.ok(layout.left >= 0 && layout.right <= width && !layout.overflow, `Filter overflowing at ${width}: ${JSON.stringify(layout)}`);
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Tanggal penjadwalan' });
    const week = dialog.locator('[aria-label="Navigasi minggu"] [aria-live="polite"]');
    const initialWeek = await week.innerText();
    const popup = await dialog.evaluate(el => {
      const rect = el.closest('.field-popover').getBoundingClientRect();
      return { left: rect.left, right: rect.right, viewport: window.innerWidth };
    });
    assert.ok(popup.left >= 0 && popup.right <= width, `Date dropdown overflowing at ${width}: ${JSON.stringify(popup)}`);
    if (process.env.QA_ARTIFACT_DIR && width === 390) await page.screenshot({ path: `${process.env.QA_ARTIFACT_DIR}/penjadwalan-filter-open.png` });
    await dialog.getByRole('button', { name: 'Minggu sebelumnya' }).click();
    assert.notEqual(await week.innerText(), initialWeek, 'Previous week did not change the filter');
    assert.equal(await trigger.getAttribute('aria-expanded'), 'true', 'Slider should keep dropdown open');
    await dialog.getByRole('button', { name: 'Minggu berikutnya' }).click();
    assert.equal(await week.innerText(), initialWeek, 'Next week did not restore the filter');
    const day = dialog.getByRole('gridcell', { name: '1', exact: true });
    await day.click();
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    await trigger.click();
    const selectedMonth = await dialog.locator('.cal-head strong').innerText();
    await dialog.getByRole('button', { name: 'Minggu sebelumnya' }).click();
    assert.notEqual(await dialog.locator('.cal-head strong').innerText(), selectedMonth, 'Week navigation did not follow the previous month');
    await dialog.getByRole('button', { name: 'Hari ini' }).click();
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    if (width === 1440) {
      const selectedDate = await trigger.innerText();
      await page.locator('[data-date]').first().hover();
      await page.waitForTimeout(250);
      assert.equal(await trigger.innerText(), selectedDate, 'Calendar hover must not change the selected date filter');
    }
    await trigger.click();
    assert.equal(await week.innerText(), initialWeek, 'Hari ini did not reset the week');
    await dialog.press('Escape');
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    const bodySize = await page.locator('[class*="metricNote"]').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    const daySize = await page.locator('[class*="days"] small').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    assert.ok(bodySize >= 15 && daySize >= 15, `Small scheduling text at ${width}: ${bodySize}/${daySize}`);
    if (process.env.QA_ARTIFACT_DIR) await page.screenshot({ path: `${process.env.QA_ARTIFACT_DIR}/penjadwalan-${width}.png`, fullPage: true });
    if (width === 390) {
      const row = page.getByRole('navigation', { name: 'Hari produksi' }).getByRole('button').first();
      const action = row.locator('[class*="detailLink"]');
      assert.match(await action.innerText(), /Lihat detail/);
      const presentation = await action.evaluate(el => {
        const style = getComputedStyle(el);
        return { height: el.getBoundingClientRect().height, border: style.borderStyle, color: style.color, background: style.backgroundColor };
      });
      assert.ok(presentation.height >= 44 && presentation.border !== 'none' && presentation.background !== 'rgba(0, 0, 0, 0)',
        `Detail action lacks visible button treatment: ${JSON.stringify(presentation)}`);
      await action.click();
      await page.getByRole('button', { name: 'Kembali ke kalender' }).waitFor();
      await page.getByRole('button', { name: 'Kembali ke kalender' }).click();
      await row.focus();
      await page.keyboard.press('Enter');
      await page.getByRole('button', { name: 'Kembali ke kalender' }).waitFor();
      await page.getByRole('button', { name: 'Kembali ke kalender' }).click();
    }
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
    assert.ok(font >= 15, `Scheduling table text too small: ${font}`);
  }
  const smallText = page.locator('dialog p.small').first();
  if (await smallText.count()) {
    const font = await smallText.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    assert.ok(font >= 15, `Scheduling dialog helper text too small: ${font}`);
  }
  await page.setViewportSize({ width: 390, height: 500 });
  await page.goto(`${root}/penjadwalan`);
  await page.addStyleTag({ content: 'nextjs-portal { pointer-events: none !important; }' });
  await page.getByRole('button', { name: 'Tanggal penjadwalan' }).click();
  await page.getByRole('dialog', { name: 'Tanggal penjadwalan' }).getByRole('button', { name: 'Hari ini' }).click();
  assert.equal(await page.getByRole('button', { name: 'Tanggal penjadwalan' }).getAttribute('aria-expanded'), 'false');
  console.log('PASS: week slider and today inside date dropdown, week/calendar synchronization, responsive layout, proposal count and table typography');
} finally { await browser.close(); }
