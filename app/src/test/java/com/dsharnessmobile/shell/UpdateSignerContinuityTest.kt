package com.dsharnessmobile.shell

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * #675 回归：应用内自更新链的「发布者连续性」判据。
 *
 * 缺陷形态：发布私钥随公开仓分发（keystore/debug.keystore 直接签 release），APK 摘要与
 * 载荷又同出自镜像——「签名不匹配由系统安装器天然拒绝」不成立（同私钥 = 同证书，安装器
 * 只会放行），更新链因此没有真实性防线。
 *
 * 修法：安装前以待装 APK 的证书 vs **当前安装**的本应用证书做连续性校验（fail-closed：
 * 读不出/不一致一律拒装）；CI 发布密钥改走 secret 注入（app/build.gradle.kts 的
 * DSH_RELEASE_KEYSTORE 接缝），repoDebug 只签本地/PR 测试包。
 *
 * 纯判据 + 静态判据各守一半：archive/installed 证书读取走 PackageManager，属设备面
 * （本批未做设备验证，PR 显式标注，发版候选前补验）。
 * 反证（本类必须能红）：invokeInstaller 摘掉校验前置 → 静态判据红；
 * signerDigestsMatch 放宽空集合或改为顺序敏感 → 纯判据红。
 */
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

  // ── 纯判据 ──────────────────────────────────────────────────────────────────

  @Test
  fun sameCertificateSetPasses() {
    val certs = listOf(b("official-release-cert"))
    assertTrue("同证书 = 官方发行链的合法升级", UpdateChecker.signerDigestsMatch(certs, certs))
  }

  @Test
  fun differentCertificateIsRejected() {
    val incoming = listOf(b("attessor-signed-with-leaked-repo-key"))
    val installed = listOf(b("official-release-cert"))
    assertFalse("证书不一致必须拒（repoDebug 私钥公开，同证书可被任何人签出）",
      UpdateChecker.signerDigestsMatch(incoming, installed))
  }

  @Test
  fun unreadableSignaturesFailClosed() {
    val certs = listOf(b("official-release-cert"))
    assertFalse("待装包读不出签名块必须拒", UpdateChecker.signerDigestsMatch(emptyList(), certs))
    assertFalse("已安装侧读不出证书同样拒（锚不可得 = 不放行）", UpdateChecker.signerDigestsMatch(certs, emptyList()))
    assertFalse("两侧都读不出更不能放行", UpdateChecker.signerDigestsMatch(emptyList(), emptyList()))
  }

  @Test
  fun multiSignerComparisonIsOrderInsensitive() {
    val a = listOf(b("cert-1"), b("cert-2"))
    val b = listOf(b("cert-2"), b("cert-1"))
    assertTrue("多签名者按集合比较（框架返回顺序不保证）", UpdateChecker.signerDigestsMatch(a, b))
    val c = listOf(b("cert-1"), b("cert-3"))
    assertFalse("集合有差即拒", UpdateChecker.signerDigestsMatch(a, c))
  }

  // ── 静态判据 ────────────────────────────────────────────────────────────────

  @Test
  fun invokeInstallerEnforcesContinuityBeforeFiring() {
    val code = codeOnly(repoFile("app/src/main/java/com/dsharnessmobile/shell/UpdateChecker.kt").readText())
    val body = code.substringAfter("fun invokeInstaller(")
    val check = body.indexOf("signerContinuityHolds(")
    val fire = body.indexOf("startActivity(")
    assertTrue("invokeInstaller 必须先做发布者连续性校验", check >= 0)
    assertTrue("校验必须先于 startActivity（安装链最后一道闸，调用方绕不过）", fire >= 0 && check < fire)
  }

  @Test
  fun stateMachineRejectsWithAnHonestUserFacingReason() {
    val code = codeOnly(repoFile("app/src/main/java/com/dsharnessmobile/shell/ApkUpdateAction.kt").readText())
    val body = code.substringAfter("private fun install(")
    assertTrue("状态机层必须有连续性校验前置（给出比「拉起失败」更诚实的文案）",
      body.contains("UpdateChecker.signerContinuityHolds("))
    assertTrue("拒绝必须走被拒产物语义（KIND_ARTIFACT_REJECTED），不得伪装成拉起失败",
      body.substringBefore("UpdateChecker.invokeInstaller(").contains("KIND_ARTIFACT_REJECTED"))
  }

  @Test
  fun releaseSigningPrefersCiSecretAndFallsBackExplicitly() {
    val gradle = repoFile("app/build.gradle.kts").readText()
    assertTrue("必须保留 CI secret 接缝（#675：真发布密钥不随公开仓分发）",
      gradle.contains("DSH_RELEASE_KEYSTORE"))
    assertTrue("无 CI 密钥时必须显式回落 repoDebug（不静默换签）",
      gradle.contains("signingConfigs.findByName(\"release\") ?: signingConfigs.getByName(\"repoDebug\")"))
  }
}
