// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installMotionSwitch } from '../src/client/mobile/motion-switch.ts'

let matches = false
const listeners = new Set<() => void>()

function media(): void {
  vi.stubGlobal('matchMedia', () => ({
    get matches() { return matches },
    addEventListener(_type: string, fn: () => void) { listeners.add(fn) },
    removeEventListener(_type: string, fn: () => void) { listeners.delete(fn) },
  }))
}

afterEach(() => {
  matches = false
  listeners.clear()
  localStorage.clear()
  document.documentElement.removeAttribute('data-dsh-motion')
  document.documentElement.removeAttribute('data-dsh-motion-off')
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('motion switch', () => {
  it('does nothing without a window', () => {
    installMotionSwitch(null)()
    expect(document.documentElement.hasAttribute('data-dsh-motion')).toBe(false)
  })

  it('turns motion on by default and off from storage, reduced motion, or a component list', () => {
    media()
    const stop = installMotionSwitch(window)
    expect(document.documentElement.hasAttribute('data-dsh-motion')).toBe(true)
    expect(document.documentElement.hasAttribute('data-dsh-motion-off')).toBe(false)

    localStorage.setItem('dsh.motion.off', 'press drawer')
    window.dispatchEvent(new Event('storage'))
    expect(document.documentElement.getAttribute('data-dsh-motion-off')).toBe('press drawer')

    localStorage.setItem('dsh.motion', '0')
    window.dispatchEvent(new Event('storage'))
    expect(document.documentElement.hasAttribute('data-dsh-motion')).toBe(false)

    localStorage.removeItem('dsh.motion')
    window.dispatchEvent(new Event('storage'))
    expect(document.documentElement.hasAttribute('data-dsh-motion')).toBe(true)

    matches = true
    for (const listener of listeners) listener()
    expect(document.documentElement.hasAttribute('data-dsh-motion')).toBe(false)

    stop()
    expect(document.documentElement.hasAttribute('data-dsh-motion')).toBe(false)
    expect(document.documentElement.hasAttribute('data-dsh-motion-off')).toBe(false)
    expect(listeners.size).toBe(0)
  })

  it('keeps the default when storage throws', () => {
    media()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied') })
    const stop = installMotionSwitch(window)
    expect(document.documentElement.hasAttribute('data-dsh-motion')).toBe(true)
    stop()
  })
})
