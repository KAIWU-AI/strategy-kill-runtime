import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(process.argv[2] || join(tmpdir(), 'strategy-kill-pack'));
mkdirSync(output, { recursive: true });
const run = (command, args, cwd = root) => execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
console.log(run('npm', ['run', 'build']).trim());
const [pack] = JSON.parse(run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', output]));
const tarball = join(output, pack.filename);
const config = JSON.parse(readFileSync(join(root, 'package.json')));
assert.equal(config.name, '@kaiwu-ai/strategy-kill-runtime');
assert.equal(config.version, '0.1.0');
assert.equal(config.license, 'GPL-3.0-only');
assert.equal(Object.keys(config.dependencies || {}).length, 0);
for (const hook of ['preinstall', 'install', 'postinstall', 'prepare', 'prepack', 'postpack']) assert.equal(config.scripts[hook], undefined);

function walk(path, prefix) {
  const stat = lstatSync(path);
  assert.equal(stat.isSymbolicLink(), false, prefix);
  if (stat.isDirectory()) return readdirSync(path).flatMap(name => walk(join(path, name), `${prefix}/${name}`));
  assert.ok(stat.isFile(), prefix);
  return [prefix];
}
const expected = new Set(['package.json', ...config.files.flatMap(path => walk(join(root, path), path.replace(/\/$/, '')))]);
const actual = pack.files.map(file => file.path).sort();
assert.deepEqual(actual, [...expected].sort());
assert.ok(actual.every(path => !path.includes('node_modules') && !path.includes('..') && !path.startsWith('/')));

const clean = mkdtempSync(join(tmpdir(), 'strategy-kill-install-'));
let result;
try {
  writeFileSync(join(clean, 'package.json'), JSON.stringify({ name: 'runtime-install-acceptance', version: '1.0.0', private: true, type: 'module' }));
  const installation = run('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', tarball], clean);
  console.log(installation.trim());
  const installed = join(clean, 'node_modules/@kaiwu-ai/strategy-kill-runtime');
  for (const path of actual) {
    assert.deepEqual(readFileSync(join(installed, path)), readFileSync(join(root, path)), path);
  }
  const check = `
    import assert from 'node:assert/strict';
    import { readFileSync } from 'node:fs';
    import { join } from 'node:path';
    import { createHash } from 'node:crypto';
    import { runtimeManifest, readRuntimeAsset } from '@kaiwu-ai/strategy-kill-runtime';
    const source = process.argv[1];
    const manifest = JSON.parse(readFileSync(join(source, 'manifest.json')));
    assert.deepEqual(runtimeManifest, manifest);
    assert.ok(Object.isFrozen(runtimeManifest) && Object.isFrozen(runtimeManifest.files));
    assert.equal(runtimeManifest.files.length, 842);
    let bytes = 0;
    for (const file of manifest.files) {
      const content = readRuntimeAsset(file.path);
      assert.deepEqual(content, readFileSync(join(source, 'runtime', file.path)), file.path);
      assert.equal(content.length, file.byteLength);
      assert.equal(createHash('sha256').update(content).digest('hex'), file.sha256);
      bytes += content.length;
    }
    for (const path of ['../LICENSE', '/sandbox.html', 'host.html', '__proto__', 'sandbox.html?x']) assert.throws(() => readRuntimeAsset(path));
    console.log(JSON.stringify({ runtimeFiles: manifest.files.length, readableSourceFiles: manifest.files.filter(f => f.path.startsWith('src/')).length, runtimeBytes: bytes }));
  `;
  result = JSON.parse(run(process.execPath, ['--input-type=module', '--eval', check, join(root, 'vendor/strategy-kill')], clean));
} finally {
  rmSync(clean, { recursive: true, force: true });
}
const report = {
  package: `${config.name}@${config.version}`, tarball,
  sha256: createHash('sha256').update(readFileSync(tarball)).digest('hex'),
  archiveBytes: lstatSync(tarball).size,
  packedFiles: actual.length,
  ...result,
  cleanOfflineInstall: true, installScriptsDisabled: true,
  exactPublishedInventory: true, allInstalledFilesByteIdentical: true,
  node: process.version,
};
writeFileSync(join(output, 'pack-metadata.json'), JSON.stringify(pack, null, 2) + '\n');
writeFileSync(join(output, 'pack-verification.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
