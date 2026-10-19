import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

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
  const key = (await import('node:path')).resolve(target);
  const previous = updates.get(key) ?? Promise.resolve();
  const pending = previous.catch(() => {}).then(action);
  updates.set(key, pending);
  try { return await pending; }
  finally { if (updates.get(key) === pending) updates.delete(key); }
}
