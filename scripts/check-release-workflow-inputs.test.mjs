import assert from 'node:assert/strict'
import { test } from 'node:test'
import { directVersionInterpolations, hasSafeEnvHandoff } from './check-release-workflow-inputs.mjs'

test('rejects direct version interpolation in shell', () => {
  assert.deepEqual(directVersionInterpolations('run: [ "$VER" = "${{ inputs.version }}" ]'),
    ['1: run: [ "$VER" = "${{ inputs.version }}" ]'])
})

test('accepts env handoff and artifact name expressions', () => {
  const text = 'env:\n  VERSION: ${{ inputs.version }}\nrun: test "$VER" = "$VERSION"\nname: release-v${{ inputs.version }}'
  assert.deepEqual(directVersionInterpolations(text), [])
  assert.equal(hasSafeEnvHandoff(text), true)
})
