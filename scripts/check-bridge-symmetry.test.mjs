import test from 'node:test'
import assert from 'node:assert/strict'
import { kotlinBridgeMethods, tsDeclaredMembers, jsCallSites } from './check-bridge-symmetry.mjs'

// 这个门禁守的是「壳侧桥面 ↔ 页面侧消费面」的对称性，而它自己此前**没有任何自测**。
// 本轮（2026-10-28）实测到它把注释里提到的 @JavascriptInterface 当成真注解：
// 紧随其后的任意 `fun`（包括私有辅助函数）都会被收进桥面清单 ⇒ 页面侧没有它就误报红，
// 或者把它登记进 kotlinOnly 稀释真实面。下面第一条钉住这个形态。

test('注释里提到的 @JavascriptInterface 不得被当成注解', () => {
  const src = [
    '/**',
    ' * `@JavascriptInterface` 是页面可直达的公开边界，必须自己校验入参。',
    ' */',
    'private fun helperNotABridge(x: Int): Int = x + 1',
    '',
    '@JavascriptInterface',
    'fun realBridge(): String = "x"',
  ].join('\n')
  assert.deepEqual(kotlinBridgeMethods(src), ['realBridge'])
})

test('注解与 fun 之间可隔注释/其它注解，但窗口仍然是 8 行', () => {
  const near = ['@JavascriptInterface', '// 说明', '@Suppress("unused")', 'fun ok(): String'].join('\n')
  assert.deepEqual(kotlinBridgeMethods(near), ['ok'])

  // 超过 8 行窗口就不收：这是现实现的契约，钉住它是为了让"改窗口"这件事必须显式改用例。
  const far = ['@JavascriptInterface', ...Array.from({ length: 9 }, (_, i) => '// filler ' + i), 'fun tooFar()']
  assert.deepEqual(kotlinBridgeMethods(far.join('\n')), [])
})

test('startMarker 限定区域时只扫区域内', () => {
  const src = [
    'object A {',
    '  @JavascriptInterface',
    '  fun insideA(): String',
    '}',
    'object B {',
    '  @JavascriptInterface',
    '  fun insideB(): String',
    '}',
  ].join('\n')
  assert.deepEqual(kotlinBridgeMethods(src, 'object B'), ['insideB'])
})

test('jsCallSites 只取真实调用点且去重保序', () => {
  const html = '<script>window.consoleBridge.writeRaw("x");window.consoleBridge.resize(1,2);' +
    'window.consoleBridge.writeRaw("y")</script>'
  assert.deepEqual(jsCallSites(html, 'window.consoleBridge'), ['writeRaw', 'resize'])
})
