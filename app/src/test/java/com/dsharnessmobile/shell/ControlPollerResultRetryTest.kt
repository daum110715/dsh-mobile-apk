package com.dsharnessmobile.shell

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** #427 item 2: an executed control action must replay its outcome, never execute twice. */
class ControlPollerResultRetryTest {

  @Test
  fun executeRetainsTheExactOutcomeUntilTheEngineAcknowledgesIt() {
    val source = source("ControlPoller.kt")
    val body = functionBody(source, "private fun execute(")
    assertTrue("a completed result table is needed", body.contains("completed[reqId]"))
    val cachedAt = body.indexOf("val cached =")
    val handlerAt = body.indexOf("runOp(op, args)")
    assertTrue("cached results are checked before execution", cachedAt in 0 until handlerAt)
    assertTrue("cached results are re-posted", body.contains("post(\"/api/android/ui/result\", envelope(token, reqId, cached))"))
    assertTrue("only a transient acknowledgement failure is retained", body.contains("!posted.ok") && body.contains("posted.httpCode == 0"))
    assertTrue("a successful acknowledgement clears the cache", body.contains("completed.remove(reqId)"))
  }

  @Test
  fun aRetainedResultCanBeReadWithoutRunningTheHandler() {
    val source = source("ControlPoller.kt")
    val body = functionBody(source, "private fun execute(")
    val replay = body.substringAfter("val cached = synchronized(completed) { completed[reqId] }").substringBefore("val firstRun")
    assertTrue("replay path posts the envelope", replay.contains("post("))
    assertFalse("replay path never calls runOp", replay.contains("runOp("))
    assertTrue("execute is serialized by the request ID marker", source.contains("val firstRun = synchronized(executed)"))
  }

  private fun source(name: String): String {
    val roots = listOf(
      java.io.File("src/main/java/com/dsharnessmobile/shell"),
      java.io.File("app/src/main/java/com/dsharnessmobile/shell"),
    )
    return roots.asSequence().map { java.io.File(it, name) }.first { it.isFile }.readText()
  }

  private fun functionBody(source: String, signature: String): String {
    val start = source.indexOf(signature)
    assertTrue("missing " + signature, start >= 0)
    val end = source.indexOf("\n  }", start)
    assertTrue("unterminated " + signature, end > start)
    return source.substring(start, end)
  }
}
