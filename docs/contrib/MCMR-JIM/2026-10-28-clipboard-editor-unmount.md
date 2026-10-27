# Clipboard editor unmount cleanup

Issue #698 tracks a lifecycle leak in the clipboard draft observer. The observer filtered mutations against dialog scopes that remained in the document. When React removed the last dialog, its scope was no longer queryable, so the removal record was ignored and the editor cleanup never ran. A draft panel could remain attached to the detached editor and an outstanding native clipboard read could retain its page listener.

The observer now recognizes removed subtrees containing an editor scope or a registered editor owner. The existing scan then disposes detached owners, which removes the draft panel, releases the page listener, and cancels an outstanding native read. The regression test unmounts the final dialog while a clipboard read is pending and checks both panel removal and cancellation.

Validation: the focused clipboard draft suite passed 13/13 tests; the complete UI plugin suite passed 959/959 tests; TypeScript compilation and the plugin bundle build passed; `scripts/check-code-map.mjs` and `git diff --check` passed. Vite reported missing source maps for three installed dependency bundles, without test failures.

Device validation is incomplete. The x86_64 AVD did not reach the fingerprint-ready state. Its retained boot diagnostics predate this installation, so they do not establish a cause for the current state. No plugin hot-push, CDP suite, or ADB interaction was run against that unready engine. Complete those checks after the device is in a verified ready state; this development result is not release qualification.
