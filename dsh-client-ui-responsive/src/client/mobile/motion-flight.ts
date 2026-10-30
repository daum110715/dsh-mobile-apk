/**
 * Shared-element playback for the pinned Web UI.
 * Chromium 87: Web Animations on `transform`, `opacity`, and the ghost's `border-radius` only.
 * A missing side, a zero-size box, or a missing `animate` leaves the end state alone.
 */

const SHARED_MS = 480
const SHARED_EXIT_MS = 336
const EXIT_MS = 168
const ENTER_MS = 240
const EASE_MOVE = 'cubic-bezier(0.2, 0, 0, 1)'
const EASE_EXIT = 'cubic-bezier(0.3, 0, 0.8, 0.15)'
const EASE_ENTER = 'cubic-bezier(0.05, 0.7, 0.1, 1)'

const flights = new WeakMap<HTMLElement, () => void>()

/**
 * Move a shell from one element to another.
 * The shell interpolates position, size, and corner radius. The source text stays unscaled and fades.
 * @param from - source element. A missing or zero-size source skips the morph.
 * @param to - destination element. A missing, disconnected, or zero-size destination skips the morph.
 * @returns false when the morph does not start.
 */
export function morphShared(from: HTMLElement | null, to: HTMLElement | null): boolean {
  const view = to?.ownerDocument.defaultView ?? null
  if (from === null || to === null || !to.isConnected || view === null || !canAnimate(to)) return false
  const fromRect = from.getBoundingClientRect()
  const toRect = to.getBoundingClientRect()
  if (fromRect.width < 1 || fromRect.height < 1 || toRect.width < 1 || toRect.height < 1) return false
  flights.get(to)?.()
  const shell = shellAt(view, toRect, getComputedStyle(to).backgroundColor)
  const sourceClone = from.cloneNode(true) as HTMLElement
  conceal(sourceClone)
  sourceClone.style.position = 'fixed'
  sourceClone.style.left = `${String(fromRect.left)}px`
  sourceClone.style.top = `${String(fromRect.top)}px`
  sourceClone.style.width = `${String(fromRect.width)}px`
  sourceClone.style.height = `${String(fromRect.height)}px`
  sourceClone.style.margin = '0'
  sourceClone.style.transform = 'none'
  sourceClone.style.zIndex = '1201'
  view.document.body.append(sourceClone)
  const previousOpacity = to.style.opacity
  to.style.opacity = '0'
  const options: KeyframeAnimationOptions = { duration: SHARED_MS, easing: EASE_MOVE, fill: 'forwards' }
  const shellAnimation = shell.animate(shellFrames(from, to, fromRect, toRect, '1'), options)
  const fadeOut = sourceClone.animate([{ opacity: 1 }, { opacity: 0 }], options)
  const fadeIn = to.animate([{ opacity: 0 }, { opacity: 1 }], options)
  track(to, () => {
    shellAnimation.cancel()
    fadeOut.cancel()
    fadeIn.cancel()
    shell.remove()
    sourceClone.remove()
    to.style.opacity = previousOpacity
  }, shellAnimation, view)
  return true
}

/**
 * Grow an image shell from a thumbnail to a preview and crossfade the preview in.
 * The image scales with the shell. A missing or zero-size side does nothing.
 * @param from - thumbnail. A missing or zero-size thumbnail skips the morph.
 * @param to - preview image. A missing or zero-size preview skips the morph.
 * @returns false when the morph does not start.
 */
export function morphImage(from: HTMLElement | null, to: HTMLElement | null): boolean {
  const view = to?.ownerDocument.defaultView ?? null
  if (from === null || to === null || !to.isConnected || view === null || !canAnimate(to)) return false
  const fromRect = from.getBoundingClientRect()
  const toRect = to.getBoundingClientRect()
  if (fromRect.width < 1 || fromRect.height < 1 || toRect.width < 1 || toRect.height < 1) return false
  flights.get(to)?.()
  const shell = pictureShell(view, from, toRect)
  const previousOpacity = to.style.opacity
  to.style.opacity = '0'
  const options: KeyframeAnimationOptions = { duration: SHARED_MS, easing: EASE_MOVE, fill: 'forwards' }
  const shellAnimation = shell.animate(shellFrames(from, to, fromRect, toRect, '0'), options)
  const fadeIn = to.animate([{ opacity: 0 }, { opacity: 1 }], options)
  track(to, () => {
    shellAnimation.cancel()
    fadeIn.cancel()
    shell.remove()
    to.style.opacity = previousOpacity
  }, shellAnimation, view)
  return true
}

/**
 * Glide an image shell toward a thumbnail and fade the shell out.
 * The thumbnail stays visible. A zero-size side does nothing.
 * @param view - window that owns the ghosts.
 * @param fromRect - preview box captured while the preview was on screen.
 * @param picture - image to clone into the shell. It may already be disconnected.
 * @param to - thumbnail that remains on screen.
 * @returns false when the glide does not start.
 */
export function glideImage(
  view: Window,
  fromRect: DOMRect,
  picture: HTMLElement,
  to: HTMLElement,
): boolean {
  if (!canAnimate(to)) return false
  const toRect = to.getBoundingClientRect()
  if (fromRect.width < 1 || fromRect.height < 1 || toRect.width < 1 || toRect.height < 1) return false
  const shell = pictureShell(view, picture, toRect)
  const animation = shell.animate(
    shellFrames(picture, to, fromRect, toRect, '0'),
    { duration: SHARED_EXIT_MS, easing: EASE_EXIT, fill: 'forwards' },
  )
  const drop = (): void => { shell.remove() }
  animation.onfinish = drop
  animation.oncancel = drop
  return true
}

/**
 * Replace one element with another on the vertical axis.
 * The outgoing copy moves up. The incoming element moves up into place.
 * @param outgoing - element leaving. A missing or zero-size element is skipped.
 * @param incoming - element arriving. A missing element stays at its end state.
 * @returns true when at least one side animates.
 */
export function playVerticalSwap(outgoing: HTMLElement | null, incoming: HTMLElement | null): boolean {
  let played = false
  if (outgoing !== null) {
    const rect = outgoing.getBoundingClientRect()
    const view = outgoing.ownerDocument.defaultView
    if (view !== null && rect.width >= 1 && rect.height >= 1 && canAnimate(outgoing)) {
      const ghost = outgoing.cloneNode(true) as HTMLElement
      conceal(ghost)
      ghost.style.position = 'fixed'
      ghost.style.left = `${String(rect.left)}px`
      ghost.style.top = `${String(rect.top)}px`
      ghost.style.width = `${String(rect.width)}px`
      ghost.style.height = `${String(rect.height)}px`
      ghost.style.margin = '0'
      ghost.style.zIndex = '1200'
      view.document.body.append(ghost)
      const animation = ghost.animate(
        [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-8px)' }],
        { duration: EXIT_MS, easing: EASE_EXIT, fill: 'forwards' },
      )
      const drop = (): void => { ghost.remove() }
      animation.onfinish = drop
      animation.oncancel = drop
      played = true
    }
  }
  if (incoming !== null && incoming.isConnected && canAnimate(incoming)) {
    const animation = incoming.animate(
      [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: ENTER_MS, easing: EASE_ENTER, fill: 'forwards' },
    )
    animation.onfinish = () => { animation.cancel() }
    played = true
  }
  return played
}

function canAnimate(node: Element): boolean {
  return node.ownerDocument.defaultView !== null && typeof node.animate === 'function'
}

function conceal(root: HTMLElement): void {
  root.removeAttribute('id')
  root.removeAttribute('role')
  root.removeAttribute('aria-modal')
  root.setAttribute('aria-hidden', 'true')
  root.setAttribute('data-dsh-shell-ghost', '')
  root.style.pointerEvents = 'none'
  for (const node of root.querySelectorAll<HTMLElement>('[id], [role], [aria-modal]')) {
    node.removeAttribute('id')
    node.removeAttribute('role')
    node.removeAttribute('aria-modal')
  }
}

function shellAt(view: Window, rect: DOMRect, background: string): HTMLElement {
  const shell = view.document.createElement('div')
  shell.setAttribute('data-dsh-shell-ghost', '')
  shell.setAttribute('aria-hidden', 'true')
  shell.style.position = 'fixed'
  shell.style.left = '0'
  shell.style.top = '0'
  shell.style.width = `${String(rect.width)}px`
  shell.style.height = `${String(rect.height)}px`
  shell.style.transformOrigin = '0 0'
  shell.style.pointerEvents = 'none'
  shell.style.overflow = 'hidden'
  shell.style.zIndex = '1200'
  shell.style.background = background
  view.document.body.append(shell)
  return shell
}

function pictureShell(view: Window, picture: HTMLElement, toRect: DOMRect): HTMLElement {
  const shell = shellAt(view, toRect, getComputedStyle(picture).backgroundColor)
  const clone = picture.cloneNode(true) as HTMLElement
  conceal(clone)
  clone.style.width = '100%'
  clone.style.height = '100%'
  clone.style.margin = '0'
  clone.style.opacity = '1'
  clone.style.transform = 'none'
  shell.append(clone)
  return shell
}

function shellFrames(
  from: HTMLElement,
  to: HTMLElement,
  fromRect: DOMRect,
  toRect: DOMRect,
  endOpacity: string,
): Keyframe[] {
  const sx = fromRect.width / toRect.width
  const sy = fromRect.height / toRect.height
  return [
    {
      transform: `translate(${String(fromRect.left)}px, ${String(fromRect.top)}px) scale(${String(sx)}, ${String(sy)})`,
      borderRadius: radiusOf(from),
      opacity: 1,
    },
    {
      transform: `translate(${String(toRect.left)}px, ${String(toRect.top)}px) scale(1, 1)`,
      borderRadius: radiusOf(to),
      opacity: endOpacity,
    },
  ]
}

function radiusOf(node: HTMLElement): string {
  const radius = getComputedStyle(node).borderRadius
  return radius === '' ? '0px' : radius
}

function track(
  target: HTMLElement,
  release: () => void,
  animation: Animation,
  view: Window,
): void {
  let cleaned = false
  const finish = (): void => {
    if (cleaned) return
    cleaned = true
    view.clearTimeout(timer)
    observer.disconnect()
    if (flights.get(target) === finish) flights.delete(target)
    release()
  }
  flights.set(target, finish)
  const observer = new MutationObserver(() => {
    if (!target.isConnected) finish()
  })
  observer.observe(view.document.body, { childList: true, subtree: true })
  const timer = view.setTimeout(finish, SHARED_MS + 32)
  animation.onfinish = finish
  animation.oncancel = finish
}
