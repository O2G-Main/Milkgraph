import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.env.BASE_URL ?? 'http://127.0.0.1:3100';
const output = process.env.QA_ARTIFACT_DIR ?? path.join(process.env.TMPDIR, 'milkgraph-typography-qa');
const routes = process.env.QA_LOGIN_ONLY ? [] : (process.env.QA_ROUTES ?? '/,/simulasi,/kedatangan,/receiving,/lab,/penjadwalan,/qc-produk,/produksi,/alat,/produk,/aturan-produksi,/rencana/alur,/rencana/upgrade,/rencana,/riwayat-produksi,/graph,/hold,/transfer,/sumber-data,/pengguna,/role-akses,/tangki,/filling,/pasokan,/constraint,/persetujuan,/trace,/master-data').split(',');
const widths = (process.env.QA_WIDTHS ?? '320,390,768,1440,1600').split(',').map(Number);
const dataMode = process.env.QA_FIXTURES ? 'synthetic-ui-fixtures' : process.env.QA_DEMO ? 'demo' : 'live-api-get-only';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? '/usr/bin/chromium-browser', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 1440, height: 1000 } });
const report = [];
const loginChecks = [];
const failures = [];
const runtimeErrors = [];
const responses = new Map();
// Deliberately synthetic UI fixtures, never a substitute for live API verification.
const catalogFixture = {
  products: [{ sku_id: 'QA-TYPE', product_name: 'Produk uji tipografi', product_family: 'UHT', flavour: 'Original' }],
  pack_size_codes: [{ pack_size_code: '1L', description: 'Kemasan uji', exact_size_ml: 1000 }],
  product_pack_sizes: [{ sku_id: 'QA-TYPE', pack_size_code: '1L' }],
  product_market_variants: [{ sku_id: 'QA-TYPE', market_variant: 'Lokal' }],
  finished_skus: [{ finished_sku_id: 'QA-TYPE-1L', liquid_sku_id: 'QA-TYPE', pack_size_code: '1L', market_variant: 'Lokal' }],
};
page.on('pageerror', error => runtimeErrors.push(error.message));
page.setDefaultTimeout(30000);
await mkdir(output, { recursive: true });
const presentation = element => {
  const css = getComputedStyle(element);
  return Object.fromEntries(['fontFamily', 'fontSize', 'fontWeight', 'backgroundColor', 'color', 'borderRadius', 'paddingLeft', 'paddingRight', 'minHeight', 'boxShadow'].map(key => [key, css[key]]));
};
try {
  // Login changes only the local browser role; no operational write may leave this test.
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      if (process.env.QA_FIXTURES) {
        const url = new URL(request.url());
        const pathname = url.pathname.replace('/api/v1', '');
        const data = pathname === '/production/products' ? catalogFixture
          : pathname === '/session' ? { role: 'superadmin', permissions: ['plan.decide', 'downtime.record', 'constraint.edit'] }
          : pathname === '/trace/history' ? { groups: [] }
          : pathname === '/production/daily' ? { production_date: url.searchParams.get('date'), batches: [] }
          : pathname === '/production/assets' ? { count: 1, items: [{ asset_id: 'QA-01', asset_name: 'Alat uji', asset_type: 'Penyimpanan', current_status: null, current_status_reason: null, current_status_observed_at: null }] }
          : pathname === '/master/assets' ? [{ asset_id: 'QA-01', capacity_l: '1000' }]
          : pathname.startsWith('/production/') || pathname.startsWith('/planning/') ? { count: 0, items: [] }
          : pathname === '/limits' ? {}
          : ['/notifications', '/decisions', '/holds', '/audit', '/data-sources', '/limits/schema', '/downtime-events', '/plans'].includes(pathname) ? []
          : null;
        return route.fulfill({ status: data === null ? 404 : 200, json: data ?? { error: { code: 'QA_NO_FIXTURE', message: 'No UI fixture for this endpoint.' } } });
      }
      if (new URL(request.url()).pathname.endsWith('/events')) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': typography QA does not test SSE\n\n' });
      const key = `${request.headers()['x-demo-role'] ?? ''}:${request.url()}`;
      let response = responses.get(key);
      if (!response) {
        const live = await route.fetch();
        response = { status: live.status(), headers: live.headers(), body: await live.body() };
        responses.set(key, response);
      }
      return route.fulfill(response);
    }
    if (request.method() === 'OPTIONS') return route.continue();
    return route.fulfill({ status: request.url().endsWith('/session/role') ? 200 : 403, json: {} });
  });
  await page.goto(`${root}/login`);
  await page.evaluate(() => document.fonts.ready);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 });
    const metrics = await page.evaluate(() => ({ width: innerWidth, pageWidth: document.documentElement.scrollWidth, font: getComputedStyle(document.body).fontFamily }));
    assert.equal(metrics.pageWidth, width, 'Login must not overflow');
    assert.match(metrics.font, /Onest/i);
    await page.screenshot({ path: path.join(output, `login-${width}.png`), fullPage: true });
    loginChecks.push(metrics);
  }
  await writeFile(path.join(output, 'login-report.json'), JSON.stringify(loginChecks, null, 2));
  await page.getByRole('button', { name: 'Email', exact: true }).click();
  await page.getByRole('option').filter({ hasText: process.env.QA_ACCOUNT ?? 'bagas.wicaksono@milkgraph.id' }).click();
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.waitForURL(`${root}/`);
  await page.goto(`${root}/produk`);
  const referenceButton = page.getByRole('button', { name: /^Lihat detail / }).first();
  await page.evaluate(() => document.fonts.ready);
  let reference = null;
  if (!process.env.QA_DEMO) {
    await referenceButton.waitFor();
    reference = await referenceButton.evaluate(presentation);
    assert.equal(reference.fontSize, '15px');
    assert.match(reference.fontFamily, /Onest/i);
  }
  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 768 ? 812 : 1000 });
    for (const route of routes) {
      const errors = [];
      try {
        const response = await page.goto(root + route);
        assert.equal(response.status(), 200);
        await page.getByRole('heading', { level: 1 }).waitFor();
        await page.evaluate(() => document.fonts.ready);
        await page.waitForLoadState('networkidle');
        const metrics = await page.evaluate(() => {
          const visible = element => element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0;
          const nodes = selector => [...document.querySelectorAll(selector)].filter(visible);
          const exposed = element => {
            for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
              if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(parent).overflowX) && parent.getBoundingClientRect().right <= innerWidth) return false;
            }
            return true;
          };
          return {
            viewport: innerWidth,
            pageWidth: document.documentElement.scrollWidth,
            overflow: nodes('body *').filter(el => el.getBoundingClientRect().right > innerWidth + 1 && exposed(el)).slice(0, 30).map(el => ({ tag: el.tagName, className: el.className, width: el.getBoundingClientRect().width, right: el.getBoundingClientRect().right, text: el.textContent.slice(0, 80) })),
            font: getComputedStyle(document.body).fontFamily,
            subtitles: nodes('.page-heading p, .section-heading p').map(el => ({ text: el.textContent.slice(0, 65), size: getComputedStyle(el).fontSize })),
            tables: nodes('main table').map(el => ({ className: el.className, size: getComputedStyle(el).fontSize })),
            headers: nodes('main th').map(el => ({ text: el.textContent.slice(0, 40), size: getComputedStyle(el).fontSize })),
            cells: nodes('main td:not(.mono):not(.table-action):not(.access-group td)').filter(el => [...el.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim())).map(el => ({ text: el.textContent.slice(0, 40), size: getComputedStyle(el).fontSize })),
            actions: nodes('main .text-link').map(el => ({ text: el.textContent.slice(0, 45), size: getComputedStyle(el).fontSize, height: el.getBoundingClientRect().height })),
          };
        });
        if (metrics.pageWidth > width) errors.push(`page overflow ${metrics.pageWidth}/${width}`);
        if (!/Onest/i.test(metrics.font)) errors.push(`body font ${metrics.font}`);
        for (const text of metrics.subtitles) if (text.size !== '14px') errors.push(`subtitle ${text.size}: ${text.text}`);
        for (const table of metrics.tables) if (table.size !== '16px') errors.push(`table ${table.size}: ${table.className}`);
        for (const header of metrics.headers) if (header.size !== '16px') errors.push(`header ${header.size}: ${header.text}`);
        for (const cell of metrics.cells) if (cell.size !== '16px') errors.push(`cell ${cell.size}: ${cell.text}`);
        for (const action of metrics.actions) if (action.size !== '15px' || action.height < 44) errors.push(`action ${action.size}/${action.height}: ${action.text}`);
        if ([320, 390, 1440].includes(width) || errors.length) await page.screenshot({ path: path.join(output, `${route === '/' ? 'beranda' : route.slice(1).replaceAll('/', '-')}-${width}.png`), fullPage: true });
        if (route === '/produk' && !process.env.QA_DEMO) {
          await page.getByRole('button', { name: /^Lihat detail / }).first().click();
          await page.getByRole('dialog').waitFor();
          await page.keyboard.press('Escape');
          assert.equal(await page.getByRole('dialog').count(), 0);
        }
        if (route === '/alat') assert.equal(await page.getByRole('button', { name: 'Pengaturan', exact: true }).count(), 1, 'Pengaturan must stay on Alat');
        if (route === '/penjadwalan' && !process.env.QA_DEMO) {
          const row = page.getByRole('navigation', { name: 'Hari produksi' }).getByRole('button').first();
          const cue = row.getByText('Lihat detail', { exact: true });
          const actual = await cue.evaluate(presentation);
          for (const key of ['fontFamily', 'fontSize', 'fontWeight', 'backgroundColor', 'color', 'borderRadius', 'minHeight', 'boxShadow']) assert.equal(actual[key], reference[key], `weekly detail ${key}`);
          assert.equal(actual.paddingLeft, width < 768 ? '18px' : reference.paddingLeft);
          assert.equal(await row.locator('button').count(), 0, 'No nested buttons');
          await row.focus();
          await page.keyboard.press('Enter');
          await page.getByRole('heading', { name: /^Produksi /, level: 2 }).waitFor();
          await page.getByRole('button', { name: 'Kembali ke kalender' }).click();
          await page.getByRole('navigation', { name: 'Hari produksi' }).waitFor();
          await page.getByRole('button', { name: 'Lihat target & alokasi' }).click();
          await page.getByRole('dialog', { name: 'Target & alokasi mingguan' }).waitFor();
          await page.keyboard.press('Escape');
          assert.equal(await page.getByRole('dialog').count(), 0);
        }
        report.push({ route, width, metrics, errors });
      } catch (error) { errors.push(error.message); report.push({ route, width, errors }); }
      if (errors.length) failures.push({ route, width, errors });
      await writeFile(path.join(output, 'report.json'), JSON.stringify({ dataMode, reference, loginChecks, report, failures, runtimeErrors }, null, 2));
      console.log(`${errors.length ? 'FAIL' : 'PASS'} ${route} ${width}px${errors.length ? ': ' + errors.join('; ') : ''}`);
    }
  }
  assert.deepEqual(failures, []);
  assert.deepEqual(runtimeErrors, []);
  console.log(`PASS: ${report.length} route/viewport and ${loginChecks.length} login checks; no runtime errors. ${process.env.QA_FIXTURES ? 'SYNTHETIC UI FIXTURES; not live API data. ' : ''}Report: ${output}/report.json`);
} finally { await browser.close(); }
