# Guard execution-map baseline refresh drift

The anchor gate compared current source lines with its baseline during ordinary checks, but `--refresh-anchor-baseline` rebuilt the snapshot without checking those expectations. A direct refresh could therefore convert unreviewed source drift into the new accepted baseline. Rebuilding the reference map could also remove baseline keys without reporting the lost coordinates.

Refresh now compares the exact legacy key set before writing and refuses missing source content. It rejects newly observed source candidates by default and prints each key with its expected and actual lines. `--force-drift` explicitly allows those content changes and logs them; it does not allow reference-key changes. The baseline remains untouched on any rejected refresh.

The existing `index.js:2198` basename has an additional current candidate in the generated manage plugin output that is not in the reviewed baseline set. That file predates this change and remains unmodified. The default refresh correctly rejects it for explicit review; no forced refresh was used to fold it into the baseline.

Validation: all 21 self-tests pass, including direct drift-refresh rejection, explicit drift reporting, key-count mismatch and removal of stale basename candidates. The normal execution-map check passes. The repository refresh command rejects the existing `index.js:2198` candidate and leaves the baseline unchanged by that attempt. Issue #741 tracks the independent follow-up to #718.

## Main recovery follow-up

The parent #718 reached main as f9c3dd28 while #744 was closed without merging. This follow-up reapplies the reviewed refresh guard to main. The earlier validation above describes the original child branch only. On current main, the ordinary map gate already reports legacy anchor drift (148 findings without this guard, 145 with it); this follow-up does not refresh or accept those source expectations. The 21 self-tests pass. A real default refresh exits 1 and preserves the baseline SHA-256. Device validation was not performed; this draft has no release qualification and remains pending resolution of the existing map drift and the required validation.
