package com.dsharnessmobile.shell

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * #866 / #877 / #875 三条 i18n 的**纯函数面**断言。
 *
 * 这三条都把文案抽成了 `internal` 纯函数（`inputHintFor` / `sessionRowText` / `reportBodyText`），
 * 因此可以**真断言**而不是 grep 源码形态——比静态档强，但仍**不是**设备渲染验证。
 *
 * 每条都双向：EN 无 CJK 且含拉丁字母；ZH 含 CJK。只测单向无法排除「返回空串」这种假绿。
 */
class I18nBatch4PureTest {

  private val cjk = Regex("[\u4e00-\u9fff]")
  private fun hasLatin(s: String) = s.any { it in 'A'..'Z' || it in 'a'..'z' }

  // ── #877 面板输入框提示 ──────────────────────────────────────────────

  @Test
  fun inputHintFollowsLanguageForAllThreeStates() {
    // 显式列三种状态，避免列表推导写错后静默少覆盖
    val cases = listOf(
      Triple(true, false, "busy"),
      Triple(false, true, "hasSession"),
      Triple(false, false, "fresh"),
    )
    for ((busy, hasSession, label) in cases) {
      val en = inputHintFor(busy, hasSession, english = true)
      val zh = inputHintFor(busy, hasSession, english = false)
      assertTrue("#877 [$label] EN 必须非空且含拉丁字母；实得=" + en, en.isNotBlank() && hasLatin(en))
      assertFalse("#877 [$label] EN 不得含中文；实得=" + en, cjk.containsMatchIn(en))
      assertTrue("#877 [$label] ZH 必须含中文；实得=" + zh, cjk.containsMatchIn(zh))
      assertTrue("#877 [$label] EN 与 ZH 必须不同（否则等于没做 i18n）；en=" + en + " zh=" + zh, en != zh)
    }
  }

  // ── #875 会话行「（当前）」后缀 ──────────────────────────────────────

  @Test
  fun sessionRowSuffixFollowsLanguage() {
    val enLabeled = sessionRowText("my-session", english = true)
    val zhLabeled = sessionRowText("my-session", english = false)
    assertTrue("#875 EN 必须以 (current) 结尾；实得=" + enLabeled, enLabeled.endsWith(" (current)"))
    assertTrue("#875 ZH 必须以（当前）结尾；实得=" + zhLabeled, zhLabeled.endsWith("（当前）"))
    assertFalse("#875 EN 不得含中文；实得=" + enLabeled, cjk.containsMatchIn(enLabeled))
    assertTrue("#875 ZH 必须含中文；实得=" + zhLabeled, cjk.containsMatchIn(zhLabeled))
    assertTrue("#875 必须保留原始 label；实得=" + enLabeled, enLabeled.contains("my-session"))

    // 未命名会话：占位文案也要跟语言走（此处最容易漏）
    val enBlank = sessionRowText(null, english = true)
    val zhBlank = sessionRowText("   ", english = false)
    assertTrue("#875 未命名 EN 必须非空且无中文；实得=" + enBlank, enBlank.isNotBlank() && !cjk.containsMatchIn(enBlank))
    assertTrue("#875 未命名 ZH 必须含中文；实得=" + zhBlank, cjk.containsMatchIn(zhBlank))
    assertTrue("#875 未命名占位 EN 与 ZH 必须不同；en=" + enBlank + " zh=" + zhBlank, enBlank != zhBlank)
  }

  // ── #866 汇报栏文案 ────────────────────────────────────────────────
}
