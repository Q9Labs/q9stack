# Go diagnostics recipe

<!-- cspell:ignore httpapi Getenv tracenoop logglobal lognoop otlptracehttp Errorf otlploghttp sdklog otelhttp episodediagnostics otelslog tolower gsub -->

## Problem and reference

Give agents one 32-hex trace code that retrieves a redacted error brief, its server span and log records, and any recorded flow steps. Chalk's reference is `chalk/apps/api/internal/observability/otel.go:47-95,155-184`, `chalk/apps/api/internal/observability/diagnostics.go:54-88`, and `chalk/apps/api/internal/observability/slog.go:35-49`; its HTTP error envelope is `chalk/apps/api/internal/httpapi/response.go:8-20`. Link this recipe from the adopting product's `AGENTS.md`.

## Capture

The OTLP/HTTP exporters read `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS` (and signal-specific header overrides). Do not construct exporters when the endpoint is unset; install no-op providers instead. Keep `Shutdown` in the application's graceful-stop path.

```go
func installTelemetry(ctx context.Context) (func(context.Context) error, error) {
	if os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT") == "" {
		otel.SetTracerProvider(tracenoop.NewTracerProvider())
		logglobal.SetLoggerProvider(lognoop.NewLoggerProvider())
		otel.SetTextMapPropagator(propagation.TraceContext{})
		return func(context.Context) error { return nil }, nil
	}

	traces, err := otlptracehttp.New(ctx) // endpoint and headers come from OTEL_* env
	if err != nil {
		return nil, fmt.Errorf("create OTLP trace exporter: %w", err)
	}
	logs, err := otlploghttp.New(ctx)
	if err != nil {
		return nil, fmt.Errorf("create OTLP log exporter: %w", err)
	}
	tracerProvider := sdktrace.NewTracerProvider(sdktrace.WithBatcher(traces))
	loggerProvider := sdklog.NewLoggerProvider(
		sdklog.WithProcessor(redactLogs{}),
		sdklog.WithProcessor(sdklog.NewBatchProcessor(logs)),
	)
	otel.SetTracerProvider(tracerProvider)
	logglobal.SetLoggerProvider(loggerProvider)
	otel.SetTextMapPropagator(propagation.TraceContext{})
	return func(ctx context.Context) error {
		return errors.Join(tracerProvider.Shutdown(ctx), loggerProvider.Shutdown(ctx))
	}, nil
}
```

Wrap the HTTP handler with `otelhttp.NewHandler(next, "http.server.request")`. It extracts a valid incoming `traceparent` or starts a root trace. Use that span's `TraceID().String()` as the diagnostic code. If capture is disabled and the no-op span has no valid ID, reuse a valid incoming trace ID or mint a W3C-format ID for the response; it will not be queryable until export is enabled.

An unexpected failure returns only the safe code and class, never `err.Error()`:

```go
func writeInternal(w http.ResponseWriter, code string) {
	w.Header().Set("x-q9-diagnostic-code", code)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusInternalServerError)
	_ = json.NewEncoder(w).Encode(map[string]string{"code": code, "error": "INTERNAL"})
}
```

Use only names from [`ATTRIBUTE_KEYS`](../packages/diagnostics/src/index.ts); for example `flow`, `flow_run`, `flow_step`, `outcome`, and `error_code`. Allowlist names and validate bounded values before recording span attributes/events. The Go span SDK's `SpanProcessor.OnEnd` receives a read-only span, so do not claim it can rewrite attributes there. For auto-instrumentation that adds other names, filter in a trusted local Collector before it exports to Axiom, or disable those attributes. For logs, put a sanitizing `sdklog.Processor` before the batch exporter; it must replace the body with a fixed safe message and replace (not append to) attributes:

```go
var safeRunID = regexp.MustCompile(`^[A-Fa-f0-9]{32}$`)

func safeAttrs(attrs ...attribute.KeyValue) []attribute.KeyValue {
	var safe []attribute.KeyValue
	for _, kv := range attrs {
		if safeDiagnosticAttr(kv) {
			safe = append(safe, kv)
		}
	}
	return safe
}

func safeDiagnosticAttr(kv attribute.KeyValue) bool {
	value := kv.Value.AsString()
	switch kv.Key {
	case "flow":
		return value == "recording.provider.callback"
	case "flow_run":
		return safeRunID.MatchString(value) // generated opaque run ID, never a user ID
	case "flow_step":
		return value == "authorized_branch" || value == "attempt" || value == "provider_result" || value == "artifact_state"
	case "outcome":
		return value == "authorized" || value == "denied" || value == "started" || value == "stored" || value == "rejected" || value == "available" || value == "missing"
	default:
		return false
	}
}

type redactLogs struct{}

func (redactLogs) Enabled(context.Context, sdklog.EnabledParameters) bool { return true }
func (redactLogs) OnEmit(_ context.Context, r *sdklog.Record) error {
	var safe []attribute.KeyValue
	r.WalkAttributes(func(kv attribute.KeyValue) bool {
		if safeDiagnosticAttr(kv) {
			safe = append(safe, kv)
		}
		return true
	})
	r.SetAttributes(safe...)
	r.SetBody(attribute.StringValue("diagnostic event"))
	return nil
}
func (redactLogs) ForceFlush(context.Context) error { return nil }
func (redactLogs) Shutdown(context.Context) error   { return nil }
```

This deliberately keeps only the flow keys used below; extend `safeDiagnosticAttr` only with names present in `ATTRIBUTE_KEYS` and an equally narrow value rule. Never record request bodies, raw paths, provider responses, exception messages, or stack text. No sensitive value may reach Axiom and be redacted there.

## Record a flow step

Chalk's recording callback checkpoint catalog is `chalk/apps/api/internal/episodediagnostics/checkpoint_catalog.go:137-138` and `chalk/packages/diagnostics-contracts/src/actions.ts:124`. Preserve those step names and put a stable run ID on every step, including across traces. Generate it once per run from 16 cryptographically random bytes and hex-encode it; never use a user or account ID:

```go
const flow = "recording.provider.callback"

func recordStep(ctx context.Context, span trace.Span, logger *slog.Logger, run, step, outcome string) {
	attrs := []attribute.KeyValue{
		attribute.String("flow", flow), attribute.String("flow_run", run),
		attribute.String("flow_step", step), attribute.String("outcome", outcome),
	}
	span.AddEvent("q9.flow.step", trace.WithAttributes(safeAttrs(attrs...)...))
	logger.InfoContext(ctx, "q9.flow.step", "flow", flow, "flow_run", run, "flow_step", step, "outcome", outcome)
}
```

Attach `otelslog.NewHandler("q9.server")` to the diagnostic `slog.Logger` so `InfoContext` emits an OTel log record with the active trace context. Keep the flow definition in `diagnostics/flows.json` (a JSON array). For this callback, define `authorized_branch` (`authorized|denied`), `attempt` after `authorized_branch:authorized`, `provider_result` after `attempt` (`stored|rejected`), and conditional `artifact_state` after `provider_result:stored`. Log and span events must carry the same four safe attributes.

```json
[
  {
    "id": "recording.provider.callback",
    "version": 1,
    "steps": [
      { "id": "authorized_branch", "oneOf": ["authorized", "denied"] },
      {
        "id": "attempt",
        "after": ["authorized_branch:authorized"],
        "within": "30s",
        "need": "conditional"
      },
      {
        "id": "provider_result",
        "after": ["attempt"],
        "within": "30s",
        "oneOf": ["stored", "rejected"]
      },
      {
        "id": "artifact_state",
        "after": ["provider_result:stored"],
        "within": "30s",
        "oneOf": ["available", "missing"],
        "need": "conditional"
      }
    ]
  }
]
```

## Read it with q9

Use the Axiom source for exported telemetry. `org`, `traces`, `logs`, and the read-only query-token environment variable are explicit:

```json
{
  "diag": {
    "sources": [
      {
        "adapter": "axiom",
        "org": "<axiom-org-id>",
        "traces": "<product>-prod-traces",
        "logs": "<product>-prod-logs",
        "tokenEnv": "AXIOM_QUERY_TOKEN"
      }
    ]
  }
}
```

Add a `command` source when the product also needs its own database tables in the brief (Chalk's episode records in Postgres are the reference); the command owns its query and authorization, not the q9 CLI. See [the command adapter recipe](diagnostics-command.md) and [flow lookup](diagnostics-flows.md).

## Conformance check

With a local-only `__diag/recording-provider-callback` fixture that emits all four steps and then throws, run:

```sh
curl -sS -D /tmp/q9-diag.headers -o /tmp/q9-diag.body -X POST http://127.0.0.1:8080/__diag/recording-provider-callback
CODE="$(awk 'tolower($1) == "x-q9-diagnostic-code:" { gsub("\r", "", $2); print $2 }' /tmp/q9-diag.headers)"
test "${#CODE}" -eq 32
jq -e --arg code "$CODE" '.code == $code and .error == "INTERNAL"' /tmp/q9-diag.body
q9 diag trace "$CODE" --json > /tmp/q9-diag.brief.json
jq -e '.serverSpans | length > 0' /tmp/q9-diag.brief.json
jq -e '.events | any(.name == "q9.flow.step")' /tmp/q9-diag.brief.json
jq -e '.flows[] | select(.flow == "recording.provider.callback") | .steps[] | select(.id == "provider_result" and .status == "ok")' /tmp/q9-diag.brief.json
```

The brief must show the server span and safe log record; inspect the text form with `q9 diag trace "$CODE"` to confirm the log line is readable. Repeat with an incoming `traceparent` to prove parent continuation. Do not ship the fixture.

## Chalk differences today

Chalk Go reads `CHALK_API_OTLP_ENDPOINT` rather than the standard endpoint variable (`chalk/apps/api/internal/config/config.go:26,464-466`); its production env has signal-specific headers (`chalk/infrastructure/managed-episode/env/api.env.example:15-18`). Its `writeError` currently returns a nested `{error:{code,message}}` body and no diagnostic header (`chalk/apps/api/internal/httpapi/response.go:14-20`). It also emits names such as `chalk.journey.id`, `journey_id`, `trace_id`, and `span_id` (`chalk/apps/api/internal/observability/otel.go:190-192`, `chalk/apps/api/internal/observability/slog.go:39-48`) and has no `ATTRIBUTE_KEYS` redactor. These are existing implementation details, not conformance examples.
