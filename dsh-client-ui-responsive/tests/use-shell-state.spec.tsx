// @vitest-environment jsdom
// ST-09 钩子回归：挂载读一次 + visibilitychange/focus 重读 + 可选轮询 + 读失败保留旧值。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { sameShellState, useShellState } from '../src/client/mobile/use-shell-state.ts'

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined
let host: HTMLElement | undefined

function Probe({ getter, pollMs }: { getter: () => string; pollMs?: number }) {
  const [value] = useShellState(getter, pollMs === undefined ? {} : { pollMs })
  return <span data-testid="v">{String(value)}</span>
}

function ObjectProbe({ getter, renders }: { getter: () => Record<string, unknown>; renders: { count: number } }) {
  renders.count += 1
  const [value] = useShellState(getter, { pollMs: 100 })
  return <span data-testid="v">{JSON.stringify(value)}</span>
}

async function render(getter: () => string, pollMs?: number): Promise<HTMLElement> {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root!.render(<Probe getter={getter} pollMs={pollMs} />)
  })
  return host
}

const shown = (el: HTMLElement): string | null | undefined => el.querySelector('[data-testid="v"]')?.textContent

beforeEach(() => {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
})
afterEach(async () => {
  if (root !== undefined) {
    await act(async () => { root!.unmount() })
    root = undefined
  }
  host?.remove()
  host = undefined
  vi.useRealTimers()
})

describe('useShellState（ST-09）', () => {
  it('对象值按结构判等（忽略键顺序），同值轮询不触发重渲染', async () => {
    let swap = false
    const getter = () => (swap ? { b: 2, a: { d: 4, c: 3 } } : { a: { c: 3, d: 4 }, b: 2 })
    const renders = { count: 0 }
    vi.useFakeTimers()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => { root!.render(<ObjectProbe getter={getter} renders={renders} />) })
    const before = renders.count
    swap = true
    await act(async () => { vi.advanceTimersByTime(150) })
    expect(renders.count).toBe(before)
  })

  it('结构比较保留真实变化（数组顺序与标量差异）', () => {
    expect(sameShellState({ a: [1, 2] }, { a: [1, 2] })).toBe(true)
    expect(sameShellState({ a: [1, 2] }, { a: [2, 1] })).toBe(false)
    expect(sameShellState({ a: 1 }, { a: 2 })).toBe(false)
    expect(sameShellState({ a: undefined }, {})).toBe(false)
  })

  it('挂载时读一次真源', async () => {
    let reads = 0
    const el = await render(() => { reads += 1; return 'a' })
    expect(shown(el)).toBe('a')
    expect(reads).toBe(1)
  })

  it('只动系统侧真源 + 回前台（visibilitychange）→ 展示跟随，无需重挂载', async () => {
    let value = 'a'
    const el = await render(() => value)
    expect(shown(el)).toBe('a')
    value = 'b'
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(shown(el)).toBe('b')
  })

  it('focus 同样触发重读', async () => {
    let value = 'a'
    const el = await render(() => value)
    value = 'c'
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    expect(shown(el)).toBe('c')
  })

  it('可选轮询：到点即重读', async () => {
    vi.useFakeTimers()
    let value = 'a'
    const el = await render(() => value, 500)
    value = 'd'
    await act(async () => { vi.advanceTimersByTime(600) })
    expect(shown(el)).toBe('d')
  })

  it('真源读失败保留上一次值（不把状态打成 undefined）', async () => {
    let value = 'a'
    let broken = false
    const el = await render(() => { if (broken) throw new Error('bridge gone'); return value })
    broken = true
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(shown(el)).toBe('a')
  })

  it('卸载后不再更新（监听器与定时器都被清理）', async () => {
    let value = 'a'
    let readsAfterUnmount = 0
    let mounted = true
    const el = await render(() => { if (!mounted) readsAfterUnmount += 1; return value }, 500)
    await act(async () => { root!.unmount(); root = undefined; mounted = false })
    value = 'z'
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(shown(el)).not.toBe('z')
    expect(readsAfterUnmount).toBe(0)
  })
})
