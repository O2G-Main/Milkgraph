import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const root = process.env.BASE_URL ?? 'http://127.0.0.1:3100';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? '/usr/bin/chromium-browser', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const asset = { asset_id: 'QA-01', asset_name: 'Alat uji', asset_type: 'Penyimpanan', current_status: null, current_status_reason: null, current_status_observed_at: null };
let catalog = [asset];
let permissions = ['downtime.record', 'constraint.edit'];
const writes = [];
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.setDefaultTimeout(20000);
await page.route('**/api/v1/**', route => {
  const req = route.request();
  const { pathname } = new URL(req.url());
  if (req.method() !== 'GET') {
    writes.push(`${req.method()} ${pathname}`);
    return route.fulfill({ status: pathname.endsWith('/session/role') ? 200 : 403, json: {} });
  }
  const data = pathname.endsWith('/session') ? { role: 'superadmin', permissions }
    : pathname.endsWith('/production/assets') ? { count: catalog.length, items: catalog }
    : pathname.endsWith('/master/assets') ? [{ asset_id: 'QA-01', capacity_l: '1000' }]
    : pathname.endsWith('/master/lines') ? { dedications: [{ line_id: 'LN-01', source_aseptic_tank_id: 'AT-01', allowed_sku_ids: 'SKU-01', pack_size_codes: '1L', speed_packph: '800' }], finishedCompatibility: [{ line_id: 'LN-01', finished_sku_id: 'F-01', liquid_sku_id: 'SKU-01', pack_size_code: '1L', market_variant: 'Lokal', eligible: 'Y' }], productCompatibility: [] }
    : pathname.endsWith('/limits') ? { maxTransfer: 8000, tankMax: 90, cipBuffer: 10, changeoverMax: 2 }
    : pathname.endsWith('/limits/schema') ? [{ params: [
      { key: 'maxTransfer', kind: 'range', min: 7000, max: 12000, step: 100 },
      { key: 'tankMax', kind: 'range', min: 85, max: 100, step: 1 },
      { key: 'cipBuffer', kind: 'range', min: 0, max: 30, step: 5 },
      { key: 'changeoverMax', kind: 'range', min: 0, max: 4, step: 1 },
    ] }]
    : pathname.endsWith('/downtime-events') || pathname.endsWith('/notifications') ? []
    : pathname.endsWith('/maintenance/recommendation') ? null
    : pathname.endsWith('/downtime-events/prediction') ? { resource_id: 'QA-01', alert: 'INSUFFICIENT_DATA', predicted_next: null, days_remaining: null, events_count: 0, avg_interval_days: null, basis: 'insufficient_data', last_event_at: null }
    : pathname.endsWith('/plans/current/instructions') || pathname.endsWith('/decisions') || pathname.endsWith('/holds') || pathname.endsWith('/lab/results') || pathname.endsWith('/audit') ? []
    : { items: [], batches: [], count: 0 };
  return route.fulfill({ status: pathname.endsWith('/maintenance/recommendation') ? 404 : 200, json: data });
});
try {
  await page.goto(`${root}/login`);
  await page.getByRole('button', { name: 'Email', exact: true }).click();
  await page.getByRole('option').filter({ hasText: 'bagas.wicaksono@milkgraph.id' }).click();
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.waitForURL(`${root}/`);

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 812 });
    await page.goto(`${root}/alat`);
    await page.addStyleTag({ content: 'nextjs-portal { pointer-events: none !important; }' });
    const row = page.locator('.asset-table tbody tr').filter({ hasText: 'QA-01' });
    await row.waitFor();
    assert.equal(await page.getByRole('button', { name: 'Pengaturan', exact: true }).count(), 0, 'Global settings tab must leave Alat');
    await page.getByRole('heading', { name: 'Perkiraan gangguan dan waktu perawatan' }).waitFor();
    await page.getByText('Data belum cukup', { exact: true }).waitFor();
    const action = row.getByRole('button', { name: 'Catat status QA-01' });
    const dimensions = await action.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return { width: rect.width, height: rect.height, text: parseFloat(getComputedStyle(el).fontSize) };
    });
    assert.ok(dimensions.height >= 44 && dimensions.text >= 15, `Status action at ${width}: ${JSON.stringify(dimensions)}`);
    const textSizes = await page.locator('.equipment-page .asset-table tbody td, .equipment-page .asset-table .table-sub, .equipment-page .asset-table .badge, .equipment-page .asset-table th').evaluateAll(els => els.map(el => parseFloat(getComputedStyle(el).fontSize)));
    assert.ok(textSizes.every(size => size >= 14), `Small equipment text at ${width}: ${textSizes.join(',')}`);
    const overflow = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth,
      elements: [...document.querySelectorAll('.equipment-page *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 12).map(el => `${el.tagName}.${el.className}: ${Math.round(el.getBoundingClientRect().right)}`) }));
    assert.equal(overflow.width > overflow.viewport, false, `Page overflows at ${width}: ${JSON.stringify(overflow)}`);
    if (process.env.QA_ARTIFACT_DIR) await page.screenshot({ path: `${process.env.QA_ARTIFACT_DIR}/alat-${width}.png`, fullPage: true });
    await action.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: /Catat status QA-01/ });
    await dialog.waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await dialog.count(), 0);
    assert.equal(await action.evaluate(el => document.activeElement === el), true);
    await action.click();
    await dialog.getByRole('button', { name: 'Simpan status' }).click();
    await dialog.getByRole('alert').waitFor();
    await dialog.getByRole('button', { name: 'Tutup', exact: true }).click();
  }
  assert.deepEqual(writes.filter(item => !item.endsWith('/session/role')), [], 'QA may not send any operational write');
  await page.goto(`${root}/produksi`);
  await page.getByRole('button', { name: 'Pengaturan produksi', exact: true }).click();
  await page.getByRole('heading', { name: 'Batas operasional' }).waitFor();
  assert.equal(await page.getByText('Laju transfer maksimum (L/jam)').count(), 1);
  await page.goto(`${root}/alat`);
  await page.getByRole('button', { name: 'Konfigurasi lini', exact: true }).click();
  await page.getByRole('heading', { name: 'Kecocokan produk dan lini' }).waitFor();
  assert.equal(await page.getByText('F-01').count(), 1);
  await page.goto(`${root}/alat`);
  await page.getByRole('searchbox').fill('tidak-ada');
  await page.getByText('Tidak ada alat yang cocok dengan pencarian atau filter.').waitFor();
  permissions = [];
  await page.reload();
  assert.equal(await page.getByRole('button', { name: 'Catat status QA-01' }).count(), 0, 'Read-only session must hide writing action');
  permissions = ['downtime.record', 'constraint.edit'];
  catalog = [];
  await page.reload();
  await page.getByText(/Belum ada alat/).first().waitFor();
  assert.deepEqual(errors, [], `Browser errors: ${errors.join('; ')}`);
  console.log('PASS: Alat copy, typography, row status control, keyboard, modal, empty state and settings moved to Produksi; all operational writes blocked');
} finally { await browser.close(); }
