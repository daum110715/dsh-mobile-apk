package com.dsharnessmobile.shell

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The locale preference is one row in a user-edited profile patch. */
class AppLanguageTest {

  @Test
  fun addsLocaleRowToAnEmptyDocument() {
    assertEquals("- id: locale\n  config:\n    preference: zh\n",
      AppLanguage.withDshLocalePreference("", "zh"))
  }

  @Test
  fun keepsOtherSettingsIntact() {
    val original = "- id: agent-default-model\n  config:\n    provider: deepseek-official\n"
    val updated = AppLanguage.withDshLocalePreference(original, "en")
    assertTrue(updated.contains("agent-default-model"))
    assertTrue(updated.contains("provider: deepseek-official"))
    assertTrue(updated.endsWith("- id: locale\n  config:\n    preference: en\n"))
  }

  @Test
  fun replacesAnExistingRowWithoutDuplicatingIt() {
    val original = "- id: locale\n  config:\n    preference: zh\n- id: other\n"
    val updated = AppLanguage.withDshLocalePreference(original, "en")
    assertEquals("- id: locale\n  config:\n    preference: en\n- id: other\n", updated)
  }

  @Test
  fun preservesExtraKeysInsideTheLocaleConfig() {
    val original = "- id: locale\n  config:\n    preference: zh\n    keepMe: true\n"
    val updated = AppLanguage.withDshLocalePreference(original, "en")
    assertTrue(updated.contains("keepMe: true"))
    assertTrue(updated.contains("preference: en"))
  }

  @Test
  fun insertingIntoALocaleConfigAddsTheKeyOnce() {
    val original = "- id: locale\n  config:\n    other: 1\n- id: next\n"
    val updated = AppLanguage.withDshLocalePreference(original, "zh")
    assertEquals("- id: locale\n  config:\n    preference: zh\n    other: 1\n- id: next\n", updated)
  }

  @Test
  fun followingTheSystemRemovesThePreference() {
    val original = "- id: locale\n  config:\n    preference: en\n- id: next\n"
    val updated = AppLanguage.withDshLocalePreference(original, null)
    assertEquals("- id: next\n", updated)
  }

  @Test
  fun followingTheSystemKeepsOtherLocaleConfigKeys() {
    val original = "- id: locale\n  config:\n    preference: en\n    keepMe: true\n"
    val updated = AppLanguage.withDshLocalePreference(original, null)
    assertTrue(updated.contains("keepMe: true"))
    assertTrue(!updated.contains("preference:"))
  }

  @Test
  fun leavesInsertChildrenAlone() {
    val original = "- insert:\n  - id: locale\n    config:\n      preference: zh\n"
    assertEquals(original, AppLanguage.withDshLocalePreference(original, null))
  }

  @Test
  fun bootstrapScriptCarriesTheForcedLocale() {
    val script = AppLanguage.bootstrapScript("system", listOf("zh-CN", "en-US"))
    assertTrue(script.contains("\"zh-CN\""))
    assertTrue(script.contains("\"en-US\""))
    assertTrue(script.contains("preference:null"))
  }

  @Test
  fun bootstrapScriptForcesTheSelectedLocale() {
    val script = AppLanguage.bootstrapScript("en", listOf("zh-CN"))
    assertTrue(script.contains("preference:\"en\""))
  }

}
