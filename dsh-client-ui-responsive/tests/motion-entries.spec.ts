// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { installMotionEntries } from '../src/client/mobile/motion-entries.ts'

let stop = (): void => {}

afterEach(() => {
  stop()
  stop = () => {}
  document.body.replaceChildren()
  document.documentElement.removeAttribute('data-dsh-motion')
})

async function flush(): Promise<void> {
  await Promise.resolve()
}

describe('motion entries', () => {
  it('does nothing without a root or a window', () => {
    installMotionEntries(null)()
    const foreign = document.implementation.createHTMLDocument('foreign')
    const dispose = installMotionEntries(foreign.body)
    foreign.body.append(foreign.createElement('div'))
    expect(foreign.body.querySelector('[data-dsh-shell-enter]')).toBeNull()
    dispose()
  })

  it('pops a plain overlay, fades a placed one, and staggers a mounted list once', async () => {
    document.documentElement.setAttribute('data-dsh-motion', '')
    stop = installMotionEntries(document.body)
    const menu = document.createElement('div')
    menu.setAttribute('role', 'menu')
    document.body.append(menu)
    await flush()
    expect(menu.getAttribute('data-dsh-shell-enter')).toBe('pop')

    const placed = document.createElement('div')
    placed.setAttribute('role', 'dialog')
    placed.setAttribute('aria-modal', 'true')
    placed.style.transform = 'translate(4px, 8px)'
    document.body.append(placed)
    await flush()
    expect(placed.getAttribute('data-dsh-shell-enter')).toBe('fade')

    const tree = document.createElement('div')
    tree.setAttribute('role', 'tree')
    tree.append(document.createElement('div'), document.createElement('div'))
    const wrap = document.createElement('div')
    wrap.append(tree)
    document.body.append(wrap)
    await flush()
    expect(tree.hasAttribute('data-dsh-shell-stagger')).toBe(true)
    tree.append(document.createElement('div'))
    await flush()
    expect(tree.getAttribute('data-dsh-shell-stagger')).toBe('')
  })

  it('leaves nodes alone while the switch is off and after dispose', async () => {
    stop = installMotionEntries(document.body)
    const menu = document.createElement('div')
    menu.setAttribute('role', 'menu')
    document.body.append(menu)
    await flush()
    expect(menu.hasAttribute('data-dsh-shell-enter')).toBe(false)
    document.documentElement.setAttribute('data-dsh-motion', '')
    stop()
    const next = document.createElement('div')
    next.setAttribute('role', 'menu')
    document.body.append(next)
    await flush()
    expect(next.hasAttribute('data-dsh-shell-enter')).toBe(false)
  })
})
