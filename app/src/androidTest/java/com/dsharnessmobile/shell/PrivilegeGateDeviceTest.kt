package com.dsharnessmobile.shell

import android.content.Intent
import android.content.pm.PackageManager
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * G5 权限门禁的设备面断言。**不是「能起来就算过」**，观察点全部落在
 * `PackageManager` 的真实解析结果与门禁判据的真实输入上。
 *
 * | 用例 | 观察点 |
 * |---|---|
 * | `repairActivityIsNotExported` | `getActivityInfo(.RepairActivity).exported == false` |
 * | `privilegedLauncherActionsNoLongerResolve` | 两个已移除的旧 action 经 `queryIntentActivities` **解析不到任何组件** |
 * | `automaticStartupStaysBlockedWhenRepairRequired` | 用**设备上真实的 `RepairState.required(ctx)`** 作输入调 `startupEntryDecision`，required 时必须 `BLOCKED_FOR_REPAIR` |
 * | `explicitUserRetryIsTheOnlyWayPastTheGate` | 同一 required 状态下 `explicitUserRetry = true` 必须 `START`（iff 关系，不是单向） |
 *
 * 第三条/第四条是本组核心：只用纯函数、不用真实状态会变成「单测搬家」；
 * 这里把设备上真实的 repair 闸门状态喂进去，才是设备面。
 *
 * ## 真机写操作
 *
 * **无。** 只读 PackageManager / 只读 RepairState。不改闸门、不落盘、不装卸包。
 */
@RunWith(AndroidJUnit4::class)
class PrivilegeGateDeviceTest {

  private val ctx get() = InstrumentationRegistry.getInstrumentation().targetContext

  @Test
  fun repairActivityIsNotExported() {
    val info = ctx.packageManager.getActivityInfo(
      android.content.ComponentName(ctx.packageName, "com.dsharnessmobile.shell.RepairActivity"),
      0,
    )
    assertFalse(
      ".RepairActivity 必须 exported=false（外部应用不得直接拉起修复助手）",
      info.exported,
    )
  }

  @Test
  fun privilegedLauncherActionsNoLongerResolve() {
    // #682：这两个 action 曾是 launcher Activity 上的特权入口，外部应用可构造显式 intent 冒充。
    val removed = listOf(
      "com.dsharnessmobile.shell.ACTION_UPDATE",
      "com.dsharnessmobile.shell.ACTION_RETRY_ENGINE",
    )
    for (action in removed) {
      val resolved = ctx.packageManager.queryIntentActivities(
        Intent(action).setPackage(ctx.packageName), 0,
      )
      assertTrue(
        "已移除的特权 action 不得再解析到任何组件：" + action + " -> " + resolved.map { it.activityInfo.name },
        resolved.isEmpty(),
      )
    }
  }

  @Test
  fun automaticStartupStaysBlockedWhenRepairRequired() {
    val required = RepairState.required(ctx)
    val decision = startupEntryDecision(required = required, explicitUserRetry = false)
    if (required) {
      assertEquals(
        "设备 repair 闸门已置位时，自动启动必须被拦住进入修复引导",
        StartupEntryDecision.BLOCKED_FOR_REPAIR, decision,
      )
    } else {
      assertEquals(
        "闸门未置位时自动启动应放行（防止把「永远拦住」当成本用例通过）",
        StartupEntryDecision.START, decision,
      )
    }
  }

  @Test
  fun explicitUserRetryIsTheOnlyWayPastTheGate() {
    val required = RepairState.required(ctx)
    val withRetry = startupEntryDecision(required = required, explicitUserRetry = true)
    assertEquals("显式用户重试必须放行（唯一能过闸门的入口）", StartupEntryDecision.START, withRetry)
    if (required) {
      assertEquals(
        "同一状态下不带重试必须拦住 —— 两条合起来才是 iff，而不是单向断言",
        StartupEntryDecision.BLOCKED_FOR_REPAIR,
        startupEntryDecision(required = true, explicitUserRetry = false),
      )
    }
  }
}
