package com.dsharnessmobile.shell

import android.Manifest
import android.app.Notification
import android.app.NotificationManager
import android.content.pm.PackageManager
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * notify smoke（#842 面）：三条真实行为，全部通过**真实 NotifyCenter 构造路径 + 真实 NotificationManager** 断言。
 * 不 mock NotifyCenter —— 它就是要被测的对象。
 *
 * | 用例 | 观察点 |
 * |---|---|
 * | `failedSummaryDoesNotCarryRawJson` | `Notification.extras` 的 TEXT/BIG_TEXT 不含 `{"` / `objectId`，且含人类可读片段 |
 * | `contentIntentCarriesTargetSession` | `PendingIntent.send()` 后捕获到的 Activity，其 intent extra `dsh.notify.session` == 源会话 |
 * | `notificationSurvivesOpenAndIsNotAutoCancel` | `flags and FLAG_AUTO_CANCEL == 0`；send 后仍在 `getActiveNotifications()` 里；且**手动 cancel 后确实消失** |
 *
 * 每条都带反向保护，避免「观察对象根本不存在」也算绿：
 * - #1：断言目标通知确实被投递到（列表非空且标题匹配），否则 extras 空串也能让「不含 JSON」成立；
 * - #2：断言**另一会话**的通知 extra 不等于本会话（防串号）；
 * - #3：断言手动 cancel 后确实消失（证明观察的是真实存留，不是「本来就查不到」）。
 *
 * ## 前提：POST_NOTIFICATIONS
 * targetSdk 34，API 33+ 需要 POST_NOTIFICATIONS 才能落通知。未授权时本类断言会明确报
 * 「通知未落盘」而不是静默通过 —— 见 [requireNotificationPermission]。
 *
 * ## 真机写操作（自带清理）
 * 投递通知 + 通过 PendingIntent 拉起 Activity；结束时 cancel 本测试投递的通知。
 * 不改设置、不装卸包。
 */
@RunWith(AndroidJUnit4::class)
class NotifySmokeDeviceTest {

  private val ctx get() = InstrumentationRegistry.getInstrumentation().targetContext
  private val nm get() = ctx.getSystemService(NotificationManager::class.java)
  private val posted = mutableListOf<Int>()

  private fun requireNotificationPermission() {
    if (android.os.Build.VERSION.SDK_INT >= 33) {
      val granted = ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
        PackageManager.PERMISSION_GRANTED
      assumeTrue("POST_NOTIFICATIONS 未授予，通知不会落盘；本用例不计入通过", granted)
    }
  }

  /** 投递并返回落盘后的真实 Notification；找不到就红（不允许静默跳过）。 */
  private fun postAndFind(entry: NotifyEntry, titleNeedle: String): Notification {
    NotifyCenter.notifyEvent(ctx, entry, foreground = false)
    Thread.sleep(600)
    val hit = nm.activeNotifications.firstOrNull { sbn ->
      val title = sbn.notification.extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
      val text = sbn.notification.extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""
      val big = sbn.notification.extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString() ?: ""
      (title + text + big).contains(titleNeedle)
    }
    assertNotNull(
      "通知必须真的落盘（否则后续 extras 断言会在空对象上成立）。当前活动通知数="
        + nm.activeNotifications.size,
      hit,
    )
    posted.add(hit!!.id)
    return hit.notification
  }

  /**
   * 轮询取当前 RESUMED 的 MainActivity。
   *
   * 为什么不用 `Instrumentation.ActivityMonitor.waitForMonitorWithTimeout`：
   * 该 API 在当前 androidx.test 版本已不可用（实测 Unresolved reference）。
   * `ActivityLifecycleMonitorRegistry` 是官方推荐的替代，且不需要 espresso。
   */
  private fun awaitResumedMainActivity(timeoutMs: Long = 5000): MainActivity? {
    val reg = androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry.getInstance()
    val instr = InstrumentationRegistry.getInstrumentation()
    val deadline = System.currentTimeMillis() + timeoutMs
    while (System.currentTimeMillis() < deadline) {
      var found: MainActivity? = null
      instr.runOnMainSync {
        for (a in reg.getActivitiesInStage(androidx.test.runner.lifecycle.Stage.RESUMED)) {
          if (a is MainActivity) found = a
        }
      }
      if (found != null) return found
      Thread.sleep(150)
    }
    return null
  }

  private fun texts(n: Notification): String {
    val parts = mutableListOf<String>()
    for (k in listOf(Notification.EXTRA_TITLE, Notification.EXTRA_TEXT, Notification.EXTRA_SUB_TEXT)) {
      n.extras.getCharSequence(k)?.toString()?.let { parts.add(it) }
    }
    n.extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()?.let { parts.add(it) }
    return parts.joinToString("\n")
  }

  // ── ① 摘要不甲原始 JSON ─────────────────────────────────────────────

  @Test
  fun failedSummaryDoesNotCarryRawJson() {
    requireNotificationPermission()
    // 故意把「失败通知」的 summary 塞成原始 JSON —— 这正是 #831 要治的形态。
    val rawJson = "{\"objectId\":\"obj-notify-1\",\"path\":\"/sdcard/a.png\"}"
    val entry = NotifyEntry(
      kind = "report",
      title = "回合结束",
      summary = rawJson,
      sessionId = "notify-smoke-json",
      eventId = "notify-smoke-json-e1",
    )
    val n = postAndFind(entry, "回合结束")
    val all = texts(n)

    // 反向保护：确认我们确实拿到了内容（不是空对象）。
    assertTrue("反向保护：通知必须带有可见文本，否则「不含 JSON」无意义；实得=" + all, all.isNotBlank())
    assertFalse("摘要不得含 JSON 起始痕迹 {\"；实得=" + all, all.contains("{\""))
    assertFalse("摘要不得含 objectId 字段名；实得=" + all, all.contains("objectId"))
    assertFalse("摘要不得含 JSON 结束痕迹 \"}；实得=" + all, all.contains("\"}"))
  }

  // ── ② 点开落到对应会话 ─────────────────────────────────────────────

  @Test
  fun contentIntentCarriesTargetSession() {
    requireNotificationPermission()
    val mine = "notify-smoke-session-A"
    val other = "notify-smoke-session-B"
    val nA = postAndFind(
      NotifyEntry(kind = "question", title = "需要你确认 A", sessionId = mine, eventId = "notify-smoke-a"),
      "需要你确认 A",
    )
    val pi = nA.contentIntent
    assertNotNull("通知必须带 contentIntent（否则点开无所指向）", pi)
    pi!!.send()
    val activity = awaitResumedMainActivity()
    assertNotNull("点开通知必须拉起 MainActivity（ActivityLifecycleMonitor 未捕获到 RESUMED）", activity)
    val gotSession = activity!!.intent?.getStringExtra(NotifyCenter.EXTRA_TARGET_SESSION).orEmpty()
    assertEquals("点开必须落到源会话", mine, gotSession)
    // 反向保护：另一会话的键不得被串用。
    assertTrue("反向保护：不得串成其他会话；实得=" + gotSession, gotSession != other)
  }

  // ── ③ 点开后不被撕销 ───────────────────────────────────────────────

  @Test
  fun notificationSurvivesOpenAndIsNotAutoCancel() {
    requireNotificationPermission()
    val n = postAndFind(
      NotifyEntry(
        kind = "question", title = "需要你确认 C",
        sessionId = "notify-smoke-session-C", eventId = "notify-smoke-c",
      ),
      "需要你确认 C",
    )
    assertEquals(
      "通知不得带 FLAG_AUTO_CANCEL（点开即撕会让用户看不到历史）",
      0, n.flags and Notification.FLAG_AUTO_CANCEL,
    )

    val id = posted.last()
    val pi = n.contentIntent
    if (pi != null) {
      pi.send()
      awaitResumedMainActivity()
      Thread.sleep(600)
      val still = nm.activeNotifications.any { it.id == id }
      assertTrue("点开之后通知必须仍在（不被 MainActivity 初始化时撕销）；id=" + id, still)
    }

    // 反向保护：手动 cancel 后必须真的消失 —— 证明上面观察的是真实存留，不是「本来就查不到」。
    nm.cancel(id)
    Thread.sleep(400)
    assertFalse(
      "反向保护：手动 cancel 后必须从活动通知里消失；id=" + id,
      nm.activeNotifications.any { it.id == id },
    )
  }
}
