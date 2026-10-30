# APK workflow Kotlin test results

The arm64 `build-apk` workflow failed at `check-kotlin-test-count.mjs` because a fresh runner had no `app/build/test-results/testDebugUnitTest` directory. The workflow built a snapshot but never ran the Kotlin unit tests required by that gate. Running `:app:testDebugUnitTest` before the APK build supplies real results; it does not weaken the gate. The missing-result failure in Actions run 41059251683 is the negative control, and run 41060514687 passed the gate with 180 classes and 1,935 tests after the change.
