# Release signing workflow

The Gradle release signing hook added for #675 was not connected to the official release workflow. The workflow still copied the public repository debug keystore and compared the APK signer against that same key, so the release artifact remained forgeable by anyone with repository access.

The release job now requires a single-line Base64-encoded private keystore plus its store password, alias, and key password from GitHub Actions secrets. It validates the keystore before APK packaging, then assembles the release variant separately for each ABI with that key and the matching injected snapshot. The final APK certificate is verified against the same keystore. The signature gate uses keytool's environment-backed password option so the secret is not present in the process argument list. Debug and source-audit artifacts retain the fixed repository key for local install compatibility.

The first different-key artifact cannot update existing installations signed with the former public debug key. Keep the generated release as a draft until a user-data migration path is defined; the OS and the in-app signer check both reject an in-place certificate change.

Validation: focused signature-gate and build-workflow contract tests, the gate self-test, and a missing-secret negative case pass. The actual repository release key is not available to this local validation, so no official release artifact was built or published.
