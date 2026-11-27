import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('navigation separates Master Produk and Alat, retaining the old master-data entry as an alias', () => {
  const nav = read('lib/nav.ts');
  assert.ok(nav.includes('"/master-data"'), 'nav missing /master-data route');
  assert.ok(nav.includes('"Master Produk"'), 'nav missing Master Produk label');
  assert.ok(nav.includes('href: "/produk"'));
  assert.ok(nav.includes('label: "Alat", href: "/alat"'));
  assert.ok(!nav.includes('label: "Master Alat"'));
});

test('sidebar groups production, equipment and products under Master without moving operational routes', () => {
  const nav = read('lib/nav.ts');
  const operational = nav.match(/\{ label: "Operasional"[^\n]+/s)?.[0] ?? '';
  const master = nav.match(/\{ label: "Master"[^\n]+/s)?.[0] ?? '';
  for (const href of ['/penjadwalan', '/kondisi-pabrik', '/qc-produk']) assert.ok(operational.includes(`href: "${href}"`), href);
  for (const href of ['/produksi', '/alat', '/produk']) {
    assert.ok(master.includes(`href: "${href}"`), `Master missing ${href}`);
    assert.ok(!operational.includes(`href: "${href}"`), `Operasional still contains ${href}`);
  }
});

test('old master-data page directs users to domain pages and keeps only the actual dataset summary', () => {
  // Master data is distributed by domain rather than kept in a combined editor.
  assert.match(read('app/master-data/page.tsx'), /MasterDirectory/);
  const comp = read('components/master-data/master-directory.tsx');
  for (const path of ['/master', '/produk', '/alat', '/produksi', '/aturan-produksi']) assert.ok(comp.includes(`"${path}"`));
  assert.match(comp, /numericalPlanningReady/);
  assert.doesNotMatch(comp, /validationStatus:\s*"VALID"/);
  assert.match(read('components/produksi/plant-topology.tsx'), /"\/master\/topology"/);
  assert.match(read('components/produksi/production-lines.tsx'), /"\/master\/lines"/);
});
