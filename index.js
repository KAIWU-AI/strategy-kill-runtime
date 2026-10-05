import { fileURLToPath } from 'node:url';
import { loadManifest } from './lib/manifest.js';
import { readVerified } from './lib/read-verified.js';

const root = fileURLToPath(new URL('./data/', import.meta.url));
export const runtimeManifest = loadManifest(root);
const files = new Map(runtimeManifest.files.map(file => [file.path, file]));

export function readRuntimeAsset(path) {
  const file = files.get(path);
  if (!file) throw new Error('Unknown runtime asset');
  return readVerified(root, `blobs/${file.sha256}`, file);
}
