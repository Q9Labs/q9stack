# Diagnostics command adapter recipe

## Problem and reference

Non-Convex products retain their own authorized trace store but expose the same bounded `q9 diag` output. Chalk's `chalk/tools/episode-diagnostics/src/{config,inspect,brief}.mjs` is a safety reference; this generic adapter does **not** replace Chalk's `chalkdiag:v1` episode reference or `pnpm trace:inspect`. Link this recipe from the adopting product's `AGENTS.md`.

Use this source alongside Axiom when a Go or Elixir product needs its own database tables in the same brief; the stack capture patterns are in the [Go](diagnostics-go.md) and [Elixir](diagnostics-elixir.md) recipes.

## Product implementation

Install `@q9labsai/diagnostics` and `@q9labsai/cli`. Configure `q9.config.json`, for example `"diag": { "adapter": "command", "command": ["node", "tools/trace-brief.mjs"] }`, and add `"diag": "q9 diag"` to pnpm scripts. The CLI invokes the command as `trace <code> [--prod | --deployment <name>] [--limit <n>] [--after <cursor>]` from the project root. No flag means development; never infer production. `--limit` is passed through when supplied (1–1000); `--after` is the command source's own opaque cursor, not the CLI's outer cursor. A command may ignore it, but a paging command must return `nextCursor` when more rows exist and must advance that cursor on the next call. On stdout, print exactly one `DiagnosticTraceBrief/v1` JSON object validated by `diagnosticTraceBriefSchema`, with matching code and target (`development`, `production`, or deployment name). Keep stderr and logs off stdout. Return `not_found` or `expired` as a valid brief with empty evidence, and use `partial` plus `visibilityGaps` for missing sources. Bound arrays and set `truncated` honestly. The command must enforce operator read authorization independently of code knowledge and must never print credentials or raw causes.

For flows, record step events with `flow`, `flow_run`, `flow_step`, and branch `outcome` attributes. The CLI also invokes the command as `run <flowRun> [--prod | --deployment <name>]`. Return exactly `{ "events": DiagnosticEvent/v1[], "truncated"?: true }` on stdout (at most 10,000 events; set `truncated` when you dropped some), including all retained events of that run across traces, with independent read authorization. If run lookup is unsupported or fails, the CLI checks only the trace events and adds `flow_run_lookup_unavailable` to visibility gaps. See [the flows recipe](diagnostics-flows.md).

## Conformance check

Run `pnpm diag check`, which calls the command with a valid probe code, then `pnpm diag trace <known-code> --json`; validate both results with the package schema. Read a multi-page trace with `--limit` and successive `nextCursor` values, checking no event is skipped or repeated. Verify dev/prod targeting, missing and expired codes, forbidden corpus redaction, unknown safe-ID classes, array truncation, and denied read access. A `chalkdiag:v1` argument must remain on `pnpm trace:inspect`.
