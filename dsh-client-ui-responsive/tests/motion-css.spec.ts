// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MOTION_CSS } from '../src/client/mobile/motion.css.ts'
import { MOBILE_FORM_CSS } from '../src/client/mobile/mobile-form.css.ts'

const sheet = MOTION_CSS.replace(/\/\*[\s\S]*?\*\//g, '')
const form = MOBILE_FORM_CSS.replace(/\/\*[\s\S]*?\*\//g, '')
const index = readFileSync(join(process.cwd(), 'src', 'client', 'index.ts'), 'utf8')

describe('injected motion sheet', () => {
  it('stays on the Chromium 87 floor and under the component switches', () => {
    expect(sheet).not.toContain(':has(')
    expect(sheet).not.toContain(':is(')
    expect(sheet).not.toContain(':where(')
    expect(sheet).not.toContain('linear(')
    expect(sheet).not.toContain('@starting-style')
    expect(sheet).not.toMatch(/(^|[^\w-])scale\s*:/)
    expect(sheet).toContain('html[data-dsh-motion]')
    expect(sheet).toContain('data-dsh-motion-off~="press"')
    expect(sheet).toContain('data-dsh-motion-off~="overlay"')
    expect(sheet).toContain('data-dsh-motion-off~="list"')
    expect(sheet).toContain(':nth-child(-n+8)')
    expect(sheet).toContain(':nth-child(8)')
    expect(sheet).not.toContain(':nth-child(9)')
    expect(sheet).toContain('transform: scale(0.97)')
    expect(sheet).toContain('cubic-bezier(0.05, 0.7, 0.1, 1)')
    expect(sheet).toContain('cubic-bezier(0.3, 0, 0.8, 0.15)')
  })

  it('retunes the drawer only while motion is on, and still drops the transition while dragging', () => {
    expect(form).toContain('html[data-dsh-motion]:not([data-dsh-motion-off~="drawer"])')
    expect(form).toContain('transform 340ms cubic-bezier(0.05, 0.7, 0.1, 1)')
    expect(form).toContain('transform 238ms cubic-bezier(0.3, 0, 0.8, 0.15)')
    expect(form).toContain('transition: none !important')
    expect(form).not.toContain(':has(')
    expect(index).toContain("injectStyle('motion', MOTION_CSS)")
    expect(index).toContain('installMotionSwitch(globalThis.window)')
    expect(index).toContain('installMotionEntries(globalThis.document.body)')
  })
})
