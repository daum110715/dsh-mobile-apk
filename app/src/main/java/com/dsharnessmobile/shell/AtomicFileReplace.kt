package com.dsharnessmobile.shell

import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption

/** Replace a completed sibling file without first opening a window where the target is absent. */
internal object AtomicFileReplace {

  /** @return true only when the target now refers to the completed temporary file. */
  fun publish(tmp: File, target: File): Boolean {
    return try {
      Files.move(
        tmp.toPath(),
        target.toPath(),
        StandardCopyOption.ATOMIC_MOVE,
        StandardCopyOption.REPLACE_EXISTING,
      )
      true
    } catch (_: Exception) {
      // ATOMIC_MOVE is optional on some Android storage providers. The fallback still replaces
      // in a single move and never deletes the old target first.
      try {
        Files.move(tmp.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING)
        true
      } catch (_: Exception) {
        false
      }
    }
  }
}
