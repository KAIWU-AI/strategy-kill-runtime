"""Refresh approved adapter files, corresponding source, and exact delivery manifest.

Run from any directory with Python 3. Source inputs live beside this script.
The upstream runtime must already be built and reviewed; never discovers new
upstream members. poc-integrity.json is the pinned original import inventory.
"""
from pathlib import Path
import gzip
import hashlib
import io
import json
import tarfile

ROOT = Path(__file__).resolve().parent
RUNTIME = ROOT / 'runtime'


def pack(files):
    archive = io.BytesIO()
    with tarfile.open(fileobj=archive, mode='w', format=tarfile.PAX_FORMAT) as tar:
        for name, data in sorted(files.items()):
            member = tarfile.TarInfo(name)
            member.size = len(data)
            member.mode = 0o644
            member.mtime = 0
            tar.addfile(member, io.BytesIO(data))
    return gzip.compress(archive.getvalue(), mtime=0)


def assemble():
    inventory = json.loads((ROOT / 'poc-integrity.json').read_text())
    adapter_names = ('preload.js', 'sandbox-boot.js', 'sandbox.html', 'approved-setup.json')
    for name, meta in inventory.items():
        if name in ('host.html', 'host.js') or name in adapter_names:
            continue
        data = (RUNTIME / name).read_bytes()
        if len(data) != meta['bytes'] or hashlib.sha256(data).hexdigest() != meta['sha256']:
            raise ValueError('Unapproved upstream runtime member: ' + name)
    for name in adapter_names:
        (RUNTIME / name).write_bytes((ROOT / 'adapter-source' / name).read_bytes())
    notices = []
    for path in sorted((ROOT / 'licenses').rglob('*')):
        if path.is_file() and path.name != 'manifest.json':
            notices.append('\n=== ' + path.relative_to(ROOT).as_posix() + ' ===\n' + path.read_text())
    notices.append('\n=== fake-indexeddb 6.2.4 ===\n' + (ROOT / 'fake-indexeddb-LICENSE.txt').read_text())
    (RUNTIME / 'THIRD-PARTY-NOTICES.txt').write_text('\n'.join(notices))
    (RUNTIME / 'LICENSE.txt').write_bytes((ROOT / 'LICENSE').read_bytes())
    sources = {}
    for name in ('upstream-source.tar.gz', 'source-manifest.json', 'poc-integrity.json', 'LICENSE', 'UPSTREAM-README.md', 'BUILD.txt', 'assemble.py', 'fake-indexeddb-LICENSE.txt'):
        sources[name] = (ROOT / name).read_bytes()
    for folder in ('adapter-source', 'licenses'):
        for path in (ROOT / folder).rglob('*'):
            if path.is_file():
                sources[path.relative_to(ROOT).as_posix()] = path.read_bytes()
    # The distributed fake-indexeddb ESM is its readable source, not a minified bundle.
    for path in (RUNTIME / 'vendor/fake-indexeddb-6.2.4').rglob('*.js'):
        sources[path.relative_to(RUNTIME).as_posix()] = path.read_bytes()
    (RUNTIME / 'source.tar.gz').write_bytes(pack(sources))
    paths = (set(inventory) - {'host.html', 'host.js'}) | {'source.tar.gz', 'LICENSE.txt', 'THIRD-PARTY-NOTICES.txt'}
    actual = {path.relative_to(RUNTIME).as_posix() for path in RUNTIME.rglob('*') if path.is_file()}
    if actual != paths:
        raise ValueError('Runtime inventory differs from approved members')
    files = []
    for name in sorted(paths):
        path = RUNTIME / name
        if path.is_symlink():
            raise ValueError('Runtime symlink: ' + name)
        data = path.read_bytes()
        files.append({'path': name, 'byteLength': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
    (ROOT / 'manifest.json').write_text(json.dumps({'version': 1, 'entry': 'sandbox.html', 'files': files}, indent=2) + '\n')
    print(json.dumps({'files': len(files), 'bytes': sum(f['byteLength'] for f in files)}))


if __name__ == '__main__':
    assemble()
