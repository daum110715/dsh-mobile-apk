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

  @Test
  fun fileReverseMigrationCanNeverDeleteThePublicSourceAfterCopyFailure() {
    val root = Files.createTempDirectory("reverse-migration-file-source").toFile()
    try {
      val public = File(root, "public/settings.yaml")
      public.parentFile!!.mkdirs()
      public.writeText("source: value\n")
      val source = listOf(
        File("src/main/java/com/dsharnessmobile/shell/EngineManager.kt"),
        File("app/src/main/java/com/dsharnessmobile/shell/EngineManager.kt"),
      ).first { it.isFile }.readText()
      val migration = source.substringAfter("private fun reverseMigrateFile(")
        .substringBefore("private fun publicRepoStatusFile()")
      val copy = migration.indexOf("publicFile.copyTo(privateFile, overwrite = true)")
      val sync = migration.indexOf("fd.sync()")
      val verify = migration.indexOf("copy verification failed")
      val remove = migration.indexOf("publicFile.delete()")

      assertTrue("the public source must survive a failed copy", public.exists())
      assertTrue("copy, durability sync and content check must precede source deletion",
        copy >= 0 && sync > copy && verify > sync && remove > verify)
      assertTrue("the source may only be removed behind a failure-preserving copy",
        migration.substring(remove).contains("failed to delete public source"))
    } finally {
      root.deleteRecursively()
    }
  }

  @Test
  fun activeModulePatchFailureStopsEngineStartInsteadOfLoggingOnly() {
    val root = Files.createTempDirectory("runtime-patch-start").toFile()
    try {
      val target = File(root, "dsh-fs-local/lib/index.js")
      target.parentFile!!.mkdirs()
      target.writeText("factory-runtime")
      val source = listOf(
        File("src/main/java/com/dsharnessmobile/shell/EngineManager.kt"),
        File("app/src/main/java/com/dsharnessmobile/shell/EngineManager.kt"),
      ).first { it.isFile }.readText()
      val patch = source.substringAfter("private fun applyAssetPatch(")
        .substringBefore("  /** Append-style patch")
      val start = source.substringAfter("fun startEngine(")
        .substringBefore("internal fun startupExceptionCode")

      assertEquals(
        "a failure before replacement must not alter the active module",
        "factory-runtime",
        target.readText(),
      )
      assertTrue("patch writes must use the durable replacement primitive",
        patch.contains("replaceFileDurably(target, assetBytes)"))
      assertTrue("patch failure must be returned to the start path",
        patch.contains("\"\$asset（写入失败：\""))
      assertTrue("spawn must stop when patches are incomplete",
        start.indexOf("val runtimePatchFailures = applyRuntimePatches()") <
          start.indexOf("if (runtimePatchFailures.isNotEmpty())") &&
          start.contains("lastStartRefusalCode = REFUSAL_RUNTIME_PATCH_INCOMPLETE") &&
          start.indexOf("lastStartRefusalCode = REFUSAL_RUNTIME_PATCH_INCOMPLETE") <
          start.indexOf("val started = startWithArgs(args, shellEnv())"))
    } finally {
      root.deleteRecursively()
    }
  }
}
