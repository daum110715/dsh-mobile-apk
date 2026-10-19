import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = await fs.mkdtemp(join(tmpdir(), 'dsh-metadata-safety-'));
process.env.DSH_UNDO_ROOT = join(root, 'legacy');
const { writeManifest, readManifest, listSnapshots, setSnapshotMeta, markFlag, appendRollbackLog } = await import('../../vendor/dsh-undo-savepoint/lib/core.mjs');
const cfg = { manualDir: join(root, 'manual'), autoDir: join(root, 'auto'), settingsFile: join(root, 'settings.json') };
const dir = join(cfg.manualDir, '20261019-000000-abcd');
const snap = { id: '20261019-000000-abcd', kind: 'manual', note: null, tags: [], files: [] };

test('different sized concurrent manifests publish only complete JSON, with BOM read compatibility', async () => {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(join(dir, 'manifest.json'), '\uFEFF' + JSON.stringify(snap));
  assert.equal((await readManifest(dir)).id, snap.id);
  await Promise.all(Array.from({ length: 20 }, (_, i) => writeManifest(dir, { ...snap, note: 'x'.repeat((i + 1) * 12000) })));
  assert.equal((await readManifest(dir)).id, snap.id);
  assert.equal((await listSnapshots(cfg)).length, 1);
});

test('concurrent note, tags and state flags preserve unrelated metadata', async () => {
  await writeManifest(dir, snap);
  await Promise.all([
    setSnapshotMeta(cfg, snap.id, { note: 'user note' }),
    setSnapshotMeta(cfg, snap.id, { tags: ['important'] }),
    markFlag({ ...snap, _dir: dir }, 'consumed', true),
    markFlag({ ...snap, _dir: dir }, 'stepped', true),
  ]);
  const result = await readManifest(dir);
  assert.equal(result.note, 'user note');
  assert.deepEqual(result.tags, ['important']);
  assert.equal(result.consumed, true);
  assert.equal(result.stepped, true);
});

test('concurrent rollback records retain all lines and failed replacement preserves old log', async () => {
  const file = join(root, 'rollback-log.jsonl');
  await fs.writeFile(file, JSON.stringify({ legacy: true }) + '\n');
  await Promise.all(Array.from({ length: 30 }, (_, i) => appendRollbackLog(cfg, { i })));
  const old = await fs.readFile(file, 'utf8');
  const lines = old.trim().split('\n').map(JSON.parse);
  assert.equal(lines.length, 31);
  assert.equal(lines[0].legacy, true);
  assert.equal(new Set(lines.slice(1).map(x => x.i)).size, 30);
  const original = fs.rename;
  fs.rename = async () => { throw new Error('injected log replacement failure'); };
  try { await appendRollbackLog(cfg, { i: 'failed' }); }
  finally { fs.rename = original; }
  assert.equal(await fs.readFile(file, 'utf8'), old);
});

test.after(async () => { await fs.rm(root, { recursive: true, force: true }); });
