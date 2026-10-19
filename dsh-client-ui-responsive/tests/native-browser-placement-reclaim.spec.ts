// @vitest-environment jsdom
// Issue #423-2：会话标签与 GUI 记录都消失后，自动对账不得永久轮询旧会话。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeBrowserPlacement } from '../src/client/mobile/native-browser-auto-place.ts'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

const A = 'session-a' as SessionId
const EMPTY = JSON.stringify({
  ok: true, available: true, session: A, profileAvailable: true, profileReason: '',
  tabs: [], authoritativeTabs: true,
})

afterEach(() => {
  delete window.androidBridge
  vi.restoreAllMocks()
})

describe('native browser placement workspace lifecycle', () => {
  it('drops a Session after its native tabs disappear and layout has no occurrence', () => {
    let sessions: SessionId[] = [A]
    let tabs: Array<{ sessionId: SessionId; tabId: TabId; kind: string }> = []
    const command = vi.fn(() => EMPTY)
    window.androidBridge = { browserHostCommand: command }
    const placement = new NativeBrowserPlacement({
      sessions: () => sessions,
      tabs: () => tabs,
      mounted: () => undefined,
      expanded: () => false,
      open: () => {},
      close: () => {},
      kind: 'android-browser',
      legacyKind: 'android-browser-legacy',
    })

    expect(placement.for(A)).toBeDefined()
    sessions = []
    tabs = []
    vi.clearAllMocks()
    placement.tick()
    expect(placement.workspaceSessions()).toEqual([])
    const calls = command.mock.calls.length
    placement.tick()
    expect(command.mock.calls.length).toBe(calls)
    placement.dispose()
  })

  it('keeps polling a Session while layout still owns one of its tabs', () => {
    const command = vi.fn(() => EMPTY)
    window.androidBridge = { browserHostCommand: command }
    const placement = new NativeBrowserPlacement({
      sessions: () => [],
      tabs: () => [{ sessionId: A, tabId: 'ui-a' as TabId, kind: 'android-browser' }],
      mounted: () => undefined,
      expanded: () => false,
      open: () => {},
      close: () => {},
      kind: 'android-browser',
      legacyKind: 'android-browser-legacy',
    })
    placement.tick()
    expect(placement.workspaceSessions()).toEqual([A])
    placement.dispose()
  })
})
