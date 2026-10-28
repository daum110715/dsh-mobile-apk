package com.dsharnessmobile.shell

import android.content.pm.PackageManager
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * #675 发布者连续性的**设备面**验证。两个分支**分开命名**，不合并成一个「异证书包被拒」。
 *
 * 判据的两个分支必须分别证明，否则会把 fail-closed 误当成「证书比对有效」：
 *
 *   - 分支 A（fail-closed）：读不出待装包签名 -> 拒。见 [foreignUnparsableApkIsRejectedFailClosed]。
 *   - 分支 B（证书不匹配）：**能解析出签名**、但与已安装证书不同 -> 拒。见 [parseableForeignSignerApkIsRejected]。
 *
 * 分支 B 的关键前置断言是「负控 APK 确实可解析且读到了签名」——没有这一条，
 * 分支 B 就可能退化成又测了一遍分支 A。
 *
 * ## 负控为什么不用 throwaway keystore
 *
 * 设备上系统预置 APK 本身就是**真实可解析 + 真实异证书**（平台密钥签名，与本应用无关），
 * 例如 `/system/app/ExtShared/ExtShared.apk`。用它做分支 B 的负控，比临时造一把密钥更真实
 * （真实 zip、真实 v2 签名块、真实解析路径），且**不引入任何新密钥材料**。
 *
 * ## 真机写操作（全部自带清理）
 *
 * 只在本应用 `cacheDir` 下建临时子目录，把系统 APK **复制**进去（只读源），
 * 结束时 `deleteRecursively()`。不写私有数据区、不改设置、不装卸任何包。
 */
@RunWith(AndroidJUnit4::class)
class UpdateSignerContinuityDeviceTest {

  private val ctx get() = InstrumentationRegistry.getInstrumentation().targetContext

  /** 已安装 APK 的真实路径（PackageManager 给的真源）。 */
  private fun installedApk(): File = File(ctx.applicationInfo.sourceDir)

  /** 设备上天然异证书、且**不可解析**的真实 APK（termux-am）—— 专供分支 A。 */
  private fun unparsableForeignApk(): File {
    val f = File(ctx.filesDir, "usr/libexec/termux-am/am.apk")
    assertTrue("分支 A 需要设备上存在该 APK：" + f.absolutePath, f.isFile)
    return f
  }

  /** 设备上天然异证书、且**可解析**的系统 APK —— 专供分支 B。 */
  private fun parseableForeignSignerApk(): File {
    val candidates = listOf(
      "/system/app/ExtShared/ExtShared.apk",
      "/system/priv-app/ExternalStorageProvider/ExternalStorageProvider.apk",
      "/system/priv-app/FusedLocation/FusedLocation.apk",
    )
    for (p in candidates) if (File(p).isFile) return File(p)
    throw AssertionError("分支 B 需要至少一个可解析的系统 APK，候选都不存在")
  }

  private fun withTempCopy(src: File, name: String, block: (File) -> Unit) {
    val dir = File(ctx.cacheDir, "g1-signer-device").apply { deleteRecursively(); mkdirs() }
    try {
      val copied = File(dir, name)
      src.copyTo(copied, overwrite = true)
      assertTrue("负控包必须复制成功且非空", copied.isFile && copied.length() > 0)
      block(copied)
    } finally {
      dir.deleteRecursively()
    }
  }

  // ── 正控 ───────────────────────────────────────────────────────────

  @Test
  fun installedApkPassesItsOwnContinuity() {
    assertTrue(
      "已安装包对自己的连续性必须成立（否则正常升级会被误拒）",
      UpdateChecker.signerContinuityHolds(ctx, installedApk()),
    )
  }

  // ── 分支 A：fail-closed（读不出就拒）────────────────────────────────

  @Test
  fun missingArchiveIsRejectedFailClosed() {
    val missing = File(ctx.cacheDir, "g1-signer-device/missing.apk")
    assertFalse("读不出待装包签名必须拒（不放行未知）", UpdateChecker.signerContinuityHolds(ctx, missing))
  }

  @Test
  fun foreignUnparsableApkIsRejectedFailClosed() {
    withTempCopy(unparsableForeignApk(), "unparsable-foreign.apk") { copied ->
      // 先证明它确实落在「解析不出来」这个分支上，否则本用例名不副实。
      val info = ctx.packageManager.getPackageArchiveInfo(
        copied.absolutePath, PackageManager.GET_SIGNING_CERTIFICATES,
      )
      assertTrue(
        "前提：该 APK 必须落在「不可解析」分支（info == null），否则本用例会退化成测分支 B",
        info == null,
      )
      assertFalse("不可解析的待装包必须拒", UpdateChecker.signerContinuityHolds(ctx, copied))
    }
  }

  // ── 分支 B：证书不匹配（能解析、但证书不同）──────────────────────

  @Test
  fun parseableForeignSignerApkIsRejected() {
    withTempCopy(parseableForeignSignerApk(), "parseable-foreign-signer.apk") { copied ->
      // 关键前置：必须确实解析出签名，且确实与已安装证书不同。
      // 缺了这条断言，本用例可能只是又测了一遍分支 A。
      val info = ctx.packageManager.getPackageArchiveInfo(
        copied.absolutePath, PackageManager.GET_SIGNING_CERTIFICATES,
      )
      assertNotNull("前提：该 APK 必须可解析（info != null）", info)
      val archiveSigners = info!!.signingInfo?.apkContentsSigners
      assertTrue("前提：必须能读到该 APK 的签名者", archiveSigners != null && archiveSigners.isNotEmpty())

      val installedInfo = ctx.packageManager.getPackageInfo(
        ctx.packageName, PackageManager.GET_SIGNING_CERTIFICATES,
      )
      val installedSigners = installedInfo.signingInfo?.apkContentsSigners
      assertTrue("前提：必须能读到已安装包的签名者", installedSigners != null && installedSigners.isNotEmpty())

      val archiveDigests = archiveSigners!!.map { it.toByteArray().contentHashCode() }.toSet()
      val installedDigests = installedSigners!!.map { it.toByteArray().contentHashCode() }.toSet()
      assertTrue(
        "前提：负控 APK 的证书必须与已安装证书不同（否则本用例测不到「不匹配」分支）",
        archiveDigests.intersect(installedDigests).isEmpty(),
      )

      assertFalse(
        "可解析但证书不匹配的待装包必须拒（#675 的核心防线）",
        UpdateChecker.signerContinuityHolds(ctx, copied),
      )
    }
  }
}
