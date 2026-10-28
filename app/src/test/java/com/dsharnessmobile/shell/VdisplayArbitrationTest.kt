package com.dsharnessmobile.shell

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Multi-viewer surface arbitration: one Surface can never be silently attached to two viewers.
 *
 * The controller-level integration is exercised on device; this keeps the fail-closed rule itself
 * testable without an Android display.
 */
class VdisplayArbitrationTest {

  @Test
  fun freeTargetAttachesToFirstViewer() {
    assertEquals(
      VdisplayController.ViewerArbitration.Verdict.ATTACH,
      VdisplayController.ViewerArbitration.decide(null, "viewer-a"),
    )
  }

  @Test
  fun sameViewerMayRebindIdempotently() {
    assertEquals(
      VdisplayController.ViewerArbitration.Verdict.ATTACH,
      VdisplayController.ViewerArbitration.decide("viewer-a", "viewer-a"),
    )
  }

  @Test
  fun foreignViewerIsRefusedInsteadOfStealingTheSurface() {
    assertEquals(
      VdisplayController.ViewerArbitration.Verdict.OCCUPIED,
      VdisplayController.ViewerArbitration.decide("viewer-a", "viewer-b"),
    )
  }

  @Test
  fun releaseReturnsTargetToTheFreePool() {
    // Owner cleared -> next viewer (including the previous foreign one) attaches.
    assertEquals(
      VdisplayController.ViewerArbitration.Verdict.ATTACH,
      VdisplayController.ViewerArbitration.decide(null, "viewer-b"),
    )
  }

  /**
   * D5（0.14.11）：屏被 destroy / 空闲回收 / 强制销毁后，宿主必须能**自查**发现并重新绑定。
   *
   * 真机实测（同一 JS turn 内 destroy + create）：修前新屏的 viewer 恒为 presenting=false
   * （连测 5s 都不恢复，侧栏永久停在旧帧）；修后 300ms 内恢复 presenting=true。
   * 根因是宿主只在自己的 release / surfaceDestroyed 里复位 attached —— 屏被别人删掉时它不知道。
   * 这里钉住「绑定前自查真源」的形态，撤掉即红。
   */
  @Test
  fun hostSelfChecksBeforeBindingAfterTheScreenIsRecreated() {
    val host = source("src/main/java/com/dsharnessmobile/shell/VdisplayHost.kt")
    assertTrue(
      "宿主绑定前必须自查 viewer 是否仍持有 Surface（否则重建的屏永远挂不上）",
      host.contains("VdisplayController.holdsViewerSurface(viewerId)"),
    )
    val controller = source("src/main/java/com/dsharnessmobile/shell/VdisplayController.kt")
    assertTrue(
      "controller 必须提供该只读查询",
      controller.contains("fun holdsViewerSurface(viewerId: String): Boolean"),
    )
  }

  private fun source(relative: String): String {
    val candidates = listOf(File(relative), File("app/" + relative))
    val file = candidates.firstOrNull { it.isFile }
      ?: throw AssertionError("找不到源码 " + relative + "（工作目录 = " + File(".").absolutePath + "）")
    return file.readText()
  }
}
