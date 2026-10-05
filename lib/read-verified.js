import { constants, openSync, closeSync, fstatSync, lstatSync, readSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

// Only the pinned manifest and its SHA-named blobs call this internal helper.
export function readVerified(root, relativePath, expected) {
  const parts = relativePath.split('/');
  const directories = [];
  let path = resolve(root);
  for (const part of ['', ...parts.slice(0, -1)]) {
    if (part) path = join(path, part);
    const stat = lstatSync(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Invalid runtime directory');
    directories.push({ path, stat });
  }
  const target = join(path, parts.at(-1));
  const fd = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size !== expected.byteLength) throw new Error('Invalid runtime file');
    const bytes = Buffer.alloc(expected.byteLength);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(fd, bytes, offset, bytes.length - offset, offset);
      if (!count) throw new Error('Truncated runtime file');
      offset += count;
    }
    const current = lstatSync(target);
    if (!current.isFile() || current.dev !== stat.dev || current.ino !== stat.ino || fstatSync(fd).size !== expected.byteLength) {
      throw new Error('Runtime file changed');
    }
    for (const directory of directories) {
      const currentDirectory = lstatSync(directory.path);
      if (!currentDirectory.isDirectory() || currentDirectory.dev !== directory.stat.dev || currentDirectory.ino !== directory.stat.ino) {
        throw new Error('Runtime directory changed');
      }
    }
    if (createHash('sha256').update(bytes).digest('hex') !== expected.sha256) throw new Error('Runtime integrity mismatch');
    return bytes;
  } finally {
    closeSync(fd);
  }
}
