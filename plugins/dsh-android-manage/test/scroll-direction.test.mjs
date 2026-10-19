import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contentSwipe } from '../lib/scroll-direction.js'

const AREA = { x1: 0, y1: 0, x2: 100, y2: 200 }
const POINTS = { up: [[50, 60], [50, 180]], down: [[50, 140], [50, 20]],
  left: [[70, 100], [10, 100]], right: [[30, 100], [90, 100]] }

test('public scroll direction is content movement on both axes', () => {
  for (const direction of Object.keys(POINTS)) {
    const result = contentSwipe(direction, AREA, 0.6)
    assert.deepEqual([result.from, result.to], POINTS[direction], direction)
  }
})

test('reverse control proves every direction changes the swipe sign', () => {
  for (const direction of Object.keys(POINTS)) {
    const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' }[direction]
    const forward = contentSwipe(direction, AREA, 0.6)
    const reverse = contentSwipe(opposite, AREA, 0.6)
    assert.ok((forward.to[0] - forward.from[0]) * (reverse.to[0] - reverse.from[0])
      + (forward.to[1] - forward.from[1]) * (reverse.to[1] - reverse.from[1]) < 0,
    direction + ' 与反向手势必须相反')
  }
})
