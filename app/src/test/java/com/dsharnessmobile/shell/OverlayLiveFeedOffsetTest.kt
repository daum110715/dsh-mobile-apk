package com.dsharnessmobile.shell

import org.junit.Assert.assertEquals
import org.junit.Test

/** #426 第 4 项：live 文件偏移必须按 UTF-8 字节推进，而不是解码后的字符数。 */
class OverlayLiveFeedOffsetTest {

  private fun bytes(text: String): ByteArray = text.toByteArray(Charsets.UTF_8)

  @Test
  fun utf8PayloadAdvancesByItsByteLength() {
    val line = "{\"type\":\"tool_call\",\"summary\":\"读取中文文件\"}\n"
    val buf = bytes(line + "{\"partial\"")
    val offset = OverlayLiveFeed.completeLineBytes(buf)
    assertEquals("必须只消费到换行后的字节位置", line.toByteArray(Charsets.UTF_8).size, offset)
    assertEquals("解码范围必须与偏移一致", line, String(buf, 0, offset, Charsets.UTF_8))
  }

  @Test
  fun multipleMultibyteLinesAreConsumedExactlyOnce() {
    val first = "{\"text\":\"第一行\"}\n"
    val second = "{\"text\":\"第二行\"}\n"
    val buf = bytes(first + second + "{\"text\":\"未完成")
    val offset = OverlayLiveFeed.completeLineBytes(buf)
    assertEquals((first + second).toByteArray(Charsets.UTF_8).size, offset)
    assertEquals(first + second, String(buf, 0, offset, Charsets.UTF_8))
  }

  @Test
  fun halfLineAndEmptyInputDoNotAdvance() {
    assertEquals(0, OverlayLiveFeed.completeLineBytes(bytes("中文半行")))
    assertEquals(0, OverlayLiveFeed.completeLineBytes(ByteArray(0)))
    assertEquals(0, OverlayLiveFeed.completeLineBytes(bytes("x\n"), 0))
  }

  @Test
  fun lengthLargerThanBufferCannotReadPastTheArray() {
    val buf = bytes("abc\n")
    assertEquals(4, OverlayLiveFeed.completeLineBytes(buf, 999))
  }
}
