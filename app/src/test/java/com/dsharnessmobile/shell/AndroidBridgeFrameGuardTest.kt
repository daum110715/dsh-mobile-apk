package com.dsharnessmobile.shell

import java.lang.reflect.InvocationTargetException
import java.lang.reflect.Method
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * #686 回归：androidBridge 的每一个 `@JavascriptInterface` 入口都必须过顶层帧来源门禁。
 *
 * 缺陷形态：`addJavascriptInterface` 把桥对象暴露给**每一个 frame**，而导航闸门
 * （`shouldOverrideUrlLoading`）只拦主帧——不可信来源此前拿到完整能力面。
 * 修法：全部入口统一过 [AndroidBridge.trusted] / `checkTrustedFrame()`（fail-closed：
 * isTrustedTopFrame 默认 `{ false }`，未接线即拒）。
 *
 * sweep 判据：反射取全部 `@JavascriptInterface` 方法，在**默认构造**（门禁恒拒）下
 * 逐个调用——任何一个不抛 [AndroidBridge.BridgeFrameDenied] 即为漏网入口。参数全部用
 * 哑元：门禁在参数被使用之前抛出，哑元永远到不了业务体。
 *
 * 反证（本类必须能红）：给任何 `@JavascriptInterface` 方法去掉 trusted/checkTrustedFrame
 * 包裹，sweep 立刻红。
 */
class AndroidBridgeFrameGuardTest {

  private fun interfaceMethods(): List<Method> =
    AndroidBridge::class.java.declaredMethods
      .filter { it.isAnnotationPresent(android.webkit.JavascriptInterface::class.java) }
      .sortedBy { it.name }

  /** 按参数类型造哑元：门禁在任何参数被消费之前就抛出，值本身永远不被业务体看到。 */
  private fun dummy(type: Class<*>): Any? = when (type.name) {
    "java.lang.String" -> "x"
    "boolean" -> true
    "double" -> 1.0
    "int" -> 1
    "long" -> 1L
    "float" -> 1.0f
    else -> null
  }

  private fun defaultBridge(): AndroidBridge = AndroidBridge({ _ -> }, { _ -> }, { _, _ -> })

  @Test
  fun sweep_everyBridgeEntryIsGuardedFailClosed() {
    val bridge = defaultBridge()
    val methods = interfaceMethods()
    assertTrue(
      "桥面应当有大量 @JavascriptInterface 方法；数量突变先核对 design.md 的注入口径再调阈值",
      methods.size >= 70,
    )
    for (m in methods) {
      val args = m.parameterTypes.map { dummy(it) }.toTypedArray()
      try {
        m.invoke(bridge, *args)
        fail("漏网入口（未过 #686 门禁）：${m.name}(${m.parameterTypes.joinToString()})")
      } catch (e: InvocationTargetException) {
        val cause = e.cause
        assertTrue(
          "方法 ${m.name} 抛出的不是门禁拒绝而是：$cause",
          cause is AndroidBridge.BridgeFrameDenied,
        )
      }
    }
  }

  @Test
  fun trustedFramePassesThroughToRealDelegate() {
    val pickToken = AndroidBridge({ _ -> }, { _ -> }, { _, _ -> }, pickToken = "pick-tok", isTrustedTopFrame = { true })
    assertEquals("pick-tok", pickToken.getPickToken())
    assertEquals("默认委托真源可达（未接线面回默认值而不是门禁拒绝）", "", pickToken.incomingWorkspacePath())
  }

  @Test
  fun untrustedFrameCannotEvenReadVersion() {
    try {
      defaultBridge().version()
      fail("未接线（fail-closed 默认）的桥不得放行任何入口")
    } catch (expected: AndroidBridge.BridgeFrameDenied) {
      assertTrue(expected.message!!.contains("#686"))
    }
  }

  @Test
  fun guardVerdictFollowsTheWiredPredicateDynamically() {
    var trusted = false
    val bridge = AndroidBridge({ _ -> }, { _ -> }, { _, _ -> }, isTrustedTopFrame = { trusted })
    try {
      bridge.version()
      fail("判据为 false 时必须拒")
    } catch (expected: AndroidBridge.BridgeFrameDenied) {
      // 预期路径
    }
    trusted = true
    assertEquals("判据翻真后同一实例必须放行（按调用时判据动态判定）", BuildConfig.VERSION_NAME, bridge.version())
  }
}
