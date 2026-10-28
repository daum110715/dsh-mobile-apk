package com.dsharnessmobile.shell

import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.io.IOException
import java.nio.file.Files
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Exercises production publication behavior against disposable cache files. */
class SnapshotAtomicRecoveryTest {
  @Test fun failedFingerprintPublicationPreservesPriorCommitValue() {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    val root = Files.createTempDirectory(context.cacheDir.toPath(), "fingerprint-publication-").toFile()
    try {
      val target = File(root, ".snapshot-fingerprint")
      target.writeText("old-fingerprint")
      try {
        SnapshotFingerprintPublication.write(target, "new-fingerprint") { _, _ -> false }
        throw AssertionError("failed fingerprint publication must abort")
      } catch (_: IOException) {
        // The existing snapshot recovery path owns rollback after publication fails.
      }
      assertEquals("old-fingerprint", target.readText())

      SnapshotFingerprintPublication.write(target, "recovered-fingerprint")
      assertEquals("recovered-fingerprint", target.readText())
    } finally {
      root.deleteRecursively()
    }
  }

  @Test fun failedPublicationKeepsExistingConfiguration() {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    val root = Files.createTempDirectory(context.cacheDir.toPath(), "snapshot-publication-").toFile()
    try {
      val target = File(root, "package.json")
      val old = "{\"用户配置\":\"必须保留\"}\n".toByteArray(Charsets.UTF_8)
      target.writeBytes(old)
      try {
        SnapshotTransaction.writeTextAtomic(target, "{\"updated\":true}", "fixture", publish = { tmp, live ->
          assertTrue(old.contentEquals(live.readBytes()))
          assertEquals("{\"updated\":true}", tmp.readText())
          false
        }) { org.json.JSONObject(it) }
        throw AssertionError("Failed publication must abort")
      } catch (error: SnapshotFsException) {
        assertEquals(CODE_ATOMIC_WRITE, error.code)
      }
      assertTrue("Existing data must be preserved byte-for-byte", old.contentEquals(target.readBytes()))
      SnapshotTransaction.writeTextAtomic(target, "{\"updated\":true}", "fixture") { org.json.JSONObject(it) }
      assertEquals("{\"updated\":true}", target.readText())
    } finally {
      root.deleteRecursively()
    }
  }
}
