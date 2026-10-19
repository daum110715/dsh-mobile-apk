package com.dsharnessmobile.shell

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RepairActivityPersistenceTest {
  private fun activitySource(): String {
    val candidates = listOf(
      File("src/main/java/com/dsharnessmobile/shell/RepairActivity.kt"),
      File("app/src/main/java/com/dsharnessmobile/shell/RepairActivity.kt"),
    )
    return candidates.firstOrNull { it.isFile }?.readText()
      ?: throw AssertionError("找不到 RepairActivity.kt")
  }

  private fun stripComments(source: String): String = source.lineSequence()
    .filterNot { line ->
      val trimmed = line.trimStart()
      trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")
    }
    .joinToString("\n")

  @Test
  fun sessionSaveRunsOnDedicatedQueueAndDestroySchedulesBeforeShutdown() {
    val source = stripComments(activitySource())
    val queue = source.indexOf("private val saveQueue")
    val save = source.indexOf("private fun saveCurrentSession()")
    assertTrue(queue >= 0 && queue < save)
    val method = source.substring(save, source.indexOf("private fun onSendButton()", save))
    assertTrue("save must enqueue durable work", method.contains("saveQueue.execute { RepairConversationStore.save(filesDir, session) }"))
    assertFalse("save must not serialize synchronously on the caller", method.contains("RepairConversationStore.save(\n      filesDir"))
    val destroy = source.substring(source.indexOf("override fun onDestroy()"), source.indexOf("override fun onSaveInstanceState"))
    assertTrue("destroy must schedule a snapshot before closing the queue", destroy.contains("saveCurrentSession()"))
    assertTrue(destroy.indexOf("saveCurrentSession()") < destroy.indexOf("saveQueue.shutdown()"))
  }

  @Test
  fun missingModelNewConversationShowsGuidanceInsteadOfSilentReturn() {
    val source = stripComments(activitySource())
    val create = source.substring(source.indexOf("private fun createNewConversation()"), source.indexOf("private fun switchConversation"))
    assertTrue(create.contains("MISSING_MODEL_MESSAGE"))
    assertTrue(create.contains("addSystemMessage(MISSING_MODEL_MESSAGE)"))
    assertTrue("drawer must close when creation is rejected", create.contains("closeConversationDrawer()"))
    val run = source.substring(source.indexOf("private fun runAgent("), source.indexOf("private fun setBusy"))
    assertTrue("runAgent must not silently return without a model", run.contains("addSystemMessage(MISSING_MODEL_MESSAGE)"))
  }

  @Test
  fun initFailureUsesGuardedUiCall() {
    val source = stripComments(activitySource())
    val init = source.substring(source.indexOf("worker = Thread {"), source.indexOf("private fun buildTopBar"))
    val failure = init.substring(init.indexOf("} catch (e: Exception) {"), init.indexOf("}.apply { name = \"dsh-repair-init\""))
    assertTrue("destroy during init must not escape as an uncaught exception", failure.contains("runCatching { addSystemMessage("))
  }

  @Test
  fun downloadCallbackChecksActivityAndWebViewLivenessBeforeJavascript() {
    val candidates = listOf(
      File("src/main/java/com/dsharnessmobile/shell/DownloadSaver.kt"),
      File("app/src/main/java/com/dsharnessmobile/shell/DownloadSaver.kt"),
    )
    val source = candidates.firstOrNull { it.isFile }?.readText() ?: throw AssertionError("找不到 DownloadSaver.kt")
    val post = source.indexOf("targetView.post")
    val evaluate = source.indexOf("targetView.evaluateJavascript", post)
    assertTrue(post >= 0 && evaluate > post)
    val callback = source.substring(post, evaluate)
    assertTrue("callback must check page state before touching WebView", callback.contains("!activity.webViewReady"))
    assertTrue("callback must reject a finishing Activity", callback.contains("activity.isFinishing"))
    assertTrue("callback must reject a destroyed Activity", callback.contains("activity.isDestroyed"))
    assertTrue("a replacement page must not receive the old page's result", callback.contains("activity.webView !== targetView"))
  }
}
