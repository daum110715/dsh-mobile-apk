package com.dsharnessmobile.shell

import java.io.File
import java.io.IOException
import java.nio.file.Files
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SnapshotFingerprintPublicationTest {
  @Test
  fun failedPublicationPreservesOldFingerprintAndAllowsRecoveryWrite() {
    val root = Files.createTempDirectory("snapshot-fingerprint-test").toFile()
    try {
      val target = File(root, ".snapshot-fingerprint")
      target.writeText("old-fingerprint")
      val tmp = File(root, ".snapshot-fingerprint.tmp")
      var attemptedPublish = false

      try {
        SnapshotFingerprintPublication.write(target, "new-fingerprint") { temporary, live ->
          attemptedPublish = true
          assertEquals("old-fingerprint", live.readText())
          assertEquals("new-fingerprint", temporary.readText())
          false
        }
        throw AssertionError("failed fingerprint publication must abort the transaction")
      } catch (_: IOException) {
        // The caller's existing rollback path owns recovery after publication fails.
      }

      assertTrue("the atomic publisher must be attempted", attemptedPublish)
      assertEquals("old-fingerprint", target.readText())
      assertFalse("a failed temp must be removed", tmp.exists())

      SnapshotFingerprintPublication.write(target, "recovered-fingerprint")
      assertEquals("recovery can publish the next committed fingerprint", "recovered-fingerprint", target.readText())
    } finally {
      root.deleteRecursively()
    }
  }
}
