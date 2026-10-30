// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { installMotionEntries } from '../src/client/mobile/motion-entries.ts'
import { installMotionScene } from '../src/client/mobile/motion-scene.ts'
import { installMotionTranscript } from '../src/client/mobile/motion-transcript.ts'

interface FakeAnimation {
  onfinish: (() => void) | null
  oncancel: (() => void) | null
  cancel: () => void
}

let stop = (): void => {}
let restore = (): void => {}
const played: FakeAnimation[] = []

afterEach(() => {
  for (const animation of played) animation.onfinish?.()
  stop()
  restore()
  stop = () => {}
  restore = () => {}
  played.length = 0
  document.body.replaceChildren()
  document.documentElement.removeAttribute('data-dsh-motion')
  document.documentElement.removeAttribute('data-dsh-motion-off')
})

async function flush(): Promise<void> {
  await Promise.resolve()
}

function usePlayback(): void {
  const previousRect = HTMLElement.prototype.getBoundingClientRect
  const previousAnimate = HTMLElement.prototype.animate
  HTMLElement.prototype.getBoundingClientRect = function (): DOMRect {
    const width = Number.parseFloat(this.style.width) || 0
    const height = Number.parseFloat(this.style.height) || 0
    const left = Number.parseFloat(this.style.left) || 0
    const top = Number.parseFloat(this.style.top) || 0
    return {
      x: left,
      y: top,
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      toJSON() { return {} },
    } as DOMRect
  }
  HTMLElement.prototype.animate = function (): Animation {
    const animation: FakeAnimation = {
      onfinish: null,
      oncancel: null,
      cancel() { this.oncancel?.() },
    }
    played.push(animation)
    return animation as Animation
  }
  restore = () => {
    HTMLElement.prototype.getBoundingClientRect = previousRect
    HTMLElement.prototype.animate = previousAnimate
  }
}

function box(node: HTMLElement, width: number, height: number): void {
  node.style.width = `${String(width)}px`
  node.style.height = `${String(height)}px`
}

function sessionChrome(id: string, title: string): { content: HTMLElement, rowTitle: HTMLElement, headerTitle: HTMLElement } {
  const content = document.createElement('div')
  content.setAttribute('data-conversation-content', '')
  content.setAttribute('data-conversation-session', id)
  const row = document.createElement('div')
  row.setAttribute('data-row-key', `session:${id}`)
  const slot = document.createElement('span')
  const rowTitle = document.createElement('span')
  rowTitle.textContent = title
  box(rowTitle, 80, 18)
  row.append(slot, rowTitle)
  const header = document.createElement('div')
  header.setAttribute('data-slot', 'conversation.session.header')
  const nav = document.createElement('nav')
  const segment = document.createElement('span')
  const headerTitle = document.createElement('span')
  headerTitle.textContent = title
  box(headerTitle, 120, 22)
  segment.append(headerTitle)
  nav.append(segment)
  header.append(nav)
  document.body.append(content, row, header)
  return { content, rowTitle, headerTitle }
}

describe('motion transcript', () => {
  it('enters one live command and leaves history, the first row, and a queued echo still', async () => {
    document.documentElement.setAttribute('data-dsh-motion', '')
    stop = installMotionTranscript(document.body)
    const settled = document.createElement('div')
    settled.setAttribute('data-chat-flow-kind', 'user')
    document.body.append(settled)
    await flush()
    const command = document.createElement('div')
    command.setAttribute('data-chat-flow-kind', 'command')
    document.body.append(command)
    await flush()
    expect(command.getAttribute('data-dsh-shell-enter')).toBe('command')

    const batch = document.createElement('div')
    const older = document.createElement('div')
    older.setAttribute('data-chat-flow-kind', 'command')
    const newer = document.createElement('div')
    newer.setAttribute('data-chat-flow-kind', 'command')
    batch.append(older, newer)
    document.body.append(batch)
    await flush()
    expect(older.hasAttribute('data-dsh-shell-enter')).toBe(false)
    expect(newer.hasAttribute('data-dsh-shell-enter')).toBe(false)

    document.body.replaceChildren()
    const first = document.createElement('div')
    first.setAttribute('data-chat-flow-kind', 'command')
    document.body.append(first)
    await flush()
    expect(first.hasAttribute('data-dsh-shell-enter')).toBe(false)
  })

  it('morphs a cleared composer into one matching echo and swaps that echo upward', async () => {
    usePlayback()
    document.documentElement.setAttribute('data-dsh-motion', '')
    stop = installMotionTranscript(document.body)
    const composer = document.createElement('div')
    composer.setAttribute('data-composer-input', 'true')
    composer.textContent = 'hello'
    box(composer, 40, 20)
    document.body.append(composer)
    composer.dispatchEvent(new Event('input', { bubbles: true }))

    const queued = document.createElement('li')
    queued.setAttribute('data-submission-echo', '')
    queued.textContent = 'hello'
    box(queued, 40, 20)
    document.body.append(queued)
    await flush()
    expect(played).toHaveLength(0)

    composer.textContent = ''
    const echo = document.createElement('div')
    echo.setAttribute('data-submission-echo', '')
    echo.textContent = 'hello there'
    box(echo, 90, 28)
    document.body.append(echo)
    await flush()
    expect(played.length).toBeGreaterThan(0)
    expect(document.querySelector('[data-dsh-shell-ghost]')).not.toBeNull()
    const morphs = played.length

    played.length = 0
    composer.textContent = 'other'
    box(composer, 40, 20)
    composer.dispatchEvent(new Event('input', { bubbles: true }))
    composer.textContent = ''
    const wrong = document.createElement('div')
    wrong.setAttribute('data-submission-echo', '')
    wrong.textContent = 'nope'
    box(wrong, 40, 20)
    document.body.append(wrong)
    await flush()
    expect(played).toHaveLength(0)

    const bubble = document.createElement('div')
    bubble.setAttribute('data-chat-flow-kind', 'user')
    box(bubble, 90, 28)
    echo.remove()
    document.body.append(bubble)
    await flush()
    expect(played.length).toBeGreaterThan(0)
    expect(morphs).toBeGreaterThan(0)
  })

  it('does nothing for a null root, a foreign document, or a disabled transcript', async () => {
    installMotionTranscript(null)()
    const foreign = document.implementation.createHTMLDocument('foreign')
    const dispose = installMotionTranscript(foreign.body)
    foreign.body.append(foreign.createElement('div'))
    dispose()
    document.documentElement.setAttribute('data-dsh-motion', '')
    document.documentElement.setAttribute('data-dsh-motion-off', 'transcript')
    stop = installMotionTranscript(document.body)
    const settled = document.createElement('div')
    settled.setAttribute('data-chat-flow-kind', 'user')
    document.body.append(settled)
    await flush()
    const command = document.createElement('div')
    command.setAttribute('data-chat-flow-kind', 'command')
    document.body.append(command)
    await flush()
    expect(command.hasAttribute('data-dsh-shell-enter')).toBe(false)
  })
})

describe('motion scene', () => {
  it('moves forward and back, and skips the first session and a missing title', async () => {
    document.documentElement.setAttribute('data-dsh-motion', '')
    stop = installMotionScene(document.body)
    const { content } = sessionChrome('a', 'Alpha')
    await flush()
    expect(content.hasAttribute('data-dsh-shell-nav')).toBe(false)

    content.setAttribute('data-conversation-session', 'b')
    await flush()
    expect(content.getAttribute('data-dsh-shell-nav')).toBe('forward')

    content.setAttribute('data-conversation-session', 'c"d')
    await flush()
    expect(content.getAttribute('data-dsh-shell-nav')).toBe('forward')

    content.setAttribute('data-conversation-session', 'b')
    await flush()
    expect(content.getAttribute('data-dsh-shell-nav')).toBe('back')

    content.setAttribute('data-conversation-session', '')
    await flush()
    expect(content.getAttribute('data-dsh-shell-nav')).toBe('back')
  })

  it('morphs a sized session title and grows a preview from its thumbnail', async () => {
    usePlayback()
    document.documentElement.setAttribute('data-dsh-motion', '')
    const stopEntries = installMotionEntries(document.body)
    stop = () => { stopEntries(); scene() }
    const scene = installMotionScene(document.body)
    const { content, headerTitle } = sessionChrome('a', 'Alpha')
    const row = document.createElement('div')
    row.setAttribute('data-row-key', 'session:b')
    const title = document.createElement('span')
    const rowTitle = document.createElement('span')
    rowTitle.textContent = 'Beta'
    box(rowTitle, 70, 16)
    row.append(title, rowTitle)
    document.body.append(row)
    await flush()
    content.setAttribute('data-conversation-session', 'b')
    headerTitle.textContent = 'Beta'
    await flush()
    expect(played.length).toBeGreaterThan(0)
    expect(headerTitle.style.opacity).toBe('0')
    played[0]?.onfinish?.()
    expect(headerTitle.style.opacity).toBe('')

    played.length = 0
    const thumb = document.createElement('img')
    thumb.src = 'blob:pic'
    box(thumb, 24, 24)
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    const preview = document.createElement('img')
    preview.src = 'blob:pic'
    box(preview, 200, 120)
    dialog.append(preview)
    document.body.append(thumb, dialog)
    await flush()
    expect(dialog.getAttribute('data-dsh-shell-enter')).toBe('fade')
    expect(played.length).toBeGreaterThan(0)
    expect(thumb.style.opacity).toBe('')
    const beforeClose = played.length
    dialog.remove()
    await flush()
    expect(played.length).toBeGreaterThan(beforeClose)
  })

  it('waits for a preview box and stays still when shared is off or the thumb is missing', async () => {
    usePlayback()
    document.documentElement.setAttribute('data-dsh-motion', '')
    stop = installMotionScene(document.body)
    const thumb = document.createElement('img')
    thumb.src = 'blob:late'
    box(thumb, 20, 20)
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    const preview = document.createElement('img')
    preview.src = 'blob:late'
    dialog.append(preview)
    document.body.append(thumb, dialog)
    await flush()
    expect(played).toHaveLength(0)
    expect(dialog.getAttribute('data-dsh-shell-enter')).toBe('fade')
    box(preview, 80, 40)
    preview.dispatchEvent(new Event('load'))
    expect(played.length).toBeGreaterThan(0)

    played.length = 0
    document.documentElement.setAttribute('data-dsh-motion-off', 'shared')
    const { content } = sessionChrome('a', 'Alpha')
    await flush()
    content.setAttribute('data-conversation-session', 'z')
    await flush()
    expect(content.hasAttribute('data-dsh-shell-nav')).toBe(false)
    const plain = document.createElement('div')
    plain.setAttribute('role', 'dialog')
    plain.setAttribute('aria-modal', 'true')
    plain.append(document.createElement('img'))
    document.body.append(plain)
    await flush()
    expect(plain.hasAttribute('data-dsh-shell-enter')).toBe(false)
  })
})
