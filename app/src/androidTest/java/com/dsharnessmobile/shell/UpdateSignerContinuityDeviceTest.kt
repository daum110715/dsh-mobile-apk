package com.dsharnessmobile.shell

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * #675 的**设备面**验证：发布者连续性判据在真机进程里跑真实 PackageManager + 真实包解析。
 *
 * 与 `UpdateSignerContinuityTest`（JVM 单测）的分工：
 * - 单测覆盖纯判据 `signerDigestsMatch` 与静态接线；
 * - 本类覆盖**设备面**：从 `PackageManager` 读「当前已安装」的证书、从真实 APK 文件读 archive 证书，
 *   两者都由真实系统服务提供，**没有 mock**。
 *
 * 为什么负控不用临时 keystore：
 * 设备上已存在一个**天然异证书**的真实 APK —— `files/usr/libexec/termux-am/am.apk`（termux-am），
 * 它由完全不同的密钥签名。用它做负控比临时造包更真实（真实 APK、真实签名块、真实解析路径），
 * 也避免为了测试引入任何新密钥材料。
 *
 * ## 本测试在真机上做的写操作（全部自带清理）
 * 1. 在 `context.cacheDir` 下建一个临时子目录；
 * 2. 把设备上已有的 `termux-am/am.apk` **复制**进去（只读源，不修改源）；
 * 3. 结束时删除该临时子目录。
 *
 * 不写应用私有数据区、不改任何设置、不安装/卸载任何包。
 */
@RunWith(AndroidJUnit4::class)
class UpdateSignerContinuityDeviceTest {

  private val ctx get() = InstrumentationRegistry.getInstrumentation().targetContext

  /** 当前已安装 APK 的真实路径（`PackageManager` 给的真源）。 */
  private fun installedApk(): File = File(ctx.applicationInfo.sourceDir)

  /** 设备上天然异证书的真实 APK（termux-am）。缺失则本条跳过并如实报错。 */
  private fun foreignApk(): File {
    val f = File(ctx.filesDir, "usr/libexec/termux-am/am.apk")
    assertTrue("负控需要设备上存在异证书真实 APK： " + f.absolutePath, f.isFile)
    return f
  }

  @Test
  fun installedApkPassesItsOwnContinuity() {
    // 正控：已安装包与自身证书必然一致 —— 官方发行链的合法升级形态。
    val ok = UpdateChecker.signerContinuityHolds(ctx, installedApk())
    assertTrue("已安装包对自己的连续性必须成立（否则正常升级会被误拒）", ok)
  }

  @Test
  fun foreignSignedApkIsRejected() {
    // 负控：异证书真实 APK 必须被拒。
    val tmpDir = File(ctx.cacheDir, "g1-signer-device").apply { deleteRecursively(); mkdirs() }
    try {
      val copied = File(tmpDir, "foreign-signed.apk")
      foreignApk().copyTo(copied, overwrite = true)
      assertTrue("复制后的负控包必须存在且非空", copied.isFile && copied.length() > 0)
      val ok = UpdateChecker.signerContinuityHolds(ctx, copied)
      assertFalse("异证书包必须被拒（#675 的核心防线）", ok)
    } finally {
      tmpDir.deleteRecursively()
    }
  }

  @Test
  fun missingArchiveIsRejectedFailClosed() {
    // fail-closed：归档不存在时不得放行。
    val missing = File(ctx.cacheDir, "g1-signer-device/missing.apk")
    assertFalse("读不出待装包签名必须拒（不放行未知）", UpdateChecker.signerContinuityHolds(ctx, missing))
  }
}
