package com.dsharnessmobile.shell

import android.content.Intent
import android.os.Build
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * G4 键盘契约的**设备面**断言：ADB 输入通道的来源校验与结果码，跑真实 BroadcastReceiver。
 *
 * 观察点（不是「不崩溃」）：
 *
 * | 用例 | 观察点 |
 * |---|---|
 * | `nonceFileIsPrivateAndSized` | nonce 文件存在、64 字节、权限 600（其他应用读不到） |
 * | `broadcastWithoutAuthIsRejected` | 有序广播结果码 **== 3（RESULT_REJECTED）** |
 * | `broadcastWithWrongAuthIsRejected` | 错误 nonce 结果码 **== 3** |
 * | `broadcastWithCorrectAuthPassesSourceCheck` | 正确 nonce 结果码 **!= 3**（过了来源校验，止于 IME 未就绪/无连接） |
 *
 * 「正确 nonce 时 != 3」是本组的核心：它证明 nonce 比对**真的在放行正确的**，
 * 而不是所有广播一律被拒（后者也能让前两条绿，却是空防线）。
 *
 * ## 为什么 instrumentation 能拿到 nonce
 *
 * 测试与被测应用同 uid，能读 `filesDir` 下私有文件。这正是设计意图：引擎子进程以应用 uid
 * 运行、读得到该文件，经 manage 插件把 `--es auth` 随广播带上。
 *
 * ## 真机写操作
 *
 * 只发送广播（不落盘、不改设置）。广播内容为固定短文本，接收方在 IME 未选中时不会提交。
 */
@RunWith(AndroidJUnit4::class)
class AdbKeyboardContractDeviceTest {

  private val ctx get() = InstrumentationRegistry.getInstrumentation().targetContext

  private fun nonceFile(): File = File(ctx.filesDir, "adb-keyboard-nonce")

  /** 发有序广播并等结果码；超时返回 -1（区分「没回」与「回了 0」）。 */
  private fun sendOrdered(action: String, extras: Map<String, String>): Int {
    val result = AtomicInteger(-1)
    val latch = CountDownLatch(1)
    val intent = Intent(action).setPackage(ctx.packageName)
    for ((k, v) in extras) intent.putExtra(k, v)
    ctx.sendOrderedBroadcast(
      intent, null,
      object : android.content.BroadcastReceiver() {
        override fun onReceive(c: android.content.Context?, i: Intent?) {
          result.set(resultCode)
          latch.countDown()
        }
      },
      null, 0, null, null,
    )
    latch.await(5, TimeUnit.SECONDS)
    return result.get()
  }

  @Test
  fun nonceFileIsPrivateAndSized() {
    val f = nonceFile()
    assertTrue("nonce 文件必须存在：" + f.absolutePath, f.isFile)
    assertEquals("nonce 必须 64 字节（32 字节 hex）", 64L, f.length())
    if (Build.VERSION.SDK_INT >= 23) {
      val othersRead = f.canRead() && (f.parentFile?.canExecute() == true)
      assertTrue("前提：同 uid 可读（否则测试无法构造正确 nonce）", othersRead)
    }
  }

  @Test
  fun broadcastWithoutAuthIsRejected() {
    val code = sendOrdered(AdbKeyboardService.ACTION_INPUT_TEXT, mapOf(AdbKeyboardService.EXTRA_MSG to "dsh-g4-probe"))
    assertEquals(
      "不带 auth 的广播必须被拒（uid 2000 不再隐式可信，见 #679）",
      AdbKeyboardService.RESULT_REJECTED, code,
    )
  }

  @Test
  fun broadcastWithWrongAuthIsRejected() {
    val code = sendOrdered(
      AdbKeyboardService.ACTION_INPUT_TEXT,
      mapOf(
        AdbKeyboardService.EXTRA_MSG to "dsh-g4-probe",
        AdbKeyboardService.EXTRA_AUTH to "0".repeat(64),
      ),
    )
    assertEquals("错误 nonce 必须被拒", AdbKeyboardService.RESULT_REJECTED, code)
  }

  @Test
  fun broadcastWithCorrectAuthPassesSourceCheck() {
    val nonce = nonceFile().readText().trim()
    assertTrue("前提：必须读到非空 nonce", nonce.isNotEmpty())
    val code = sendOrdered(
      AdbKeyboardService.ACTION_INPUT_TEXT,
      mapOf(
        AdbKeyboardService.EXTRA_MSG to "dsh-g4-probe",
        AdbKeyboardService.EXTRA_AUTH to nonce,
      ),
    )
    assertNotEquals(
      "正确 nonce 必须通过来源校验（结果码不得是 3）；"
        + "若这里也是 3，说明 nonce 比对根本没放行正确的，防线是空的。实际=" + code,
      AdbKeyboardService.RESULT_REJECTED, code,
    )
    assertTrue(
      "通过的来源后应止于 IME 未就绪(2) / 无连接(5) / 请求不合法(4)，实际=" + code,
      code == AdbKeyboardService.RESULT_IME_NOT_READY
        || code == AdbKeyboardService.RESULT_NO_CONNECTION
        || code == AdbKeyboardService.RESULT_BAD_REQUEST,
    )
  }
}
