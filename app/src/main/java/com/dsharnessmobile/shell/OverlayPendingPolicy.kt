package com.dsharnessmobile.shell

import org.json.JSONArray

/** Pure decisions for waiting cards and reconnect reconciliation. */
internal object OverlayPendingPolicy {

  /**
   * Drop only cards that belong to an older stream generation and were not re-sent.
   * `generation` is the current stream; `current` is the generation that emitted the card.
   */
  fun staleAfterReconnect(current: Int, cardGeneration: Int): Boolean = cardGeneration < current

  /** First unanswered question index, or -1 when every item has a selection or custom text. */
  fun firstUnanswered(
    questions: JSONArray,
    single: MutableMap<String, String>,
    multi: MutableMap<String, ArrayList<String>>,
    custom: MutableMap<String, String>,
  ): Int {
    for (i in 0 until questions.length()) {
      val q = questions.optJSONObject(i) ?: return i
      val id = q.optString("id")
      val hasCustom = custom[id]?.isNotBlank() == true
      val answered = if (q.optBoolean("multiSelect", false)) {
        hasCustom || multi[id]?.isNotEmpty() == true
      } else {
        hasCustom || !single[id].isNullOrBlank()
      }
      if (!answered) return i
    }
    return -1
  }
}
