/**
 * Transcript entrances on the pinned 0.2.1-rc.3 chat anchors.
 * A loaded history batch, a queued `li`, and a text mismatch stay on the end state.
 */

import { morphShared, playVerticalSwap } from './motion-flight.ts'
import { motionComponentOn } from './motion-switch.ts'

const COMMAND = '[data-chat-flow-kind="command"]'
const FLOW = '[data-chat-flow-kind]'
const ECHO = '[data-submission-echo]'
const BUBBLE = '[data-chat-flow-kind="user"], [data-chat-flow-kind="steering"]'
const COMPOSER = '[data-composer-input]'

interface Draft {
  rect: DOMRect
  clone: HTMLElement
}

/**
 * Watch one subtree for command rows, composer echoes, and echo handoffs.
 * @param root - subtree that contains the composer and the chat rows. `null` does nothing.
 * @returns a disposer that stops the watch.
 */
export function installMotionTranscript(root: ParentNode | null): () => void {
  const view = viewOf(root)
  if (root === null || view === null) return () => {}
  const doc = view.document
  const echoRects = new WeakMap<HTMLElement, DOMRect>()
  const tracked = new Set<HTMLElement>()
  let draft: Draft | null = null

  const rememberEcho = (echo: HTMLElement): void => {
    if (!echo.isConnected) return
    const rect = echo.getBoundingClientRect()
    if (rect.width >= 1 && rect.height >= 1) echoRects.set(echo, rect)
  }

  const rememberDraft = (): void => {
    const composer = doc.querySelector<HTMLElement>(COMPOSER)
    if (composer === null || composer.textContent.trim() === '') return
    const rect = composer.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return
    draft = { rect, clone: composer.cloneNode(true) as HTMLElement }
  }

  const onScroll = (): void => {
    for (const echo of tracked) rememberEcho(echo)
  }
  doc.addEventListener('scroll', onScroll, true)
  view.addEventListener('resize', onScroll)
  doc.addEventListener('input', rememberDraft, true)

  const observer = new MutationObserver((records) => {
    const added = new Set<Node>()
    const commands: HTMLElement[] = []
    const echoes: HTMLElement[] = []
    const bubbles: HTMLElement[] = []
    const removed: HTMLElement[] = []
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement)) continue
        added.add(node)
        collect(node, commands, echoes, bubbles)
      }
      for (const node of record.removedNodes) {
        if (!(node instanceof HTMLElement)) continue
        if (node.matches(ECHO) && node.tagName !== 'LI') removed.push(node)
        for (const echo of node.querySelectorAll<HTMLElement>(ECHO)) {
          if (echo.tagName !== 'LI') removed.push(echo)
        }
      }
    }
    for (const echo of echoes) {
      if (echo.tagName === 'LI') continue
      tracked.add(echo)
      rememberEcho(echo)
    }
    const transcript = motionComponentOn(doc, 'transcript')
    const shared = motionComponentOn(doc, 'shared')
    if (transcript && commands.length === 1 && addedFlowCount(added) === 1) {
      for (const command of commands) {
        if (entersLive(command, added)) command.setAttribute('data-dsh-shell-enter', 'command')
      }
    }
    const arriving = echoes.filter((echo) => echo.tagName !== 'LI' && echo.isConnected)
    const composer = doc.querySelector<HTMLElement>(COMPOSER)
    const cleared = composer === null || composer.textContent.trim() === ''
    const saved = draft
    if (shared && arriving.length === 1 && saved !== null && cleared && draftMatches(saved, arriving[0])) {
      const echo = arriving[0]
      if (echo !== undefined) {
        const holder = placeHolder(view, saved.clone, saved.rect)
        morphShared(holder, echo)
        holder.remove()
        draft = null
      }
    }
    if (transcript && removed.length === 1 && bubbles.length === 1) {
      const echo = removed[0]
      const bubble = bubbles[0]
      const rect = echo === undefined ? undefined : echoRects.get(echo)
      if (echo !== undefined && bubble !== undefined && rect !== undefined) {
        const holder = placeHolder(view, echo, rect)
        playVerticalSwap(holder, bubble)
        holder.remove()
      }
    }
    for (const echo of removed) tracked.delete(echo)
  })
  observer.observe(root, { childList: true, subtree: true })
  return () => {
    observer.disconnect()
    doc.removeEventListener('scroll', onScroll, true)
    view.removeEventListener('resize', onScroll)
    doc.removeEventListener('input', rememberDraft, true)
    tracked.clear()
    draft = null
  }
}

function viewOf(root: ParentNode | null): Window | null {
  if (root === null) return null
  if (root instanceof Document) return root.defaultView
  return root.ownerDocument?.defaultView ?? null
}

function collect(node: HTMLElement, commands: HTMLElement[], echoes: HTMLElement[], bubbles: HTMLElement[]): void {
  const seen: HTMLElement[] = []
  if (node.matches(`${COMMAND}, ${ECHO}, ${BUBBLE}`)) seen.push(node)
  for (const child of node.querySelectorAll<HTMLElement>(`${COMMAND}, ${ECHO}, ${BUBBLE}`)) seen.push(child)
  for (const element of seen) {
    if (element.matches(COMMAND)) commands.push(element)
    if (element.matches(ECHO)) echoes.push(element)
    if (element.matches(BUBBLE)) bubbles.push(element)
  }
}

function addedFlowCount(added: Set<Node>): number {
  let count = 0
  for (const node of added) {
    if (!(node instanceof HTMLElement)) continue
    if (node.matches(FLOW)) count += 1
    count += node.querySelectorAll(FLOW).length
  }
  return count
}

/** A live command is one new flow row after a row that was already on screen. */
function entersLive(node: HTMLElement, added: Set<Node>): boolean {
  const inserted = insertionRoot(node, added)
  if (!hasSettledFlowBefore(inserted, added)) return false
  let sibling = inserted.nextElementSibling
  while (sibling !== null) {
    if (!added.has(sibling) && sibling.matches(FLOW)) return false
    sibling = sibling.nextElementSibling
  }
  return true
}

function hasSettledFlowBefore(inserted: HTMLElement, added: Set<Node>): boolean {
  let sibling = inserted.previousElementSibling
  while (sibling !== null) {
    if (!added.has(sibling) && sibling.matches(FLOW)) return true
    sibling = sibling.previousElementSibling
  }
  return false
}

function insertionRoot(node: HTMLElement, added: Set<Node>): HTMLElement {
  let current = node
  for (;;) {
    if (added.has(current)) return current
    const parent = current.parentElement
    if (parent === null) return current
    current = parent
  }
}

function draftMatches(draft: Draft, echo: HTMLElement | undefined): boolean {
  if (echo === undefined) return false
  const sent = draft.clone.textContent.trim()
  return sent !== '' && echo.textContent.includes(sent)
}

function placeHolder(view: Window, source: HTMLElement, rect: DOMRect): HTMLElement {
  const holder = source.cloneNode(true) as HTMLElement
  holder.style.position = 'fixed'
  holder.style.left = `${String(rect.left)}px`
  holder.style.top = `${String(rect.top)}px`
  holder.style.width = `${String(rect.width)}px`
  holder.style.height = `${String(rect.height)}px`
  holder.style.margin = '0'
  holder.style.opacity = '1'
  holder.style.pointerEvents = 'none'
  view.document.body.append(holder)
  return holder
}
