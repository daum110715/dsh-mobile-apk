package com.dsharnessmobile.shell

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Pure state decisions shared by the overlay service and its controller. */
class OverlayAttachedPolicyTest {

  @Test
  fun enabledRequiresPreferencePermissionAndAnActuallyAttachedRoot() {
    assertTrue(OverlayAttachedPolicy.readyForLifecycle(preference = true, permission = true, attached = true))
    assertFalse("a created service with no window is not enabled", OverlayAttachedPolicy.readyForLifecycle(true, true, false))
    assertFalse(OverlayAttachedPolicy.readyForLifecycle(false, true, true))
    assertFalse(OverlayAttachedPolicy.readyForLifecycle(true, false, true))
  }

  @Test
  fun aFailedBuildStartsNoBackgroundLifecycle() {
    assertFalse("failed root must not publish instance/start watchers", OverlayAttachedPolicy.continueAfterBuild(attached = false))
    assertTrue(OverlayAttachedPolicy.continueAfterBuild(attached = true))
  }
}
