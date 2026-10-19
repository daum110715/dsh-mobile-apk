import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes, createHash } from 'node:crypto';
import { createServer } from 'node:net';

/** 同目录独占临时文件；发布失败时保留旧目标，绝不回退为截断覆盖。 */
export async function atomicWrite(target, bytes) {
  await fs.mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}-${randomBytes(12).toString('hex')}.tmp`;
  let handle;
  try {
    handle = await fs.open(temporary, 'wx', 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    for (let attempt = 0; ; attempt++) {
      try { await fs.rename(temporary, target); break; }
      catch (error) {
        if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 5) throw error;
        await new Promise(resolve => setTimeout(resolve, 10 * (attempt + 1)));
      }
    }
  } finally {
    await handle?.close().catch(() => {});
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

const updates = new Map();
/** 同一运行时的读改写必须整体串行；唯一临时名本身不能防止丢更新。 */
export async function serializeUpdate(target, action) {
  const key = resolve(target);
  const previous = updates.get(key) ?? Promise.resolve();
  const pending = previous.catch(() => {}).then(action);
  updates.set(key, pending);
  try { return await pending; }
  finally { if (updates.get(key) === pending) updates.delete(key); }
}

const transactions = new AsyncLocalStorage();
/** 内核持有的互斥端点：崩溃自动释放，不按时间/PID 偷锁，也不留磁盘锁。 */
async function acquireStoreLock(key) {
  const hash = createHash('sha256').update(key).digest('hex');
  const [major, minor] = process.versions.node.split('.').map(Number);
  const supportsAbstract = major > 20 || (major === 20 && minor >= 8);
  const endpoint = process.platform === 'win32' ? { path: `\\\\.\\pipe\\dsh-undo-${hash}` }
    : process.platform === 'linux' && supportsAbstract ? { path: `\0dsh-undo-${hash}` }
    : { host: '127.0.0.1', port: 20000 + parseInt(hash.slice(0, 8), 16) % 40000 };
  const server = createServer(socket => socket.destroy());
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ ...endpoint, exclusive: true }, resolve);
  }).catch(cause => {
    server.close();
    const error = new Error('Undo store is in use; retry after the other transaction finishes', { cause });
    error.code = 'UNDO_STORE_BUSY';
    throw error;
  });
  return () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
export async function withStoreTransaction(cfg, action) {
  const directory = dirname(resolve(cfg.autoDir));
  await fs.mkdir(directory, { recursive: true });
  const real = await fs.realpath(directory);
  const key = process.platform === 'win32' ? real.toLowerCase() : real;
  const inherited = transactions.getStore();
  if (inherited?.key === key && inherited.active) return action();
  return serializeUpdate(key + '/.undo-transaction', async () => {
    const release = await acquireStoreLock(key);
    const scope = { key, active: true };
    try { return await transactions.run(scope, action); }
    finally { scope.active = false; await release(); }
  });
}
