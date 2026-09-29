# @q9labsai/cli

## 0.4.2

### Patch Changes

- 154b38d: Convex and command lookups can return `truncated: true`, which marks the brief partial and truncated with a gap saying the lookup was capped.

## 0.4.1

### Patch Changes

- 6aa2f5c: Read flow steps from Axiom span events and logs and look up runs across traces.

## 0.4.0

### Minor Changes

- b82843c: Add multi-source diagnostic briefs, an Axiom query source, and trace paging with source-aware cursors and safe log lines.
- f8c0346: Add validated diagnostic flow definitions, pure run checking, and CLI run lookup and reporting for Convex and command adapters.

### Patch Changes

- Updated dependencies [b82843c]
- Updated dependencies [f8c0346]
  - @q9labsai/diagnostics@0.4.0

## 0.3.1

### Patch Changes

- 0e0a664: Read CLI versions from each package manifest, preserve and annotate newly accepted OSV findings, and normalize OSV paths through realpath.

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
