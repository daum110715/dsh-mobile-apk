package com.dsharnessmobile.shell

import java.io.File
import java.nio.file.Files
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class RepairConversationStoreTest {
  private lateinit var filesDir: File

  @Before
  fun setUp() {
    filesDir = Files.createTempDirectory("repair-conversations").toFile()
  }

  @After
  fun tearDown() {
    filesDir.deleteRecursively()
  }

  @Test
  fun conversationsRoundTripWithoutChangingStoredHistory() {
    val created = RepairConversationStore.create(filesDir)
    val history = JSONArray().put(JSONObject().put("role", "user").put("content", "fix it"))
    val events = JSONArray().put(JSONObject().put("type", "assistant").put("text", "working"))
    RepairConversationStore.save(filesDir, RepairConversation(
      id = created.id, title = "原生修复", history = history, events = events,
      modelIdentity = "d1api|https://example/v1|deepseek-v4.1-flash|openai-completions",
      reasoningEffort = "high",
    ))

    val loaded = RepairConversationStore.load(filesDir, created.id)
    assertNotNull(loaded)
    assertEquals("原生修复", loaded!!.title)
    assertEquals(history.toString(), loaded.history.toString())
    assertEquals(events.toString(), loaded.events.toString())
    assertEquals("high", loaded.reasoningEffort)
    assertTrue(RepairConversationStore.list(filesDir).any { it.id == created.id })
  }

  @Test
  fun deletingASessionRemovesItFromTheIndexAndDisk() {
    val created = RepairConversationStore.create(filesDir)
    RepairConversationStore.delete(filesDir, created.id)
    assertNull(RepairConversationStore.load(filesDir, created.id))
    assertTrue(RepairConversationStore.list(filesDir).none { it.id == created.id })
  }

  @Test
  fun invalidIdsCannotEscapeTheConversationDirectory() {
    assertNull(RepairConversationStore.load(filesDir, "../../files"))
    RepairConversationStore.delete(filesDir, "../index")
  }

  @Test
  fun aNewConversationStartsWithNoOldModelHistory() {
    val previous = RepairConversationStore.create(filesDir)
    RepairConversationStore.save(filesDir, RepairConversation(
      id = previous.id, title = "上一轮",
      history = JSONArray().put(JSONObject().put("role", "user").put("content", "old request")),
      events = JSONArray().put(JSONObject().put("type", "user").put("text", "old request")),
    ))

    val fresh = RepairConversationStore.create(filesDir)
    val loaded = RepairConversationStore.load(filesDir, fresh.id)!!

    assertEquals(0, loaded.history.length())
    assertEquals(0, loaded.events.length())
    assertTrue(fresh.id != previous.id)
  }

  @Test
  fun damagedIndexDoesNotDeleteOtherConversationFiles() {
    val first = RepairConversationStore.create(filesDir)
    val second = RepairConversationStore.create(filesDir)
    val index = File(filesDir, "native-repair/conversations/index.json")
    index.writeText("[{")

    val refs = RepairConversationStore.list(filesDir)

    assertEquals(setOf(first.id, second.id), refs.map { it.id }.toSet())
    assertNotNull(RepairConversationStore.load(filesDir, first.id))
    assertNotNull(RepairConversationStore.load(filesDir, second.id))
    assertEquals(2, File(filesDir, "native-repair/conversations").listFiles()!!.count { it.name.startsWith("session-") })
  }

  @Test
  fun damagedIndexIsRebuiltWithoutChangingLegacySessionFields() {
    val created = RepairConversationStore.create(filesDir, "旧会话")
    val before = File(filesDir, "native-repair/conversations/session-" + created.id + ".json").readText()
    File(filesDir, "native-repair/conversations/index.json").writeText("not json")

    val refs = RepairConversationStore.list(filesDir)

    assertEquals(listOf(created.id), refs.map { it.id })
    assertEquals(before, File(filesDir, "native-repair/conversations/session-" + created.id + ".json").readText())
    val rebuilt = JSONArray(File(filesDir, "native-repair/conversations/index.json").readText())
    assertEquals("旧会话", rebuilt.getJSONObject(0).getString("title"))
  }

  @Test
  fun savingAfterDamagedIndexKeepsUnindexedSessions() {
    val first = RepairConversationStore.create(filesDir)
    val second = RepairConversationStore.create(filesDir)
    File(filesDir, "native-repair/conversations/index.json").writeText("")

    RepairConversationStore.save(filesDir, RepairConversation(
      id = second.id, title = "继续修复", history = JSONArray(), events = JSONArray(),
    ))

    assertNotNull(RepairConversationStore.load(filesDir, first.id))
    assertNotNull(RepairConversationStore.load(filesDir, second.id))
  }

  @Test
  fun repeatedSavesAfterIndexRecoveryPreserveOrphanAndUnreadableSessions() {
    val first = RepairConversationStore.create(filesDir)
    val second = RepairConversationStore.create(filesDir)
    val directory = File(filesDir, "native-repair/conversations")
    val orphanId = "00000000-0000-4000-8000-000000000001"
    val brokenId = "00000000-0000-4000-8000-000000000002"
    val orphan = File(directory, "session-" + orphanId + ".json")
    val broken = File(directory, "session-" + brokenId + ".json")
    val orphanBytes = "{\"id\":\"$orphanId\",\"title\":\"orphan bytes\"}\n"
    orphan.writeText(orphanBytes)
    broken.writeText("{\"id\":")
    val orphanBefore = orphan.readBytes()
    val brokenBefore = broken.readBytes()
    File(directory, "index.json").writeText("not json")

    RepairConversationStore.save(filesDir, RepairConversation(
      id = first.id, title = "first save", history = JSONArray(), events = JSONArray(),
    ))
    RepairConversationStore.save(filesDir, RepairConversation(
      id = second.id, title = "second save", history = JSONArray(), events = JSONArray(),
    ))

    assertTrue("orphan session bytes must survive", orphan.readBytes().contentEquals(orphanBefore))
    assertTrue("unreadable session bytes must survive", broken.readBytes().contentEquals(brokenBefore))
    assertNotNull(RepairConversationStore.load(filesDir, first.id))
    assertNotNull(RepairConversationStore.load(filesDir, second.id))
  }

  @Test
  fun partiallyInvalidIndexIsTreatedAsDamagedInsteadOfDroppingEntries() {
    val first = RepairConversationStore.create(filesDir)
    val second = RepairConversationStore.create(filesDir)
    val directory = File(filesDir, "native-repair/conversations")
    val brokenId = "00000000-0000-4000-8000-000000000003"
    val broken = File(directory, "session-" + brokenId + ".json")
    broken.writeText("still the user's bytes")
    val brokenBefore = broken.readBytes()
    File(directory, "index.json").writeText(
      JSONArray().put(JSONObject().put("id", first.id).put("title", "first")).put("bad entry").toString(),
    )

    RepairConversationStore.save(filesDir, RepairConversation(
      id = second.id, title = "continue", history = JSONArray(), events = JSONArray(),
    ))
    RepairConversationStore.save(filesDir, RepairConversation(
      id = second.id, title = "continue again", history = JSONArray(), events = JSONArray(),
    ))

    assertTrue("session named by a valid prefix of the damaged index must survive", broken.readBytes().contentEquals(brokenBefore))
    assertNotNull(RepairConversationStore.load(filesDir, first.id))
    assertEquals("continue again", RepairConversationStore.load(filesDir, second.id)!!.title)
  }
}
