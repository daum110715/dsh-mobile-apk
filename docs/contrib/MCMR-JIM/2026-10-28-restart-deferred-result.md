# Restart request during snapshot refresh

## Finding

The startup flow distinguishes `DEFERRED_REFRESHING` from a refused engine start, but the `restart_engine` repair tool still converted every non-started outcome into `restart-failed`. A restart request made during a normal snapshot refresh was therefore reported as a failure.

## Change

Return a structured deferred result with `ok: false`, `restarted: false`, `deferred: true`, and the stable `snapshot-refreshing` reason. Preserve `restart-failed` only for `REFUSED`. The message says that the caller may retry after refresh completion without promising which flow will start the engine.

## Verification

- Focused JVM tests: `RepairToolsTest`, `DeferredEngineStartTest`, and `Issue309StartRecoveryTest` passed.
- No device verification; this change only maps the existing start outcome into the repair tool response.
