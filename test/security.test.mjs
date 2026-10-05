import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('data/manifest.json', root)));
const entry = manifest.files.find(file => file.path === manifest.entry);

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'strategy-kill-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'data/blobs'), { recursive: true });
  for (const path of ['package.json', 'index.js', 'data/manifest.json', `data/blobs/${entry.sha256}`]) {
    cpSync(new URL(path, root), join(dir, path));
  }
  if (existsSync(new URL('lib/', root))) cpSync(new URL('lib/', root), join(dir, 'lib'), { recursive: true });
  return { dir, blob: join(dir, 'data/blobs', entry.sha256), load: () => import(pathToFileURL(join(dir, 'index.js'))) };
}

test('manifest is deeply immutable and buffers are fresh', async () => {
  const { runtimeManifest, readRuntimeAsset } = await import('../index.js');
  assert.ok(Object.isFrozen(runtimeManifest));
  assert.ok(Object.isFrozen(runtimeManifest.files));
  assert.ok(runtimeManifest.files.every(Object.isFrozen));
  const before = readRuntimeAsset(entry.path);
  const changed = readRuntimeAsset(entry.path);
  changed.fill(0);
  assert.deepEqual(readRuntimeAsset(entry.path), before);
});

test('only exact whitelist paths are readable', async () => {
  const { readRuntimeAsset } = await import('../index.js');
  for (const path of ['../LICENSE', '/sandbox.html', './sandbox.html', 'foo/../sandbox.html', 'sandbox.html?x', 'sandbox.html#x', 'sandbox.html\0', 'sandbox.html/', 'src\\index.js', '%73andbox.html', '__proto__', '.env', 'host.html', '', null, {}, 1]) {
    assert.throws(() => readRuntimeAsset(path), undefined, String(path));
  }
});

test('changed manifest is rejected before use', async t => {
  const f = fixture(t);
  const altered = { ...manifest, entry: 'host.html' };
  writeFileSync(join(f.dir, 'data/manifest.json'), JSON.stringify(altered));
  await assert.rejects(f.load());
});

for (const mode of ['same-size corruption', 'truncation', 'growth', 'symlink', 'directory', 'missing']) {
  test(`asset rejects ${mode}`, async t => {
    const f = fixture(t);
    const { readRuntimeAsset } = await f.load();
    if (mode === 'same-size corruption') writeFileSync(f.blob, Buffer.alloc(entry.byteLength, 42));
    if (mode === 'truncation') writeFileSync(f.blob, Buffer.alloc(entry.byteLength - 1));
    if (mode === 'growth') writeFileSync(f.blob, Buffer.alloc(entry.byteLength + 1));
    if (['symlink', 'directory', 'missing'].includes(mode)) rmSync(f.blob);
    if (mode === 'directory') mkdirSync(f.blob);
    if (mode === 'symlink') symlinkSync(new URL(`data/blobs/${entry.sha256}`, root), f.blob);
    assert.throws(() => readRuntimeAsset(entry.path));
  });
}

for (const name of ['data', 'data/blobs']) {
  test(`reject linked ${name} directory`, async t => {
    const f = fixture(t);
    rmSync(join(f.dir, name), { recursive: true });
    symlinkSync(new URL(`${name}/`, root), join(f.dir, name), 'dir');
    await assert.rejects(async () => (await f.load()).readRuntimeAsset(entry.path));
  });
}

test('reject linked manifest', async t => {
  const f = fixture(t);
  rmSync(join(f.dir, 'data/manifest.json'));
  symlinkSync(new URL('data/manifest.json', root), join(f.dir, 'data/manifest.json'));
  await assert.rejects(f.load());
});
