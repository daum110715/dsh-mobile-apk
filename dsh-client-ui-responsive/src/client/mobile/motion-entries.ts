/**
 * Mark overlays and lists that appear after this watcher starts.
 * Already-painted history is left alone. A list is marked once, when its element is added.
 */

const OVERLAY = '[role="menu"], [role="dialog"][aria-modal="true"]'
const LIST = '[role="tree"], [role="listbox"]'
const ENTER_ATTR = 'data-dsh-shell-enter'
const STAGGER_ATTR = 'data-dsh-shell-stagger'

/**
 * Watch one subtree for menus, dialogs, and lists.
 * @param root - subtree to watch. `null` does nothing.
 * @returns a disposer that stops the watch.
 */
export function installMotionEntries(root: ParentNode | null): () => void {
  const view = viewOf(root)
  if (root === null || view === null) return () => {}
  const doc = view.document
  const observer = new MutationObserver((records) => {
    if (!doc.documentElement.hasAttribute('data-dsh-motion')) return
    for (const record of records) {
      for (const added of record.addedNodes) markTree(added)
    }
  })
  observer.observe(root, { childList: true, subtree: true })
  return () => { observer.disconnect() }
}

/** Mark one added node and the overlays or lists inside it. */
function markTree(node: Node): void {
  if (!(node instanceof Element)) return
  mark(node)
  const found = node.querySelectorAll<Element>(`${OVERLAY}, ${LIST}`)
  for (const item of found) mark(item)
}

/** One overlay grows or fades. One newly mounted list staggers at most its first paint. */
function mark(node: Element): void {
  if (node.matches(OVERLAY) && !node.hasAttribute(ENTER_ATTR)) {
    node.setAttribute(ENTER_ATTR, node instanceof HTMLElement && node.style.transform !== '' ? 'fade' : 'pop')
  }
  if (node.matches(LIST) && !node.hasAttribute(STAGGER_ATTR) && node.childElementCount > 0) {
    node.setAttribute(STAGGER_ATTR, '')
  }
}

function viewOf(root: ParentNode | null): Window | null {
  if (root === null) return null
  if (root instanceof Document) return root.defaultView
  return root.ownerDocument?.defaultView ?? null
}
