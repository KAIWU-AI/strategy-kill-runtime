import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'strategy-kill-build-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const path of ['package.json', 'scripts', 'lib', 'vendor']) cpSync(new URL(path, root), join(dir, path), { recursive: true });
  return { dir, vendor: join(dir, 'vendor/strategy-kill'), run: () => spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: dir, encoding: 'utf8' }) };
}

for (const mode of ['corrupt', 'symlink', 'unlisted', 'manifest']) {
  test(`build rejects ${mode} input without leaving partial output`, t => {
    const f = fixture(t);
    const path = join(f.vendor, 'runtime/sandbox.html');
    if (mode === 'corrupt') writeFileSync(path, 'corrupt');
    if (mode === 'symlink') {
      rmSync(path);
      symlinkSync(new URL('vendor/strategy-kill/runtime/sandbox.html', root), path);
    }
    if (mode === 'unlisted') writeFileSync(join(f.vendor, 'runtime/private.txt'), 'must not ship');
    if (mode === 'manifest') {
      const manifest = JSON.parse(readFileSync(join(f.vendor, 'manifest.json')));
      manifest.files[0].path = '../LICENSE';
      writeFileSync(join(f.vendor, 'manifest.json'), JSON.stringify(manifest));
    }
    assert.notEqual(f.run().status, 0);
    assert.equal(existsSync(join(f.dir, 'data')), false);
    assert.equal(readdirSync(f.dir).some(n => n.startsWith('.data-build-')), false);
  });
}

test('build refuses linked output and leaves its target untouched', t => {
  const f = fixture(t);
  const outside = join(f.dir, 'outside');
  mkdirSync(outside);
  symlinkSync(outside, join(f.dir, 'data'), 'dir');
  assert.notEqual(f.run().status, 0);
  assert.deepEqual(readdirSync(outside), []);
});

test('rebuild verifies existing output without replacing or repairing it', t => {
  const f = fixture(t);
  assert.equal(f.run().status, 0);
  assert.equal(f.run().status, 0);
  const path = join(f.dir, 'data/manifest.json');
  writeFileSync(path, 'keep damaged output for inspection');
  assert.notEqual(f.run().status, 0);
  assert.equal(readFileSync(path, 'utf8'), 'keep damaged output for inspection');
});
