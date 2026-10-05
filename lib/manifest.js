import { readVerified } from './read-verified.js';

export const manifestIntegrity = Object.freeze({
  byteLength: 149099,
  sha256: 'd0a601a77a934d3c7a6f543091cee516ef7bf26a7a428e2fa597888cf6ac6231',
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
