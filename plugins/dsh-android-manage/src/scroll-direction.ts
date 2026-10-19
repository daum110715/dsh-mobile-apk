/** Public scroll direction semantics shared by the ADB fallback path. */

export type ScrollDirection = 'up' | 'down' | 'left' | 'right'

/**
 * Convert a content direction to the finger movement used by `input swipe`.
 *
 * `direction` says where the user wants to look: `down` reveals lower content,
 * so the finger moves up. This mirrors the accessibility FORWARD/BACKWARD actions.
 */
export function contentSwipe(
  direction: ScrollDirection,
  area: { x1: number; y1: number; x2: number; y2: number },
  fraction: number,
): { from: [number, number]; to: [number, number] } {
  const sx = area.x1 + Math.floor((area.x2 - area.x1) / 2)
  const sy = area.y1 + Math.floor((area.y2 - area.y1) / 2)
  if (direction === 'down' || direction === 'up') {
    const dy = Math.floor((area.y2 - area.y1) * fraction)
    const fromY = direction === 'down' ? area.y2 - Math.floor(dy / 2) : area.y1 + Math.floor(dy / 2)
    const toY = direction === 'down' ? fromY - dy : fromY + dy
    return { from: [sx, fromY], to: [sx, toY] }
  }
  const dx = Math.floor((area.x2 - area.x1) * fraction)
  const fromX = direction === 'right' ? area.x1 + Math.floor(dx / 2) : area.x2 - Math.floor(dx / 2)
  const toX = direction === 'right' ? fromX + dx : fromX - dx
  return { from: [fromX, sy], to: [toX, sy] }
}
