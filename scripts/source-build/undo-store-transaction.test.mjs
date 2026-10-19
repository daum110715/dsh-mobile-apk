import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { withStoreTransaction } from '../../vendor/dsh-undo-savepoint/lib/atomic.mjs';

const root = await fs.mkdtemp(join(tmpdir(), 'dsh-undo-store-'));
process.env.DSH_UNDO_ROOT = join(root, 'legacy');
const core = await import('../../vendor/dsh-undo-savepoint/lib/core.mjs');
const cfg = { manualDir: join(root, 'manual'), autoDir: join(root, 'auto'),
  settingsFile: join(root, 'settings.json'), homeDir: join(root, 'home'), profileDir: join(root, 'profile'), pluginDirs: [], profileName: 'web', keepAuto: 1, keepPre: 1 };
await Promise.all([cfg.homeDir, cfg.profileDir].map(dir => fs.mkdir(dir, { recursive: true })));
const blob = Buffer.from('old orphan fixture reused by a new snapshot');
const hash = core.sha1Hex(blob);

test('custom automatic roots still exclude writers sharing a manual directory', async () => {
  const a = { autoDir: join(root, 'custom-a', 'auto'), manualDir: join(root, 'shared-manual') };
  const b = { autoDir: join(root, 'custom-b', 'auto'), manualDir: a.manualDir };
  let announce, release;
  const ready = new Promise(resolve => { announce = resolve; });
  const held = withStoreTransaction(a, async () => {
    announce();
    await new Promise(resolve => { release = resolve; });
  });
  await ready;
  try {
    await assert.rejects(withStoreTransaction(b, () => assert.fail('overlapping writer entered')), { code: 'UNDO_STORE_BUSY' });
    const url = new URL('../../vendor/dsh-undo-savepoint/lib/atomic.mjs', import.meta.url).href;
    const child = spawn(process.execPath, ['--input-type=module', '-e',
      `import {withStoreTransaction} from ${JSON.stringify(url)};
       await withStoreTransaction(${JSON.stringify(b)}, () => { throw new Error('overlapping child entered'); })
         .catch(error => { if(error.code !== 'UNDO_STORE_BUSY') throw error; console.log(error.code); });`],
    { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', data => { output += data; });
    const [code] = await once(child, 'exit');
    assert.equal(code, 0);
    assert.match(output, /UNDO_STORE_BUSY/);
  } finally { release(); await held; }
  assert.equal(await withStoreTransaction(b, () => 'released'), 'released');
});

test('failed multi-resource acquisition releases its earlier locks', async () => {
  const shared = join(root, 'z-shared-manual');
  const a = { autoDir: join(root, '0-partial', 'auto'), manualDir: shared };
  const b = { autoDir: join(root, '1-owner', 'auto'), manualDir: shared };
  const independent = { autoDir: a.autoDir, manualDir: join(root, 'y-independent-manual') };
  let announce, release;
  const ready = new Promise(resolve => { announce = resolve; });
  const held = withStoreTransaction(b, async () => {
    announce();
    await new Promise(resolve => { release = resolve; });
  });
  await ready;
  try {
    await assert.rejects(withStoreTransaction(a, () => assert.fail('partial acquisition entered')), { code: 'UNDO_STORE_BUSY' });
    assert.equal(await withStoreTransaction(independent, () => 'no leaked lock'), 'no leaked lock');
  } finally { release(); await held; }
});

test('separate process cannot compact while a writer holds the OS lock; killed writer releases it', { timeout: 15000 }, async () => {
  await core.writeBlob(cfg, hash, blob);
  const url = new URL('../../vendor/dsh-undo-savepoint/lib/atomic.mjs', import.meta.url).href;
  const script = `import { withStoreTransaction } from ${JSON.stringify(url)};
    await withStoreTransaction(${JSON.stringify(cfg)}, async () => {
      process.send('locked'); await new Promise(() => {});
    });`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  try {
    const ready = await Promise.race([once(child, 'message'), once(child, 'exit').then(() => { throw new Error(errors || 'writer exited before lock'); })]);
    assert.equal(ready[0], 'locked');
    await assert.rejects(core.undoCompact(cfg), error => error.code === 'UNDO_STORE_BUSY');
    assert.deepEqual(await core.readBlob(cfg, hash), blob);
  } finally { const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited; }
  const result = await core.undoCompact(cfg);
  assert.equal(result.removed, 1);
});

test('old orphan reuse is protected for the entire blob-to-manifest interval', async () => {
  await core.writeBlob(cfg, hash, blob);
  const old = new Date(Date.now() - 3600_000);
  await fs.utimes(join(core.blobDir(cfg), hash), old, old);
  let release;
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const writer = core.withStoreTransaction(cfg, async () => {
    await core.writeBlob(cfg, hash, blob);
    started(); await gate;
    const dir = join(cfg.manualDir, '20261019-000000-abcd');
    await core.writeManifest(dir, { id: '20261019-000000-abcd', files: [], plugins: [], profileFiles: [{ path: 'code.js', hash }] });
  });
  await ready;
  const compact = core.undoCompact({ ...cfg });
  release(); await writer;
  assert.equal((await compact).removed, 0);
  assert.deepEqual(await core.readBlob(cfg, hash), blob);
});

test('corrupt old manifest and message batch abort all deletion; unknown files stay untouched', async () => {
  const orphan = Buffer.from('still retain when metadata is unreadable');
  const orphanHash = core.sha1Hex(orphan);
  await core.writeBlob(cfg, orphanHash, orphan);
  const dir = join(cfg.manualDir, '20261019-000001-abcd');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(join(dir, 'manifest.json'), '{broken');
  await assert.rejects(core.undoCompact(cfg));
  assert.deepEqual(await core.readBlob(cfg, orphanHash), orphan);
  await fs.writeFile(join(dir, 'manifest.json'), JSON.stringify({ files: [], plugins: [] }));
  const mdir = core.messageOpsDir(cfg);
  await fs.mkdir(mdir, { recursive: true });
  await fs.writeFile(join(mdir, 'legacy.json'), '{broken');
  await assert.rejects(core.undoCompact(cfg));
  assert.deepEqual(await core.readBlob(cfg, orphanHash), orphan);
  await fs.writeFile(join(mdir, 'legacy.json'), JSON.stringify({ ops: [{ beforeHash: orphanHash }] }));
  await fs.writeFile(join(core.blobDir(cfg), 'unknown.tmp'), 'retain');
  assert.equal((await core.undoCompact(cfg)).removed, 0);
  assert.equal(await fs.readFile(join(core.blobDir(cfg), 'unknown.tmp'), 'utf8'), 'retain');
});

test('automatic GC includes message references and refreshes snapshots after pruning', async () => {
  const oldHash = core.sha1Hex(Buffer.from('old auto only'));
  const newHash = core.sha1Hex(Buffer.from('kept auto'));
  await core.writeBlob(cfg, oldHash, Buffer.from('old auto only'));
  await core.writeBlob(cfg, newHash, Buffer.from('kept auto'));
  for (const [id, time, ref] of [['20261019-000002-abcd', '2026-10-18', oldHash], ['20261019-000003-abcd', '2026-10-19', newHash]]) {
    await core.writeManifest(join(cfg.autoDir, id), { id, kind: 'auto', time, files: [], plugins: [], profileFiles: [{ path: 'file.js', hash: ref }] });
  }
  const stale = await core.listSnapshots(cfg);
  const result = await core.pruneAuto(cfg, stale);
  assert.equal(result.removedAuto, 1);
  assert.equal(result.removedBlobs, 1);
  assert.equal(await core.readBlob(cfg, oldHash), null);
  assert.ok(await core.readBlob(cfg, newHash));
  assert.ok(await core.readBlob(cfg, hash));
});

test('concurrent snapshot creation and message appends publish complete data', async () => {
  const result = await Promise.all(Array.from({ length: 10 }, (_, index) => core.createSnapshot(cfg, 'manual', 'concurrent-' + index)));
  assert.equal(new Set(result.map(x => x.id)).size, 10);
  await Promise.all(Array.from({ length: 20 }, (_, index) => core.appendMessageOp(cfg, { batchId: 'batch-fixture', op: { index, beforeHash: hash } })));
  assert.equal((await core.readMessageOps(cfg, 'batch-fixture')).ops.length, 20);
  await assert.rejects(core.writeBlob(cfg, 'a'.repeat(40), blob), /hash mismatch/);
});

test('interrupted tool reservations remain referenced and are not pruned or replayed', async () => {
  const bytes = Buffer.from('pending before image');
  const beforeHash = core.sha1Hex(bytes);
  await core.writeBlob(cfg, beforeHash, bytes);
  await core.appendMessageOp(cfg, { batchId: 'pending-fixture', op: { operationId: 'op-1', phase: 'pending', beforeHash, path: join(root, 'tool-output') } });
  await core.pruneMessageOps({ ...cfg, keepMessageOps: 0 });
  assert.equal((await core.readMessageOps(cfg, 'pending-fixture')).ops.length, 1);
  await core.undoCompact(cfg);
  assert.deepEqual(await core.readBlob(cfg, beforeHash), bytes);
  const undone = await core.undoMessage(cfg, 'pending-fixture');
  assert.equal(undone.changed.length, 0);
  assert.equal(undone.skipped.length, 1);
  await core.completeMessageOp(cfg, 'pending-fixture', 'op-1', { phase: 'done', afterExists: false });
  const batch = await core.readMessageOps(cfg, 'pending-fixture');
  assert.equal(batch.ops.length, 1);
  assert.equal(batch.ops[0].phase, 'done');
  const file = join(core.messageOpsDir(cfg), 'corrupt-fixture.json');
  await fs.writeFile(file, '{old damaged bytes');
  await assert.rejects(core.appendMessageOp(cfg, { batchId: 'corrupt-fixture', op: { beforeHash } }));
  assert.equal(await fs.readFile(file, 'utf8'), '{old damaged bytes');
});

test.after(async () => { await fs.rm(root, { recursive: true, force: true }); });
