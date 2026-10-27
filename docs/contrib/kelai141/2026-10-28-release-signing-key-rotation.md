# Release Signing Key Rotation

## Symptom

The release workflow signed APKs with a keystore committed in the public repository. The update client also accepted release metadata and APK digests delivered by the same mirror, so comparing an APK certificate to the installed certificate did not authenticate either the artifact or its metadata.

## Root cause

The updater treated the Android signer as its only trust anchor even though the corresponding private key was public. It also allowed unsigned release metadata fallbacks and did not preserve the signed APK digest across the install-permission round trip.

## Fix

The updater verifies a detached release-manifest signature against an embedded public certificate, requires the selected APK digest, and rechecks that digest immediately before opening the installer. The release workflow creates a one-way signing lineage from the legacy signer to the protected signer, keeps the legacy signer active through API 32, and enables the rotated signer from API 33. The old signer cannot roll back a rotated installation.

## Verification

The complete Kotlin unit suite passed with 1,914 tests and no failures. The release-manifest and APK-signature Node tests passed 22/22, the manifest signer self-test passed, and `check-code-map.mjs` plus `git diff --check` passed.

The generated APK signing lineage was verified with `apksigner` at API 32 and API 33: API 32 resolves to the legacy V3.0 signer, while API 33 resolves to the rotated V3.1 signer. On an API 35 emulator, an APK signed by the legacy key installed successfully and the rotated APK then replaced it successfully, confirming the forward upgrade path and rejecting rollback through the one-way lineage.

On the emulator, the user-facing path to Settings > App updates was opened and Check for updates was tapped. The page returned “APK is up to date v0.14.9”; CDP independently read the same visible status and the enabled “Check again” control. No installer was opened because no newer public release was available, so an in-app download/install of a signed release was not exercised on-device. Digest, signature-envelope, permission-return, and installer handoff rejection paths are covered by the Kotlin tests and release signing gates.
