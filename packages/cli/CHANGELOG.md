# @q9labsai/cli

## 0.3.0

### Minor Changes

- ff37fef: Add the q9 tracker, dev process, and changelog commands.
- 070ea98: Add generic diagnostic contracts and `q9 diag` Convex and command adapters.
- 70877e7: Fix template dependency advisories and extend the overlapping CLI start test timeout.

### Patch Changes

- 1e46611: `q9 diag trace` shows one server span per Convex execution: `Console` log entries link their request to the trace but no longer appear as separate spans.
- 627e228: `q9 diag trace` accepts journey events linked to the diagnostic code.
- f5d5c29: `q9 diag trace` reads real Convex log lines (null fields, camelCase function names) and links log lines that contain the trace ID. The root route `/` is a valid route template.
- 4fc932d: `q9 diag trace` no longer marks a trace truncated when the Convex log stream ends normally.
- 04d64d7: `q9 tracker` reads only `trackerAreas` from `q9.config.json`, so the file can also hold the `diag` settings.
- Updated dependencies [f5d5c29]
- Updated dependencies [070ea98]
  - @q9labsai/diagnostics@0.2.0
