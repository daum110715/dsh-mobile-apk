package com.dsharnessmobile.shell

/** Pure, testable gates shared by OverlayService and OverlayController. */
internal object OverlayAttachedPolicy {

  fun readyForLifecycle(preference: Boolean, permission: Boolean, attached: Boolean): Boolean =
    preference && permission && attached

  fun continueAfterBuild(attached: Boolean): Boolean = attached
}
