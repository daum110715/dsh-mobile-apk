package com.dsharnessmobile.shell

import java.io.File
import java.io.IOException
import java.nio.file.Files
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** Durable replacement used by EngineManager's commit and preset writes. */
class EngineManagerWriteSafetyTest {

  @Test
  fun replacementKeepsTheOldTargetWhenThePublishStepFails() {
    val root = Files.createTempDirectory("engine-write-failure").toFile()
    try {
      val target = File(root, ".snapshot-fingerprint")
      target.writeText("previous-commit")

      assertThrows(IOException::class.java) {
        replaceFileDurably(target, "new-commit".toByteArray()) { _, _ ->
          throw IOException("injected rename failure")
        }
      }

      assertEquals("previous-commit", target.readText())
      assertEquals(
        "the failed write must not leave its private temp file behind",
        listOf(target.name),
        root.list()!!.toList(),
      )
    } finally {
      root.deleteRecursively()
    }
  }

  @Test
  fun replacementCoversTheCompletePayloadAndDoesNotTruncateFirst() {
    val root = Files.createTempDirectory("engine-write-success").toFile()
    try {
      val target = File(root, ".snapshot-fingerprint")
      target.writeText("old")
      val expected = "0123456789abcdef".repeat(4).toByteArray()
      var observedOldTarget = false

      replaceFileDurably(target, expected) { temp, destination ->
        observedOldTarget = destination.readText() == "old"
        assertArrayEquals(expected, temp.readBytes())
        Files.move(temp.toPath(), destination.toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING)
      }

      assertTrue("the old target must remain readable until the replacement is published", observedOldTarget)
      assertArrayEquals(expected, target.readBytes())
      assertEquals("published write must leave only the target", listOf(target.name), root.list()!!.toList())
    } finally {
      root.deleteRecursively()
    }
  }

  @Test
  fun phoneControlPresetUsesDurableReplacementForEveryManagedFile() {
    val source = listOf(
      File("src/main/java/com/dsharnessmobile/shell/EngineManager.kt"),
      File("app/src/main/java/com/dsharnessmobile/shell/EngineManager.kt"),
    ).first { it.isFile }.readText()
    val seed = source.substringAfter("private fun seedPhoneControlPreset(")
      .substringBefore("fun ensurePrivateDshData()")
    val code = seed.lineSequence().filterNot {
      val line = it.trimStart()
      line.startsWith("//") || line.startsWith("*")
    }.joinToString("\n")

    assertTrue("managed SKILL.md must not be truncated in place", code.contains("replaceFileDurably(skillFile"))
    assertTrue("existing agent.cordis.yml injection must publish atomically", code.contains("replaceFileDurably(composition"))
    assertTrue("first presets seed must publish the composition atomically", code.contains("replaceFileDurably(compositionFile"))
    assertTrue("preset.yml must be published atomically", code.contains("replaceFileDurably(File(dir, \"preset.yml\")"))
    listOf("skillFile.writeText", "composition.writeText", "agent.cordis.yml\").writeText").forEach {
      assertTrue("in-place write remains: " + it, !code.contains(it))
    }
  }
}
