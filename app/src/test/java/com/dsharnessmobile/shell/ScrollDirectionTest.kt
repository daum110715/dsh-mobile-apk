package com.dsharnessmobile.shell

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Issue #422-6：direction 是内容方向，三条执行路径必须一致。
 *
 * 手势路径的手指方向与内容方向相反；无障碍动作使用 FORWARD/BACKWARD（内容方向）。
 */
class ScrollDirectionTest {
  @Test fun downAndUpRevealLowerAndUpperContent() {
    val down = DeviceControlService.contentGesture("down", 100f, 200f, 0.6f)
    assertPoints(listOf(50f, 160f, 50f, 40f), down)
    val up = DeviceControlService.contentGesture("up", 100f, 200f, 0.6f)
    assertPoints(listOf(50f, 40f, 50f, 160f), up)
  }

  @Test fun rightAndLeftRevealRightAndLeftContent() {
    val right = DeviceControlService.contentGesture("right", 100f, 200f, 0.6f)
    assertPoints(listOf(80f, 100f, 20f, 100f), right)
    val left = DeviceControlService.contentGesture("left", 100f, 200f, 0.6f)
    assertPoints(listOf(20f, 100f, 80f, 100f), left)
  }

  private fun assertPoints(expected: List<Float>, actual: List<Float>) {
    assertEquals(expected.size, actual.size)
    for (index in expected.indices) {
      assertEquals("point $index", expected[index].toDouble(), actual[index].toDouble(), 0.001)
    }
  }
}
