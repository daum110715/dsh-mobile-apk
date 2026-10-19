package com.dsharnessmobile.shell

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * #422 item 1 / #428 items 16 and 17 need a real WindowManager. These source contracts pin the
 * order that makes the failure safe: publish state after addView, and keep a visible retry path.
 */
class OverlayWindowFailureContractTest {

  private fun source(name: String): String {
    val roots = listOf(
      File("src/main/java/com/dsharnessmobile/shell"),
      File("app/src/main/java/com/dsharnessmobile/shell"),
    )
    return roots.asSequence().map { File(it, name) }.first { it.isFile }.readText()
  }

  private fun functionBody(source: String, signature: String): String {
    val start = source.indexOf(signature)
    assertTrue("missing $signature", start >= 0)
    val end = source.indexOf("\n  }", start)
    assertTrue("unterminated $signature", end > start)
    return source.substring(start, end)
  }

  @Test
  fun recallStripStateIsPublishedOnlyAfterAddViewSucceeds() {
    val body = functionBody(source("OverlayRecall.kt"), "internal fun show(")
    val add = body.indexOf("svc.wm.addView(strip, lp)")
    val state = body.indexOf("stripView = strip")
    assertTrue("addView must be present", add >= 0)
    assertTrue("stripView must be assigned after addView", state > add)
    assertTrue("failed attach must clear the idempotency state", body.contains("stripView = null"))
    assertTrue("failure must be diagnosable", body.contains("LogCollector.log"))
  }

  @Test
  fun hidingKeepsTheBallWhenTheRecallStripCannotAttach() {
    val body = functionBody(source("OverlayService.kt"), "internal fun hideBall()")
    val recall = body.indexOf("if (!recall.show(")
    val rollback = body.indexOf("hidden = false", recall)
    assertTrue("must react to strip failure", recall >= 0)
    assertTrue("must roll hiding back", rollback > recall)
    assertTrue("must reattach both windows", body.contains("wm.addView(h, hp)") && body.contains("wm.addView(r, rp)"))
  }

  @Test
  fun ballAttachFailureDoesNotEscapeOnCreate() {
    val body = functionBody(source("OverlayService.kt"), "private fun buildRoot()")
    assertTrue("ball addView must be guarded", body.contains("try {\n      wm.addView(root, params)"))
    assertTrue("failure must be logged", body.contains("ball addView failed"))
    assertTrue("only success publishes the window", body.indexOf("rootView = root") > body.indexOf("wm.addView(root, params)"))
  }

  @Test
  fun panelFailureDoesNotClaimExpandedOrPushAvoidanceFrame() {
    val body = functionBody(source("OverlayService.kt"), "private fun showPanel()")
    val add = body.indexOf("wm.addView(unit, pp)")
    val catchAt = body.indexOf("catch (t: Exception)", add)
    val expanded = body.indexOf("expanded = true", add)
    assertTrue("addView must have a failure branch", catchAt > add)
    assertTrue("expanded state is committed after addView", expanded > add)
    val failure = body.substring(catchAt, expanded)
    assertFalse("failure branch must not push padding", failure.contains("emitFrame()"))
    assertTrue("failure branch must be visible", failure.contains("flashStatus("))
    assertTrue("retry gate must check attachment", body.contains("rootView == null || !ballAttached"))
  }
}
