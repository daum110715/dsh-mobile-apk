package com.dsharnessmobile.shell

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Issue #423-12: explicit screen ids are authoritative on every vdisplay action. */
class VdisplayTargetTest {
  @Test fun explicitTargetDoesNotFallBackToSelected() {
    assertTrue(VdisplayController.TargetResolution.explicitWins("virtual-2"))
    assertEquals("virtual-2", VdisplayController.TargetResolution.alias("virtual-2", "virtual-1"))
    assertFalse(VdisplayController.TargetResolution.explicitWins(null))
    assertEquals("virtual-1", VdisplayController.TargetResolution.alias(null, "virtual-1"))
  }
}
