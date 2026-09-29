# @q9labsai/diagnostics-server

Node/Effect diagnostics capture for HTTP applications. The diagnostic code is the W3C trace ID. The package exports `diagnosticsLayer(serviceName)`, `diagnosticMiddleware`, `recordStep(flow, run, step, outcome?)`, `writeDiagnosticEvent(event)`, and exporter redaction helpers. No collector is required in local development: without `OTEL_EXPORTER_OTLP_ENDPOINT`, the layer is empty and request codes still work.

## HTTP and OTLP

Wrap an `@effect/platform` app with `diagnosticMiddleware`, and provide `diagnosticsLayer("my-api")` to the server layer. The middleware continues a valid incoming `traceparent`, otherwise starts a new trace. It sets `x-q9-diagnostic-code` on responses and returns `{ "code": "<trace id>", "error": "INTERNAL" }` for an unexpected failure. It never returns the cause or message.

Set `OTEL_EXPORTER_OTLP_ENDPOINT` to an OTLP/HTTP base URL and optionally `OTEL_EXPORTER_OTLP_HEADERS` to comma-separated `key=value` pairs. The layer exports to `/v1/traces` and `/v1/logs`. Before export, span and event attributes and log-record attributes pass the diagnostics allowlist and sanitizer. Span names, log bodies, resource attributes, links, and status messages are constrained so they cannot carry raw request data.

`recordStep` must run within a span. It records a `flow.step` span event and returns a schema-valid `DiagnosticEvent/v1`; pass that event to your own persistence queue or to `writeDiagnosticEvent` if using Postgres.

## Postgres command source

Apply [the migration](migrations/0001_diagnostic_events.sql) to the product database. `writeDiagnosticEvent` validates the event and inserts it through an `@effect/sql` `SqlClient`. Schedule the 14-day delete query documented in the migration with a maintenance role.

Configure a product with `"diag": { "adapter": "command", "command": ["q9-diag-pg"] }` in `q9.config.json` and `"diag": "q9 diag"` in package scripts. The bin reads `DATABASE_URL` and supports `trace <code>` and `run <flowRun>`, with optional `--prod` or `--deployment <name>` target labels. Use a **read-only database role** for lookup; possession of a diagnostic code must not grant database access. The operator selects the appropriate database by setting `DATABASE_URL` for that target. Failed lookups print no credentials or raw causes.

The command emits a bounded `DiagnosticTraceBrief/v1` for a trace and `{ "events": DiagnosticEvent/v1[] }` for a flow run. Unknown traces return a valid `not_found` brief. Storage and lookup never use a CLI-owned database driver.
