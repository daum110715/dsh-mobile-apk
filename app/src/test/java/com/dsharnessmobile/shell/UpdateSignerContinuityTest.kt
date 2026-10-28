package com.dsharnessmobile.shell

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Regression tests for signed update artifacts and the one-way APK signing lineage. */
class UpdateSignerContinuityTest {

  private fun repoFile(rel: String): File {
    var dir: File? = File(".").absoluteFile
    while (dir != null) {
      if (File(dir, "settings.gradle.kts").isFile) return File(dir, rel)
      dir = dir.parentFile
    }
    throw AssertionError("找不到仓根（settings.gradle.kts），工作目录 = " + File(".").absolutePath)
  }

  /** 去掉注释行（注释里写 API 名不算命中——与本仓静态门禁同口径）。 */
  private fun codeOnly(src: String): String = src.lineSequence()
    .filterNot {
      val t = it.trimStart()
      t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")
    }
    .joinToString("\n")

  private fun b(s: String): ByteArray = s.toByteArray()
  private fun snapshot(current: String, vararg history: String) =
    UpdateChecker.SignerSnapshot(listOf(b(current)), history.map(::b))

  private fun digest(value: String): String = java.security.MessageDigest.getInstance("SHA-256")
    .digest(b(value)).joinToString("") { "%02x".format(it) }

  // ── 纯判据 ──────────────────────────────────────────────────────────────────

  @Test
  fun legacySignerRemainsValidThroughApi32() {
    val legacy = "legacy-release-cert"
    assertTrue(
      "API 26-32 must keep the legacy signer while the rotation minimum is API 33",
      UpdateChecker.signerRotationMatches(
        snapshot(legacy, legacy), snapshot(legacy, legacy), 32, digest(legacy), digest("rotated-cert"),
      ),
    )
  }

  @Test
  fun firstRotatedUpdateAcceptsInstalledLegacyAncestor() {
    val legacy = "legacy-release-cert"
    val rotated = "rotated-release-cert"
    assertTrue(
      "API 33+ must accept the pinned new signer when its lineage contains the installed legacy signer",
      UpdateChecker.signerRotationMatches(
        snapshot(rotated, legacy, rotated), snapshot(legacy, legacy), 33, digest(legacy), digest(rotated),
      ),
    )
  }

  @Test
  fun subsequentUpdateAcceptsInstalledRotatedSigner() {
    val legacy = "legacy-release-cert"
    val rotated = "rotated-release-cert"
    assertTrue(
      "later API 33+ updates must accept the already-rotated installed signer",
      UpdateChecker.signerRotationMatches(
        snapshot(rotated, legacy, rotated), snapshot(rotated, legacy, rotated), 35, digest(legacy), digest(rotated),
      ),
    )
  }

  @Test
  fun unrelatedSignersAndMissingLineageFailClosed() {
    val legacy = "legacy-release-cert"
    val rotated = "rotated-release-cert"
    val attacker = "attacker-controlled-cert"
    assertFalse(
      "API 32 rejects a same-as-installed signer that is not the pinned legacy certificate",
      UpdateChecker.signerRotationMatches(
        snapshot(attacker, attacker), snapshot(attacker, attacker), 32, digest(legacy), digest(rotated),
      ),
    )
    assertFalse(
      "API 33+ rejects an unpinned incoming signer",
      UpdateChecker.signerRotationMatches(
        snapshot(attacker, legacy, attacker), snapshot(legacy, legacy), 33, digest(legacy), digest(rotated),
      ),
    )
    assertFalse(
      "API 33+ rejects an incoming signer whose lineage omits the installed signer",
      UpdateChecker.signerRotationMatches(
        snapshot(rotated, rotated), snapshot(legacy, legacy), 33, digest(legacy), digest(rotated),
      ),
    )
    assertFalse(
      "the application does not accept multiple current signers",
      UpdateChecker.signerRotationMatches(
        UpdateChecker.SignerSnapshot(listOf(b("one"), b("two")), listOf(b("one"), b("two"))),
        snapshot(legacy, legacy), 33, digest(legacy), digest(rotated),
      ),
    )
  }

  // ── 静态判据 ────────────────────────────────────────────────────────────────

  @Test
  fun invokeInstallerEnforcesContinuityBeforeFiring() {
    val code = codeOnly(repoFile("app/src/main/java/com/dsharnessmobile/shell/UpdateChecker.kt").readText())
    val body = code.substringAfter("fun invokeInstaller(")
    val check = body.indexOf("signerContinuityHolds(")
    val fire = body.indexOf("startActivity(")
    assertTrue("invokeInstaller must verify the signed digest and signer lineage first", check >= 0)
    assertTrue("verification must precede startActivity", fire >= 0 && check < fire)
  }

  @Test
  fun stateMachineRejectsWithAnHonestUserFacingReason() {
    val code = codeOnly(repoFile("app/src/main/java/com/dsharnessmobile/shell/ApkUpdateAction.kt").readText())
    val body = code.substringAfter("private fun install(")
    assertTrue("the controller must verify the signed digest and lineage before install",
      body.contains("UpdateChecker.signerContinuityHolds(activity, dest, expectedSha256)"))
    assertTrue("verification failure must be reported as an artifact rejection",
      body.substringBefore("UpdateChecker.invokeInstaller(").contains("KIND_ARTIFACT_REJECTED"))
  }

  @Test
  fun releasePipelineRequiresTheSecretAndBuildsAOneWayLineage() {
    val workflow = repoFile(".github/workflows/release.yml").readText().replace("\r\n", "\n")
    val buildJob = workflow.substringAfter("\n  release:\n").substringBefore("\n  sign:\n")
    val signJob = workflow.substringAfter("\n  sign:\n").substringBefore("\n  publish:\n")
    val publishJob = workflow.substringAfter("\n  publish:\n")

    assertFalse(
      "the release build must not receive a signing key",
      buildJob.contains("DSH_RELEASE_SIGNING_KEY_PK8_BASE64") || buildJob.contains("DSH_RELEASE_KEY_PK8_BASE64"),
    )
    assertTrue("signing must run in the protected release-signing environment",
      signJob.contains("environment:\n      name: release-signing"))
    assertTrue("the signing job must use the environment-scoped key secret",
      signJob.contains("secrets.DSH_RELEASE_SIGNING_KEY_PK8_BASE64"))
    assertFalse("the retired repository-level key secret must not be used",
      workflow.contains("secrets.DSH_RELEASE_KEY_PK8_BASE64"))
    assertTrue("signing must be limited to the repository default branch",
      signJob.contains("github.event.repository.default_branch"))
    assertTrue("the signing job must depend on the unsigned release build",
      signJob.contains("needs: [release]"))
    assertTrue("the release workflow must generate an APK signing lineage", signJob.contains("rotate --out"))
    assertTrue("the rotated signer must be enabled from API 33", signJob.contains("--rotation-min-sdk-version 33"))
    assertTrue("rollback to the compromised signer must be disabled", signJob.contains("--set-rollback false"))
    assertTrue("release metadata must include the signed manifest", signJob.contains("MANIFEST.signed.json"))
    assertTrue("publication must wait for signing", publishJob.contains("needs: [sign]"))
  }
}
