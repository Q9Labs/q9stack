# Diagnostics Axiom source recipe

## Problem and reference

An OpenTelemetry product can let `q9 diag` read spans and logs by diagnostic code (the W3C trace ID) without adding a database driver to the CLI. The reference is `packages/cli/src/diag/axiom.ts`. Link this recipe from the adopting product's `AGENTS.md`.

## Product implementation

Configure one source, or combine it with a product-owned `command` source:

```json
{
  "diag": {
    "sources": [
      { "adapter": "command", "command": ["node", "tools/trace-brief.mjs"] },
      {
        "adapter": "axiom",
        "org": "<axiom-org-id>",
        "traces": "<product>-prod-traces",
        "logs": "<product>-prod-logs",
        "tokenEnv": "AXIOM_QUERY_TOKEN",
        "window": "14d"
      }
    ]
  }
}
```

`traces` and `logs` name Axiom datasets; at least one is required. `window` defaults to `14d` and accepts positive hours (`h`) or days (`d`). Give the named environment variable an Axiom **query/read-only** token scoped to the configured datasets. Never put a token in config, a command argument, or a report. `q9 diag check` sends a one-row query to every configured dataset to prove access without selecting a customer trace.

A logs-only source returns redacted `serverLogs` records keyed by trace and span ID. When another source supplies the matching span on the same page, the merged brief also attaches those lines to that span. This keeps log evidence available even when the span comes from a different store.

The trace dataset must contain OTel spans with top-level `trace_id`, `span_id`, `_time`, `name`, `duration`, `status.code`, and ideally `parent_span_id`, `service.name`, and `events`. The log dataset must contain top-level `trace_id`, `span_id`, `_time`, `body`, `severity_text` (or `attributes.log_level`), and `service.name`. Logs without a matching span cannot be attached. Export both spans and logs from every service in the journey; a service that exports spans only will not contribute log lines. The product must propagate `traceparent` through browser, API, jobs, and service calls; use that trace ID as the safe diagnostic code in error responses; and record stable, non-sensitive span names. Before exporting, restrict attributes to the diagnostics allowlist and redact log bodies. The CLI applies the same allowlist and never prints a raw log body: each attached line retains its timestamp and severity with `Redacted log body` as the message.

The CLI queries by `trace_id`, pages Axiom results by `_time`, and de-duplicates spans. It joins sources by trace ID. A merged brief is complete only when every source is complete; named `visibilityGaps` identify missing coverage. Use `--limit` (1–1000) and `--after <nextCursor>` to continue a long trace.

For flows without a product diagnostics table, emit each step as an OTel span event and/or a correlated OTel log record. Both must carry string `flow` (the ID in `diagnostics/flows.json`), `flow_run` (one opaque ID shared across traces), and `flow_step` (the step ID); include string `outcome` for a branch. Axiom stores these in the span's `events[].attributes` and as `attributes.flow`, `attributes.flow_run`, `attributes.flow_step`, and `attributes.outcome` columns on logs. Keep the span event timestamp and correlated log timestamp aligned to the same millisecond so the CLI de-duplicates them. The CLI reads these as redacted `DiagnosticEvent/v1` entries, then looks up the run across traces using both datasets. A traces-only or logs-only source also works when every required step is emitted there. See [diagnostic flows](diagnostics-flows.md).

## Conformance check

Run `pnpm diag check --prod`, then inspect a known trace with `pnpm diag trace <code> --prod --json`. Verify the brief has the expected span IDs, safe log lines, flow events and `flows` verdict, and that status-error and exception spans appear in `errors`. Check a run with steps on two trace IDs, and confirm the span event and log record for one step appear once. Read a trace across two pages and check no span is skipped or repeated. Confirm missing token, denied query scope, and throttling fail without disclosing credentials or raw log bodies.
