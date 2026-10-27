# Snapshot Fingerprint Publication Failure

## Scope

Issue #685 identified that a failed atomic fingerprint replacement must never fall back to a direct write of the live file. `SnapshotFingerprintPublication` now writes a same-directory temporary file, publishes it through `AtomicFileReplace`, removes the temporary file and throws when publication fails. `EngineManager` lets that failure enter the existing snapshot rollback path.

## Evidence

- The JVM regression injects a failed publisher, verifies the previous fingerprint bytes remain unchanged and the temporary file is removed, then verifies a subsequent successful publication.
- The Android instrumentation regression runs the same failure and recovery sequence against the emulator app's cache filesystem: 2 tests passed in `SnapshotAtomicRecoveryTest`.
- Full `:app:testDebugUnitTest` passed: 1,900 tests across 176 classes, with zero failures; the tracked test baseline was raised to 1,900.
- `check-kotlin-test-count.mjs`, `check-code-map.mjs`, `check-kotlin-comments.mjs`, and `git diff --check` passed.
- On the x86_64 AVD, the installed debug APK reached the declared snapshot fingerprint with no transaction marker. The WebView suite passed 46 checks in portrait and 46 in landscape. ADB interaction reached the main composer through first-run onboarding and Phone control navigation; a harmless landscape draft was entered and cleared. The original portrait/accelerometer settings were restored.

## Limits

The Android failure injection calls the production fingerprint writer with a failing publisher; it does not force a failure inside a full `EngineManager.refreshSnapshot` transaction. The device startup evidence covers a fresh install and first extraction, not an upgrade between two APK snapshots. No release artifact was produced.
