import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { atomicWrite } from '../../vendor/dsh-undo-savepoint/lib/atomic.mjs';
import { createZip, readZipBuffer, writeZip, readZip } from '../../vendor/dsh-undo-savepoint/lib/zip.mjs';

const root = await fs.mkdtemp(join(tmpdir(), 'dsh-archive-safety-'));
process.env.DSH_UNDO_ROOT = join(root, 'legacy');
process.env.DSH_UNDO_EXPORT = join(root, 'exports');
const core = await import('../../vendor/dsh-undo-savepoint/lib/core.mjs');
const cfg = { manualDir: join(root, 'manual'), autoDir: join(root, 'auto') };

test('ZIP buffer and file APIs preserve the existing archive format', async () => {
  const files = [{ name: 'manual/20261019-000000-abcd/manifest.json', data: Buffer.from('{"kind":"manual"}') },
    { name: 'manual/20261019-000000-abcd/home-settings.yaml', data: Buffer.from('secret fixture') }];
  assert.deepEqual(readZipBuffer(createZip(files)), files);
  const path = join(root, 'compat.zip');
  await writeZip(path, files);
  assert.deepEqual(await readZip(path), files);
});

test('concurrent atomic publishers produce complete files and failed rename retains old bytes', async () => {
  const file = join(root, 'atomic.json');
  const values = Array.from({ length: 20 }, (_, i) => JSON.stringify({ i, text: 'x'.repeat(1000 * (i + 1)) }));
  await Promise.all(values.map(value => atomicWrite(file, value)));
  assert.ok(values.includes(await fs.readFile(file, 'utf8')));
  const original = fs.rename;
  fs.rename = async () => { throw new Error('injected publish failure'); };
  const old = await fs.readFile(file);
  try { await assert.rejects(atomicWrite(file, 'replacement'), /injected/); }
  finally { fs.rename = original; }
  assert.deepEqual(await fs.readFile(file), old);
  assert.equal((await fs.readdir(root)).some(name => name.endsWith('.tmp')), false);
});

test('encrypted exports never write a plaintext ZIP and imports create no decrypted file', async () => {
  const id = '20261019-000000-abcd';
  await fs.mkdir(join(cfg.manualDir, id), { recursive: true });
  await fs.writeFile(join(cfg.manualDir, id, 'manifest.json'), JSON.stringify({ id, kind: 'manual', files: [] }));
  await fs.writeFile(join(cfg.manualDir, id, 'home-settings.yaml'), 'secret fixture');
  const original = fs.open;
  const publishedBytes = [];
  fs.open = async (...args) => {
    const handle = await original(...args);
    if (String(args[0]).startsWith(core.EXPORT_ROOT) && args[1] === 'wx') {
      const write = handle.writeFile.bind(handle);
      handle.writeFile = async (bytes, ...options) => { publishedBytes.push(Buffer.from(bytes)); return write(bytes, ...options); };
    }
    return handle;
  };
  let result;
  try { result = await core.exportSnapshots(cfg, 'fixture password'); }
  finally { fs.open = original; }
  assert.equal(result.ok, true);
  assert.equal(result.encrypted, true);
  assert.equal(publishedBytes.length, 1);
  assert.equal(core.isEncryptedExport(publishedBytes[0]), true);
  const destination = { manualDir: join(root, 'import-manual'), autoDir: join(root, 'import-auto') };
  const imported = await core.importSnapshots(destination, result.path, 'fixture password');
  assert.equal(imported.ok, true);
  assert.equal(imported.imported, 1);
  assert.equal(await fs.readFile(join(destination.manualDir, id, 'home-settings.yaml'), 'utf8'), 'secret fixture');
  assert.equal((await fs.readdir(core.EXPORT_ROOT)).some(name => name.includes('.dec') || name.endsWith('.tmp')), false);
  assert.equal((await core.importSnapshots(destination, result.path, 'wrong')).code, 'bad-password');
});

test.after(async () => { await fs.rm(root, { recursive: true, force: true }); });
