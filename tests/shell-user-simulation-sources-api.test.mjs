import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../components/${path}`, import.meta.url), 'utf8');

test('shell and Manajemen akun resolve backend resources in API mode', () => {
  const shell = read('shell/app-shell.tsx'), user = read('pengguna/pengguna.tsx');
  for (const path of ['/meta', '/session', '/notifications'])
    assert.ok(shell.includes(`"${path}"`), `shell missing ${path}`);
  assert.match(shell, /<LiveClock \/>/);
  assert.doesNotMatch(shell, /"\/shifts"/);
  assert.match(shell, /logout\(\)/);
  assert.match(shell, /await resetDemo\(/);
  assert.match(user, /<UserList/);
  assert.match(user, /<PicList/);
  assert.match(user, /useResource/);
  assert.match(user, /"\/users"/);
  assert.doesNotMatch(user, /setRole\(/, "ganti akun lewat login, bukan dari halaman Pengguna");
});

test('3D loads layout, view status, bottlenecks and production without mock fallback', () => {
  const scene = read('simulasi/plant-scene.tsx'), simulation = read('simulasi/simulasi.tsx');
  for (const path of ['/site/layout', '/site/status?view=', '/site/bottlenecks?view=', '/production/fillers', '/production/aseptic-tanks', '/assets/mid-tanks'])
    assert.ok((scene + simulation).includes(path), `3D missing ${path}`);
  assert.match(scene, /API_MODE/);
  assert.match(simulation, /API_MODE/);
});

test('source connector actions await backend and expose failures', () => {
  const source = read('sumber-data/sumber-data.tsx');
  assert.match(source, /useResource.*"\/data-sources"/);
  assert.match(source, /apiSend/);
  assert.match(source, /await apiSend/);
  assert.match(source, /catch/);
});

test('evidence modal reads selected ID, timeline uses server time in API mode', () => {
  const ui = read('ui/index.tsx');
  assert.match(ui, /useResource.*`\/sources\/\$\{encodeURIComponent\(id\)\}`/);
  assert.match(ui, /useResource.*"\/meta"/);
  assert.match(ui, /API_MODE/);
});
