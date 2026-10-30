/**
 * Master switch for injected motion.
 * `localStorage` `dsh.motion` = `0` or reduced motion clears `data-dsh-motion`.
 * `dsh.motion.off` is a space-separated component list copied to `data-dsh-motion-off`.
 * The default is motion on, so a later upstream animation can be turned off per component
 * without a settings row.
 */

const STORAGE_KEY = 'dsh.motion'
const OFF_KEY = 'dsh.motion.off'
const MOTION_ATTR = 'data-dsh-motion'
const OFF_ATTR = 'data-dsh-motion-off'
const REDUCED_QUERY = '(prefers-reduced-motion: reduce)'

/**
 * Publish the motion switch on the document element.
 * @param view - window that owns the page. `null` does nothing.
 * @returns a disposer that removes the attributes and listeners.
 */
export function installMotionSwitch(view: Window | null): () => void {
  if (view === null) return () => {}
  const root = view.document.documentElement
  const media = typeof view.matchMedia === 'function' ? view.matchMedia(REDUCED_QUERY) : null
  const sync = (): void => {
    const reduced = media?.matches === true
    if (readStorage(view, STORAGE_KEY) === '0' || reduced) root.removeAttribute(MOTION_ATTR)
    else root.setAttribute(MOTION_ATTR, '')
    const off = readStorage(view, OFF_KEY).trim()
    if (off === '') root.removeAttribute(OFF_ATTR)
    else root.setAttribute(OFF_ATTR, off)
  }
  sync()
  media?.addEventListener?.('change', sync)
  view.addEventListener('storage', sync)
  return () => {
    media?.removeEventListener?.('change', sync)
    view.removeEventListener('storage', sync)
    root.removeAttribute(MOTION_ATTR)
    root.removeAttribute(OFF_ATTR)
  }
}

/**
 * Whether one injected component may animate.
 * The master attribute must be present, and the component name must not be listed in `data-dsh-motion-off`.
 * @param doc - document that carries the switch.
 * @param component - component token such as `shared` or `transcript`.
 * @returns false when the master switch is off or this component is listed.
 */
export function motionComponentOn(doc: Document, component: string): boolean {
  const root = doc.documentElement
  if (!root.hasAttribute(MOTION_ATTR)) return false
  const off = (root.getAttribute(OFF_ATTR) ?? '').split(/\s+/).filter((token) => token !== '')
  return !off.includes(component)
}

/** Read one key. Private mode and a missing store leave the value empty. */
function readStorage(view: Window, key: string): string {
  try {
    return view.localStorage.getItem(key) ?? ''
  } catch { /* private storage */
    return ''
  }
}
