# Boot diagnostic token redaction

Issue #673 identifies launch-token exposure through diagnostic logs. The issue batch adds redaction to `boot-fail.log`, but the in-progress `boot-diag.log` path still assembled and appended caller-provided detail and page runtime fields without passing the final line through the redactor.

`writeBootDiag()` now redacts the complete line immediately before append and folds any remaining line breaks. The regression test writes both `?token=` and `&token=` URL forms through the real diagnostic sink and verifies that only `token=***` reaches the file.

Validation: the complete Kotlin unit suite passed 1,899 tests; the per-class test-count gate passed with no skips; `scripts/check-code-map.mjs` and `git diff --check` passed.
