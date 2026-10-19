import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SHELL_OPS, translateAdbLine } from '../lib/shell-ops.js'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { condenseRepeatedText } from '../lib/index.js'
import { AndroidPrivilegeService, apply } from '../lib/index.js'

test('condenseRepeatedText 折叠重复行并标注次数（0.14.0 报错风暴）', () => {
  // 设备实录形态：Termux 的 am 包装脚本 unset LD_LIBRARY_PATH/LD_PRELOAD，之后每条 Termux 二进制
  // 都以链接失败收场，同一句重复 40+ 次且互相交错，回执 25 KB 全是乱码。
  const storm = Array.from({ length: 40 }, () => 'CANNOT LINK EXECUTABLE "grep": library "libandroid-support.so" not found').join('\n')
  const out = condenseRepeatedText(storm)
  assert.equal(out.split('\n').length, 1, '同一句应折叠成一行')
  assert.match(out, /同句重复 40 次/)
  assert.ok(out.length < 200, '回执长度必须压回可读范围')
})

test('condenseRepeatedText 保留不同行与空行结构', () => {
  const text = 'AAA\nBBB\nBBB\nCCC'
  assert.equal(condenseRepeatedText(text), 'AAA\nBBB   （同句重复 2 次）\nCCC')
  assert.equal(condenseRepeatedText(''), '')
})

test('condenseRepeatedText 超长时保留首尾并标注省略量', () => {
  const many = Array.from({ length: 900 }, (_, i) => 'line-' + i).join('\n')
  const out = condenseRepeatedText(many, 100)
  const lines = out.split('\n')
  assert.equal(lines.length, 101, 'head 50 + 省略标记 + tail 50')
  assert.match(out, /中间省略/)
  assert.match(lines[0], /^line-0$/)
  assert.match(lines[lines.length - 1], /^line-899$/)
})

test('shell op family is the four privileged shell ops (neverA11y)', () => {
  assert.deepEqual([...SHELL_OPS], ['shExec', 'shPull', 'shPush', 'shRemove'])
})

test('adb shell line becomes a plain privileged shell step', () => {
  assert.deepEqual(translateAdbLine('adb shell wm size'), {
    ok: true,
    steps: [{ kind: 'exec', command: 'wm size' }],
  })
  assert.deepEqual(translateAdbLine('adb -s 127.0.0.1:16416 shell getprop ro.product.model'), {
    ok: true,
    steps: [{ kind: 'exec', command: 'getprop ro.product.model' }],
  })
  assert.deepEqual(translateAdbLine('adb shell "dumpsys window | grep -m1 mCurrentFocus"'), {
    ok: true,
    steps: [{ kind: 'exec', command: 'dumpsys window | grep -m1 mCurrentFocus' }],
  })
})

test('screencap + pull + cleanup line is translated into exec/pull/exec steps', () => {
  const line = 'adb shell screencap -p /data/local/tmp/dsh.png && adb pull /data/local/tmp/dsh.png files/home/tmp/dsh-tmp/dsh.png && ls -l files/home/tmp/dsh-tmp/dsh.png; adb shell rm -f /data/local/tmp/dsh.png'
  assert.deepEqual(translateAdbLine(line), {
    ok: true,
    steps: [
      { kind: 'exec', command: 'screencap -p /data/local/tmp/dsh.png' },
      { kind: 'pull', remote: '/data/local/tmp/dsh.png', local: 'files/home/tmp/dsh-tmp/dsh.png' },
      { kind: 'exec', command: 'ls -l files/home/tmp/dsh-tmp/dsh.png' },
      { kind: 'exec', command: 'rm -f /data/local/tmp/dsh.png' },
    ],
  })
})

test('push and quoted paths survive translation', () => {
  assert.deepEqual(translateAdbLine('adb push "files/home/tmp/a b.txt" /data/local/tmp/a.txt'), {
    ok: true,
    steps: [{ kind: 'push', local: 'files/home/tmp/a b.txt', remote: '/data/local/tmp/a.txt' }],
  })
})

test('quoted separators are not split apart', () => {
  assert.deepEqual(translateAdbLine('adb shell am broadcast -a ADB_INPUT_TEXT --es msg "a && b"'), {
    ok: true,
    steps: [{ kind: 'exec', command: 'am broadcast -a ADB_INPUT_TEXT --es msg "a && b"' }],
  })
})

test('devices listing stays informative without an adb client', () => {
  const t = translateAdbLine('adb devices -l')
  assert.equal(t.ok, true)
  assert.equal(t.steps.length, 1)
  assert.equal(t.steps[0].kind, 'exec')
  assert.match(t.steps[0].command, /getprop ro\.serialno/)
})

test('server management verbs are idempotent no-ops (no adb server exists any more)', () => {
  assert.deepEqual(translateAdbLine('adb connect 127.0.0.1:16416'), {
    ok: true,
    steps: [{ kind: 'exec', command: 'true' }],
  })
  assert.deepEqual(translateAdbLine('adb kill-server'), { ok: true, steps: [{ kind: 'exec', command: 'true' }] })
})

test('unsupported adb verbs are refused instead of being passed through', () => {
  const t = translateAdbLine('adb install /data/local/tmp/app.apk')
  assert.equal(t.ok, false)
  assert.match(t.error, /install/)
  assert.equal(translateAdbLine('   ').ok, false)
})

test('termux channel reports a non-zero exit as failure and preserves forensic output', async () => {
  const previous = { home: process.env.DSH_HOME, prefs: process.env.DSH_ADB_PREFS_PATH,
    audit: process.env.DSH_ADB_AUDIT_PATH }
  const home = mkdtempSync(join(tmpdir(), 'dsh-termux-exit-'))
  const prefs = join(home, 'dsh-adb.xml')
  writeFileSync(prefs, '<map>\n<boolean name="fullAccess" value="true" />\n'
    + '<boolean name="allowSwitch" value="true" />\n<boolean name="paired" value="true" />\n'
    + '<boolean name="wirelessOn" value="true" />\n<boolean name="a11yEnabled" value="true" />\n'
    + '<long name="controlHeartbeat" value="' + String(Date.now()) + '" />\n</map>\n')
  process.env.DSH_HOME = home
  process.env.DSH_ADB_PREFS_PATH = prefs
  process.env.DSH_ADB_AUDIT_PATH = join(home, 'audit')
  const registered = []
  const session = { id: 'termux-exit-session' }
  const run = async () => ({ stdout: { text: '' }, stderr: { text: 'not found' }, exitCode: 7 })
  try {
    apply({
      provide: () => undefined,
      tools: { register: (tool) => registered.push(tool) },
      on: () => undefined,
      effect: () => undefined,
      get: (name) => name === 'sessions'
        ? { get: (id) => id === session.id ? session : undefined }
        : undefined,
      logger: () => ({ debug() {}, warn() {} }),
      shell: { resolve: (spec) => spec, run },
      sandboxPolicy: { defaultMode: 'danger-full-access', resolve: () => ({ mode: 'danger-full-access' }) },
    })
    const tool = registered.find((candidate) => candidate.name === 'android_termux_channel_exec')
    assert.ok(tool)
    const result = await tool.execute({ command: 'grep missing /nope' }, { agent: { session } })
    assert.equal(result.ok, false)
    const payload = result.data ?? result
    assert.equal(payload.exitCode, 7, JSON.stringify(result))
    assert.match(pick(payload), /not found/)
    const successRun = async () => ({ stdout: { text: 'ok' }, stderr: { text: '' }, exitCode: 0 })
    const svc = new AndroidPrivilegeService({ get: () => undefined }, () => 'danger-full-access',
      undefined, { resolve: (spec) => spec, run: successRun })
    assert.equal((await svc.runLine('printf ok')).ok, true)
    const failedLine = new AndroidPrivilegeService({ get: () => undefined }, () => 'danger-full-access',
      undefined, { resolve: (spec) => spec, run })
    assert.equal((await failedLine.runLine('grep missing /nope')).ok, false,
      '内部命令行的非零退出同样不得报成功')
  } finally {
    for (const [key, value] of Object.entries({ DSH_HOME: previous.home,
      DSH_ADB_PREFS_PATH: previous.prefs, DSH_ADB_AUDIT_PATH: previous.audit })) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    rmSync(home, { recursive: true, force: true })
  }
})

/** Tool renderers consume the structured output; mirror their chosen text fields without assuming
 *  that the raw fixture key is `text` (defineTool may add an optional `data` envelope). */
function pick(value) {
  return String(value.text ?? value.stderr ?? value.stdout ?? value.guidance ?? '')
}
