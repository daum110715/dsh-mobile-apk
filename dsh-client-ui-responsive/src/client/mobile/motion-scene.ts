/**
 * Session changes and image previews on pinned 0.2.1-rc.3 anchors.
 * The first shown session, a missing title, and a missing thumbnail stay on the end state.
 * The session title anchor is the second span under `[data-row-key="session:<id>"]`.
 * The header title is the last text span in `[data-slot="conversation.session.header"] nav`.
 */

import { glideImage, morphImage, morphShared } from './motion-flight.ts'
import { motionComponentOn } from './motion-switch.ts'

const CONTENT = '[data-conversation-content]'
const NAV = 'data-dsh-shell-nav'
const DIALOG = '[role="dialog"][aria-modal="true"]'

interface OpenPreview {
  dialog: HTMLElement
  preview: HTMLImageElement
  thumb: HTMLImageElement
  rect: DOMRect
}

/**
 * Watch session changes and image previews.
 * @param root - subtree to watch. `null` does nothing.
 * @returns a disposer that stops the watch.
 */
export function installMotionScene(root: ParentNode | null): () => void {
  const found = viewOf(root)
  if (root === null || found === null) return () => {}
  const view: Window = found
  const doc = view.document
  let current = ''
  const stack: string[] = []
  const open: OpenPreview[] = []

  const seed = doc.querySelector<HTMLElement>(CONTENT)
  const seeded = seed?.getAttribute('data-conversation-session') ?? ''
  if (seeded !== '') {
    current = seeded
    stack.push(seeded)
  }

  const onScroll = (): void => {
    for (const item of open) {
      if (!item.preview.isConnected) continue
      const rect = item.preview.getBoundingClientRect()
      if (rect.width >= 1 && rect.height >= 1) item.rect = rect
    }
  }
  doc.addEventListener('scroll', onScroll, true)
  view.addEventListener('resize', onScroll)

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes' && record.target instanceof HTMLElement && record.target.matches(CONTENT)) {
        onSession(record.target.getAttribute('data-conversation-session') ?? '', record.target)
      }
      for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement)) continue
        const contents = node.matches(CONTENT) ? [node] : [...node.querySelectorAll<HTMLElement>(CONTENT)]
        for (const content of contents) onSession(content.getAttribute('data-conversation-session') ?? '', content)
        const dialogs = node.matches(DIALOG) ? [node] : [...node.querySelectorAll<HTMLElement>(DIALOG)]
        for (const dialog of dialogs) openPreview(dialog)
      }
    }
    for (const item of [...open]) {
      if (!item.dialog.isConnected) closePreview(item)
    }
  })
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-conversation-session'] })

  return () => {
    observer.disconnect()
    doc.removeEventListener('scroll', onScroll, true)
    view.removeEventListener('resize', onScroll)
    open.length = 0
  }

  function onSession(id: string, content: HTMLElement): void {
    if (id === '' || id === current) return
    if (current === '') {
      current = id
      stack.push(id)
      return
    }
    const previous = stack.length >= 2 ? stack[stack.length - 2] : undefined
    const direction = previous === id ? 'back' : 'forward'
    if (direction === 'back') stack.pop()
    else stack.push(id)
    current = id
    if (!motionComponentOn(doc, 'shared')) return
    content.removeAttribute(NAV)
    void content.offsetWidth
    content.setAttribute(NAV, direction)
    const from = rowTitle(doc, id)
    const to = headerTitle(doc)
    if (from !== null && to !== null) morphShared(from, to)
  }

  function openPreview(dialog: HTMLElement): void {
    if (!motionComponentOn(doc, 'shared')) return
    const preview = dialog.querySelector('img')
    if (!(preview instanceof HTMLImageElement)) return
    const thumb = otherImage(preview)
    if (thumb === null) return
    dialog.setAttribute('data-dsh-shell-enter', 'fade')
    const start = (): void => {
      const rect = preview.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return
      if (morphImage(thumb, preview)) {
        open.push({ dialog, preview, thumb, rect })
      }
    }
    const rect = preview.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) preview.addEventListener('load', start, { once: true })
    else start()
  }

  function closePreview(item: OpenPreview): void {
    const index = open.indexOf(item)
    if (index >= 0) open.splice(index, 1)
    if (!motionComponentOn(doc, 'shared') || !item.thumb.isConnected) return
    glideImage(view, item.rect, item.preview, item.thumb)
  }
}

function viewOf(root: ParentNode | null): Window | null {
  if (root === null) return null
  if (root instanceof Document) return root.defaultView
  return root.ownerDocument?.defaultView ?? null
}

/** Second span under the session row. That is the title span in 0.2.1-rc.3. */
function rowTitle(doc: Document, id: string): HTMLElement | null {
  for (const row of doc.querySelectorAll<HTMLElement>('[data-row-key]')) {
    if (row.getAttribute('data-row-key') !== `session:${id}`) continue
    let span = 0
    for (const child of row.children) {
      if (child.tagName !== 'SPAN') continue
      span += 1
      if (span === 2 && child instanceof HTMLElement) return child
    }
  }
  return null
}

/** Last text span in the session header nav. A separator slash is skipped. */
function headerTitle(doc: Document): HTMLElement | null {
  const nav = doc.querySelector('[data-slot="conversation.session.header"] nav')
  if (nav === null) return null
  const segments = [...nav.children]
  const last = segments[segments.length - 1]
  if (!(last instanceof HTMLElement)) return null
  const text = last.textContent.trim()
  if (last.children.length === 0 && text !== '' && text !== '/') return last
  const leaves = [...last.querySelectorAll('span, button')]
  for (let index = leaves.length - 1; index >= 0; index -= 1) {
    const leaf = leaves[index]
    if (!(leaf instanceof HTMLElement) || leaf.children.length > 0) continue
    const leafText = leaf.textContent.trim()
    if (leafText === '' || leafText === '/') continue
    return leaf
  }
  return null
}

function otherImage(preview: HTMLImageElement): HTMLImageElement | null {
  const src = preview.getAttribute('src')
  if (src === null || src === '') return null
  for (const candidate of preview.ownerDocument.querySelectorAll('img')) {
    if (!(candidate instanceof HTMLImageElement) || candidate === preview) continue
    if (candidate.getAttribute('src') !== src || !candidate.isConnected) continue
    const rect = candidate.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) continue
    return candidate
  }
  return null
}
