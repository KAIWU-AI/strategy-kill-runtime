import { readVerified } from './read-verified.js';

export const manifestIntegrity = Object.freeze({
  byteLength: 149099,
  sha256: 'bfdc293f7bba56c220059466e9df57b937cb2dc2af69254012bd376913744ffc',
});

export function loadManifest(root) {
  // This exact reviewed byte stream fixes schema, paths, sizes and digests.
  // Updating the upstream inventory requires changing this code pin in review.
  const bytes = readVerified(root, 'manifest.json', manifestIntegrity);
  const manifest = JSON.parse(bytes);
  for (const file of manifest.files) Object.freeze(file);
  Object.freeze(manifest.files);
  return Object.freeze(manifest);
}
