# @q9labsai/diagnostics

## 0.4.0

### Minor Changes

- b82843c: Add multi-source diagnostic briefs, an Axiom query source, and trace paging with source-aware cursors and safe log lines.
- f8c0346: Add validated diagnostic flow definitions, pure run checking, and CLI run lookup and reporting for Convex and command adapters.

## 0.3.0

### Minor Changes

- 070ea98: Add generic diagnostic contracts and `q9 diag` Convex and command adapters.

### Patch Changes

- f5d5c29: `q9 diag trace` reads real Convex log lines (null fields, camelCase function names) and links log lines that contain the trace ID. The root route `/` is a valid route template.
