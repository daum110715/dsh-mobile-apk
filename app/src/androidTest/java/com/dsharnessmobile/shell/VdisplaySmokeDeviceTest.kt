package com.dsharnessmobile.shell

import android.hardware.display.DisplayManager
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * vdisplay smoke（#843 面）：四条真实行为，断言全部落在 **状态字段 / 可见性 / display 列表**，不看日志。
 *
 * ## 这是**有副作用**的测试 —— 副作用清单与恢复方式
 *
 * | 副作用 | 恢复 |
 * |---|---|
 * | 可能创建虚拟屏（`VdisplayController.create`） | `@After` 对每条自建 alias 调 `destroy`，随后清理 `records` |
 * | 可能改变 selected alias | `@After` 还原为进入前的 `status().selected` |
 * | Activity 可能进入后台（第 4 条） | `ActivityScenario` 的 `close()` 恢复 |
 *
 * ## 孤儿 display 防线
 *
 * `@Before` 记录 `DisplayManager.getDisplays()` 的 id 集合；`@After` 断言**集合与开始时一致**。
 * 若某条用例漏销毁，它会在清理阶段直接红，而不是在设备上留一个孤儿 display。
 *
 * ## 为什么大量 `assumeTrue`
 *
 * `VdisplayController.create` 需要 Shizuku 已授权且 UserShell 就绪。未就绪时它返回
 * `ok=false / state=blocked`，此时**不能把「没建成」当成「行为正确」**——故相关用例
 * `assumeTrue` 跳过并给明原因，不计入通过。
 */
@RunWith(AndroidJUnit4::class)
class VdisplaySmokeDeviceTest {

  private val ctx get() = InstrumentationRegistry.getInstrumentation().targetContext
  private val dm get() = ctx.getSystemService(DisplayManager::class.java)
  private val createdAliases = mutableListOf<String>()
  private var displaysAtStart: Set<Int> = emptySet()
  private var selectedAtStart: String? = null

  private fun displayIds(): Set<Int> = dm.displays.map { it.displayId }.toSet()

  private fun status(): JSONObject = VdisplayController.status(ctx)

  @Before
  fun recordBaseline() {
    displaysAtStart = displayIds()
    selectedAtStart = status().optString("selected", "").ifEmpty { null }
  }

  @After
  fun cleanupAndAssertNoOrphans() {
    for (alias in createdAliases) {
      runCatching { VdisplayController.destroy(ctx, JSONObject().put("alias", alias)) }
    }
    createdAliases.clear()
    runCatching { VdisplayController.select(ctx, selectedAtStart) }
    // 孤儿 display 防线：集合必须与开始时一致，否则用例红（而不是留在设备上）
    assertEquals(
      "测试结束后 display id 集合必须与开始时一致（漏销毁会在这里红）。before=" + displaysAtStart
        + " after=" + displayIds(),
      displaysAtStart, displayIds(),
    )
  }

  /** 尝试建屏并登记；失败时返回 null（调用方用 assumeTrue 决定跳过）。 */
  private fun tryCreate(alias: String): JSONObject? {
    val r = VdisplayController.create(ctx, JSONObject().put("alias", alias))
    if (r.optBoolean("ok")) createdAliases.add(alias) else return null
    return r
  }

  // ── ① 挂载失败不谎报 ────────────────────────────────────────────────

  @Test
  fun illegalCreateDoesNotReportConnected() {
    // 非法宽度：必须报失败，且 status 不得因此进入 active。
    val bad = VdisplayController.create(ctx, JSONObject().put("alias", "vd-smoke-bad").put("width", -1))
    assertFalse("非法参数不得报 ok=true；实得=" + bad, bad.optBoolean("ok", false))
    assertTrue(
      "失败必须给出 guidance（不许静默失败）；实得=" + bad,
      bad.optString("guidance", "").isNotEmpty(),
    )
    val st = status()
    assertNotEquals(
      "失败后 status 不得谎报 active；实得=" + st,
      "active", st.optString("state", ""),
    )
    val aliases = st.optJSONArray("aliases")
    val listed = aliases != null && (0 until aliases.length()).any { aliases.optString(it) == "vd-smoke-bad" }
    assertFalse("失败后该 alias 不得出现在 active 列表里；实得=" + st, listed)
  }

  // ── ② 屏销毁能重挂 ──────────────────────────────────────────────────

  @Test
  fun screenCanBeReattachedAfterDestroy() {
    val alias = "vd-smoke-reattach"
    val first = tryCreate(alias)
    assumeTrue(
      "Shizuku/UserService 未就绪（create 返回 " + (first?.toString() ?: "blocked")
        + "），本条无法验证重挂；不计入通过",
      first != null,
    )
    assertNotNull("建屏后必须能查到 displayId", VdisplayController.displayIdForAlias(alias))
    assertTrue("建屏后 activeAliases 必须含该 alias", VdisplayController.activeAliases().contains(alias))

    val destroyed = VdisplayController.destroy(ctx, JSONObject().put("alias", alias))
    createdAliases.remove(alias)
    assertTrue("destroy 必须报成功；实得=" + destroyed, destroyed.optBoolean("ok", false))
    assertFalse(
      "销毁后 activeAliases 不得再含该 alias",
      VdisplayController.activeAliases().contains(alias),
    )

    val second = tryCreate(alias)
    assumeTrue("重建失败，重挂无从验证；实得=" + (second?.toString() ?: "blocked"), second != null)
    assertNotNull("重建后必须能重新查到 displayId", VdisplayController.displayIdForAlias(alias))
  }

  // ── ③ 屏没了浮窗收场 ────────────────────────────────────────────────

  @Test
  fun floatingWindowClosesWhenScreenDisappears() {
    val alias = "vd-smoke-float"
    val created = tryCreate(alias)
    assumeTrue("Shizuku/UserService 未就绪，本条无法验证浮窗收场；不计入通过", created != null)

    VdisplayController.select(ctx, alias)
    assertEquals("select 后 status.selected 必须是该 alias", alias, status().optString("selected", ""))

    VdisplayController.destroy(ctx, JSONObject().put("alias", alias))
    createdAliases.remove(alias)

    val st = status()
    assertNotEquals(
      "屏销毁后 status 不得仍为 active；实得=" + st,
      "active", st.optString("state", ""),
    )
    val aliases = st.optJSONArray("aliases")
    val stillListed = aliases != null && (0 until aliases.length()).any { aliases.optString(it) == alias }
    assertFalse("屏销毁后该 alias 不得仍在 active 列表（浮窗应随之收场）；实得=" + st, stillListed)
    // 反向保护：selected 不得继续指向一个已不存在的 alias。
    assertNotEquals("屏销毁后 selected 不得仍指向已销毁的 alias", alias, st.optString("selected", ""))
  }

  // ── ④ 后台不抢 Surface ─────────────────────────────────────────────

  @Test
  fun backgroundDoesNotGrabNativeSurface() {
    // 观察点：viewers 数组（VdisplayController 的 Surface 归属记录）在后台必须为空。
    // 只看日志不算数——这里读的是状态字段。
    androidx.test.core.app.ActivityScenario.launch(MainActivity::class.java).use { scenario ->
      scenario.moveToState(androidx.lifecycle.Lifecycle.State.CREATED) // 退到后台
      Thread.sleep(500)
      val viewers = status().optJSONArray("viewers")
      val count = viewers?.length() ?: 0
      assertEquals(
        "应用退到后台后不得持有任何 viewer Surface（viewers 必须为空）；实得="
          + (viewers?.toString() ?: "null"),
        0, count,
      )
    }
  }
}
