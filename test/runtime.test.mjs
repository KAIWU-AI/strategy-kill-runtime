import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const source = new URL('../vendor/strategy-kill/', import.meta.url);
const original = JSON.parse(readFileSync(new URL('manifest.json', source)));

test('public API returns all 842 original runtime assets including pnpm and source', async () => {
  const { runtimeManifest, readRuntimeAsset } = await import('../index.js');
  assert.deepEqual(runtimeManifest, original);
  assert.equal(runtimeManifest.files.length, 842);
  assert.equal(runtimeManifest.files.filter(f => f.path.startsWith('src/')).length, 431);
  assert.ok(runtimeManifest.files.some(f => f.path.includes('node_modules/.pnpm/')));
  assert.ok(runtimeManifest.files.some(f => f.path === 'source.tar.gz'));
  for (const file of runtimeManifest.files) {
    const bytes = readRuntimeAsset(file.path);
    assert.deepEqual(bytes, readFileSync(new URL(`runtime/${file.path}`, source)), file.path);
    assert.equal(bytes.length, file.byteLength, file.path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
  }
});
