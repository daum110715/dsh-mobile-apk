package com.dsharnessmobile.shell

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** #426 items 1 and 2: compaction must preserve the old ledger, and flush is single-flight. */
class NotifyDecisionQueueAtomicTest {

  @Test
  fun aFailedCompactionReplacementDoesNotTruncateTheLedger() {
    val root = java.nio.file.Files.createTempDirectory("decision-atomic-test").toFile()
    try {
      val ledger = File(root, "notify-decisions.ndjson")
      ledger.writeText("pending-answer\n")
      val tmp = File(root, "notify-decisions.ndjson.missing")
      assertFalse(AtomicFileReplace.publish(tmp, ledger))
      assertEquals("a failed compaction must keep the original answers", "pending-answer\n", ledger.readText())
    } finally {
      root.deleteRecursively()
    }
  }

  @Test
  fun flushUsesASharedInFlightGuard() {
    val src = File("src/main/java/com/dsharnessmobile/shell/NotifyDecisionQueue.kt")
      .takeIf { it.isFile } ?: File("app/src/main/java/com/dsharnessmobile/shell/NotifyDecisionQueue.kt")
    val text = src.readText()
    assertTrue("flush must have a single-flight CAS", text.contains("flushing.compareAndSet(false, true)"))
    assertTrue("the guard must be cleared for retries", text.contains("flushing.set(false)"))
    assertTrue("compaction must use the no-delete atomic replacement", text.contains("AtomicFileReplace.publish(tmp, f)"))
    assertFalse("compaction must not truncate the ledger as fallback", text.contains("f.writeText(tmp.readText())"))
  }
}
