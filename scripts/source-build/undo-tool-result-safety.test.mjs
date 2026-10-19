import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../../vendor/dsh-undo-savepoint/lib/index.js', import.meta.url), 'utf8');
const start = source.indexOf('      let msgBatch = null;');
const end = source.indexOf("    }, 'dsh-undo-savepoint.msgops');", start);
if (start < 0 || end < 0) throw new Error('could not locate the tools/pre-execute hook');
const hookSource = source.slice(start, end);

async function harness(options = {}) {
  const root = await fs.mkdtemp(join(tmpdir(), 'dsh-undo-tool-result-'));
  const file = join(root, 'tool-output.txt');
  await fs.writeFile(file, options.initial ?? 'before');
  const calls = { next: 0, writeBlob: 0, append: 0, complete: 0, prune: 0 };
  const ledger = [];
  const warnings = [];
  const state = { failComplete: !!options.failComplete, failPrune: !!options.failPrune,
    failAppend: !!options.failAppend };
  const context = vm.createContext({
    console,
    process: { cwd: () => root },
    fs,
    LEGACY_ROOT: join(root, 'legacy'),
    DSH_HOME: join(root, 'home'),
    cfg: { manualDir: join(root, 'manual'), autoDir: join(root, 'auto'),
      workspaceDirs: [root], fileToolWhitelist: ['write_file'] },
    ctx: { logger: { warn: value => warnings.push(String(value)) }, on: (_name, fn) => fn },
    sha1Hex: buf => createHash('sha1').update(buf).digest('hex'),
    withStoreTransaction: async (_cfg, action) => action(),
    writeBlob: async () => { calls.writeBlob++; },
    appendMessageOp: async (_cfg, batch) => {
      calls.append++;
      if (state.failAppend) throw new Error('append failed');
      ledger.push({ ...batch.op, batchId: batch.batchId });
    },
    completeMessageOp: async (_cfg, _batchId, operationId, patch) => {
      calls.complete++;
      if (state.failComplete) throw new Error('complete failed');
      const op = ledger.find(item => item.operationId === operationId);
      if (!op) throw new Error('reservation missing');
      Object.assign(op, patch);
    },
    pruneMessageOps: async () => {
      calls.prune++;
      if (state.failPrune) throw new Error('prune failed');
    },
  });
  const hook = vm.runInContext(`(function () {\n${hookSource}\n})()`, context);
  return { root, file, hook, calls, ledger, warnings, state };
}

async function withHarness(options, action) {
  const h = await harness(options);
  try { return await action(h); }
  finally { await fs.rm(h.root, { recursive: true, force: true }); }
}

function exec(file) {
  return { name: 'write_file', args: { path: file }, agent: { messageId: 'message-1' } };
}

test('completion failure cannot replace the tool result', async () => {
  await withHarness({ failComplete: true }, async h => {
    const expected = { ok: true, value: 42 };
    const result = await h.hook(exec(h.file), async () => { h.calls.next++; return expected; });
    assert.equal(result, expected);
    assert.equal(h.calls.next, 1);
    assert.equal(h.calls.complete, 1);
    assert.equal(h.calls.prune, 0);
    assert.equal(h.ledger[0].phase, 'pending');
    assert.match(h.warnings.join('\n'), /complete failed/);
  });
});

test('prune failure cannot replace the tool result or replay next', async () => {
  await withHarness({ failPrune: true }, async h => {
    const expected = { ok: true, value: 'kept' };
    const result = await h.hook(exec(h.file), async () => { h.calls.next++; return expected; });
    assert.equal(result, expected);
    assert.equal(h.calls.next, 1);
    assert.equal(h.calls.complete, 1);
    assert.equal(h.calls.prune, 1);
    assert.equal(h.ledger[0].phase, 'done');
    assert.match(h.warnings.join('\n'), /prune failed/);
  });
});

test('next error is rethrown unchanged and executes exactly once', async () => {
  await withHarness({}, async h => {
    const failure = new Error('tool failed');
    await assert.rejects(h.hook(exec(h.file), async () => { h.calls.next++; throw failure; }),
      error => error === failure);
    assert.equal(h.calls.next, 1);
    assert.equal(h.calls.complete, 1);
    assert.equal(h.ledger[0].phase, 'failed');
  });
});

test('completion failure does not hide a next error', async () => {
  await withHarness({ failComplete: true }, async h => {
    const failure = new Error('original tool error');
    await assert.rejects(h.hook(exec(h.file), async () => { h.calls.next++; throw failure; }),
      error => error === failure);
    assert.equal(h.calls.next, 1);
    assert.equal(h.ledger[0].phase, 'pending');
    assert.match(h.warnings.join('\n'), /complete failed/);
  });
});

test('large-file pass-through returns the next result', async () => {
  await withHarness({ initial: Buffer.alloc(262145, 97) }, async h => {
    const expected = { ok: true, value: 'large' };
    const result = await h.hook(exec(h.file), async () => { h.calls.next++; return expected; });
    assert.equal(result, expected);
    assert.equal(h.calls.next, 1);
    assert.equal(h.calls.writeBlob, 0);
    assert.equal(h.calls.append, 0);
    assert.equal(h.calls.complete, 0);
  });
});

test('tracking setup failure runs the tool once and keeps its result', async () => {
  await withHarness({ failAppend: true }, async h => {
    const expected = { ok: true, value: 'fallback' };
    const result = await h.hook(exec(h.file), async () => { h.calls.next++; return expected; });
    assert.equal(result, expected);
    assert.equal(h.calls.next, 1);
    assert.equal(h.calls.complete, 0);
    assert.match(h.warnings.join('\n'), /append failed/);
  });
});
