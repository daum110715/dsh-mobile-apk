import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { applySnapshot } from '../../vendor/dsh-undo-savepoint/lib/core.mjs';

test('missing and unknown snapshot files are reported and current files stay intact', async () => {
  const root = await fs.mkdtemp(join(tmpdir(), 'dsh-partial-restore-'));
  const cfg = { homeDir: join(root, 'home'), profileDir: join(root, 'profile'), pluginDirs: [] };
  await fs.mkdir(cfg.homeDir, { recursive: true });
  await fs.mkdir(cfg.profileDir, { recursive: true });
  await fs.writeFile(join(cfg.homeDir, 'settings.yaml'), 'current: keep');
  try {
    const result = await applySnapshot(cfg, { _dir: join(root, 'snapshot'),
      files: [{ name: 'home-settings.yaml' }, { name: 'unknown-old-version-file' }] });
    assert.equal(result.restored.length, 0);
    assert.equal(result.missing.length, 2);
    assert.equal(await fs.readFile(join(cfg.homeDir, 'settings.yaml'), 'utf8'), 'current: keep');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('actual client result functions show partial failure without reloading away the warning', async () => {
  const source = await fs.readFile(new URL('../../vendor/dsh-undo-savepoint/lib/client.js', import.meta.url), 'utf8');
  const start = source.indexOf('const RESULT_EVENT =');
  const end = source.indexOf('const KIND_KEYS =', start);
  let event;
  let scheduled = 0;
  const context = vm.createContext({ window: { dispatchEvent: value => { event = value; } },
    CustomEvent: class { constructor(type, data) { this.type = type; this.detail = data.detail; } },
    setTimeout: () => { scheduled++; }, location: { reload() {} } });
  vm.runInContext(source.slice(start, end), context);
  context.result = { ok: true, restored: [], missing: ['home-settings.yaml'] };
  vm.runInContext('publishResult(result, "restore", (key, args) => key + ":" + args.files); maybeReload(result, "restore");', context);
  assert.equal(event.detail.ok, false);
  assert.match(event.detail.text, /restore.partial:home-settings.yaml/);
  assert.equal(scheduled, 0);
  vm.runInContext('maybeReload({ ok: true }, "restore");', context);
  assert.equal(scheduled, 1);
});
