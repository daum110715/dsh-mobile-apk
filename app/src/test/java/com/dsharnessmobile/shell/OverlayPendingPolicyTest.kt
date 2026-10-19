package com.dsharnessmobile.shell

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** #426 items 6 and 8: reconnect reconciliation and answer completeness. */
class OverlayPendingPolicyTest {

  private fun questions(vararg specs: Pair<String, Boolean>): JSONArray = JSONArray().apply {
    specs.forEach { (id, multi) ->
      put(JSONObject().put("id", id).put("multiSelect", multi))
    }
  }

  @Test
  fun cardsFromTheCurrentGenerationAreNeverStale() {
    assertFalse(OverlayPendingPolicy.staleAfterReconnect(4, 4))
    assertTrue(OverlayPendingPolicy.staleAfterReconnect(4, 3))
    assertFalse("a card refreshed by the current stream must survive",
      OverlayPendingPolicy.staleAfterReconnect(4, 4))
  }

  @Test
  fun coldStartGraceAllowsLateReplay() {
    assertTrue("the grace must cover engine cold start", RECONNECT_GRACE_MS >= 30_000L)
  }

  @Test
  fun everyQuestionMustHaveASelectionOrCustomAnswer() {
    val q = questions("q1" to false, "q2" to true)
    assertEquals(0, OverlayPendingPolicy.firstUnanswered(q, mutableMapOf(), mutableMapOf(), mutableMapOf()))
    assertEquals(1, OverlayPendingPolicy.firstUnanswered(
      q, mutableMapOf("q1" to "A"), mutableMapOf(), mutableMapOf(),
    ))
    assertEquals(-1, OverlayPendingPolicy.firstUnanswered(
      q, mutableMapOf("q1" to "A"), mutableMapOf("q2" to arrayListOf("B")), mutableMapOf(),
    ))
    assertEquals("custom text counts as an answer", -1, OverlayPendingPolicy.firstUnanswered(
      q, mutableMapOf("q1" to "A"), mutableMapOf(), mutableMapOf("q2" to "my answer"),
    ))
    assertEquals("blank custom text is not an answer", 1, OverlayPendingPolicy.firstUnanswered(
      questions("q1" to false, "q2" to false), mutableMapOf("q1" to "A"),
      mutableMapOf(), mutableMapOf("q2" to "   "),
    ))
  }

  @Test
  fun reconcilingAnOldCardDoesNotCancelANewerWaitingEvent() {
    assertTrue("only the captured older generation is stale",
      OverlayPendingPolicy.staleAfterReconnect(current = 2, cardGeneration = 1))
    assertFalse("the current generation re-sent its card",
      OverlayPendingPolicy.staleAfterReconnect(current = 2, cardGeneration = 2))
  }
}
