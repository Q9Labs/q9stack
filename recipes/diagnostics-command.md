# Diagnostics command adapter recipe

## Problem and reference

Non-Convex products retain their own authorized trace store but expose the same bounded `q9 diag` output. Chalk's `chalk/tools/episode-diagnostics/src/{config,inspect,brief}.mjs` is a safety reference; this generic adapter does **not** replace Chalk's `chalkdiag:v1` episode reference or `pnpm trace:inspect`. Link this recipe from the adopting product's `AGENTS.md`.

## Product implementation

Install `@q9labsai/diagnostics` and `@q9labsai/cli`. Configure `q9.config.json`, for example `"diag": { "adapter": "command", "command": ["node", "tools/trace-brief.mjs"] }`, and add `"diag": "q9 diag"` to pnpm scripts. The CLI invokes the command as `trace <code> [--prod | --deployment <name>]` from the project root. No flag means development; never infer production. On stdout, print exactly one `DiagnosticTraceBrief/v1` JSON object validated by `diagnosticTraceBriefSchema`, with matching code and target (`development`, `production`, or deployment name). Keep stderr and logs off stdout. Return `not_found` or `expired` as a valid brief with empty evidence, and use `partial` plus `visibilityGaps` for missing sources. Bound arrays and set `truncated` honestly. The command must enforce operator read authorization independently of code knowledge and must never print credentials or raw causes.

## Conformance check

Run `pnpm diag check`, which calls the command with a valid probe code, then `pnpm diag trace <known-code> --json`; validate both results with the package schema. Verify dev/prod targeting, missing and expired codes, forbidden corpus redaction, unknown safe-ID classes, array truncation, and denied read access. A `chalkdiag:v1` argument must remain on `pnpm trace:inspect`.
