import { lstatSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadManifest, manifestIntegrity } from '../lib/manifest.js';
import { readVerified } from '../lib/read-verified.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = join(root, 'vendor/strategy-kill');
const destination = join(root, 'data');
const manifest = loadManifest(source);
const manifestBytes = readVerified(source, 'manifest.json', manifestIntegrity);

function inventory(root, prefix = '') {
  if (!lstatSync(root).isDirectory()) throw new Error('Expected an unlinked directory');
  const files = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    const relative = prefix + name;
    const stat = lstatSync(path);
    if (stat.isDirectory()) files.push(...inventory(path, `${relative}/`));
    else if (stat.isFile()) files.push(relative);
    else throw new Error('Unsupported filesystem entry');
  }
  return files.sort();
}

function assertInventory(actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) throw new Error('Unexpected file inventory');
}

assertInventory(inventory(join(source, 'runtime')), manifest.files.map(file => file.path));
const blobs = new Map();
for (const file of manifest.files) {
  blobs.set(file.sha256, { file, bytes: readVerified(source, `runtime/${file.path}`, file) });
}

let existing;
try { existing = lstatSync(destination); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (existing) {
  if (!existing.isDirectory()) throw new Error('Refusing non-directory output');
  assertInventory(inventory(destination), ['manifest.json', ...[...blobs.keys()].map(hash => `blobs/${hash}`)]);
  loadManifest(destination);
  for (const [hash, { file }] of blobs) readVerified(destination, `blobs/${hash}`, file);
  console.log(`Verified existing ${manifest.files.length} runtime assets; no files changed`);
} else {
  // Build only in the trusted checkout, never into caller-supplied destinations.
  const temporary = mkdtempSync(join(root, '.data-build-'));
  try {
    mkdirSync(join(temporary, 'blobs'));
    for (const [hash, { bytes }] of blobs) writeFileSync(join(temporary, 'blobs', hash), bytes, { flag: 'wx' });
    writeFileSync(join(temporary, 'manifest.json'), manifestBytes, { flag: 'wx' });
    renameSync(temporary, destination);
    console.log(`Built ${manifest.files.length} runtime assets (${blobs.size} unique blobs)`);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
