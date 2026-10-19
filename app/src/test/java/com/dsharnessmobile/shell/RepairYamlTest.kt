package com.dsharnessmobile.shell

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

class RepairYamlTest {
  @Test
  fun indentlessMappingSequencesPreserveSiblingsAndNestedModels() {
    val doc = RepairYaml.parse("plugins:\n- id: x\n- id: y\nother: keep\n")
    assertEquals(2, doc.sequence("plugins")!!.values.size)
    assertEquals("keep", doc.string("other"))
    val nested = RepairYaml.parse("providers:\n  route:\n    models:\n    - id: model-a\n    - id: model-b\n    api: openai-completions\n")
    val route = nested.mapping("providers")!!.mapping("route")!!
    assertEquals(2, route.sequence("models")!!.values.size)
    assertEquals("openai-completions", route.string("api"))
  }

  @Test
  fun emptySequenceItemDoesNotConsumeTheFollowingSibling() {
    val doc = RepairYaml.parse("-\n- id: second\n") as RepairYamlValue.Sequence
    assertEquals(2, doc.values.size)
    assertNotNull(doc.values.first() as? RepairYamlValue.Mapping)
    assertEquals("second", doc.values[1].string("id"))
  }
}
