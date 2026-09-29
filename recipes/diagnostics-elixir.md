# Elixir diagnostics recipe

<!-- cspell:ignore tracestate defmodule defp episodediagnostics tolower gsub -->

## Problem and reference

Give agents a retrievable, redacted brief for an Elixir request or worker, correlated by its W3C trace ID. Chalk Sync's references are `chalk/apps/sync/config/runtime.exs:382-393`, `chalk/apps/sync/mix.exs:25-38`, and `chalk/apps/sync/lib/chalk_sync/observability.ex:45-61,301-368,398-430`. Link this recipe from the adopting product's `AGENTS.md`.

## Capture

Use the `opentelemetry_api`, `opentelemetry`, `opentelemetry_exporter` (1.11.0 or later) and, for logs, `opentelemetry_experimental` (0.6.0 or later) Hex packages. Map the standard endpoint and headers into Erlang application config at boot; do not install an exporter or log handler when the endpoint is unset (the API remains no-op):

```elixir
case System.get_env("OTEL_EXPORTER_OTLP_ENDPOINT") do
  nil -> :ok
  "" -> :ok
  endpoint ->
    headers =
      System.get_env("OTEL_EXPORTER_OTLP_HEADERS", "")
      |> String.split(",", trim: true)
      |> Enum.map(fn pair ->
        [key, value] = String.split(pair, "=", parts: 2)
        {key, URI.decode(value)}
      end)

    config :opentelemetry,
      span_processor: :batch,
      traces_exporter: :otlp

    config :opentelemetry_exporter,
      otlp_protocol: :http_protobuf,
      otlp_endpoint: endpoint,
      otlp_headers: headers
end
```

Extract `traceparent` (and `tracestate`) at the HTTP boundary with `:otel_propagator_text_map.extract_to/3`; an empty carrier starts a new trace. Read the diagnostic code from `OpenTelemetry.Span.hex_trace_id/1` for the active span. If capture is disabled and the no-op span has no valid ID, reuse a valid incoming trace ID or mint a W3C-format ID for the response; it will not be queryable until export is enabled. Chalk follows the same extraction pattern in `chalk/apps/sync/lib/chalk_sync/observability.ex:45-61,339-355`.

```elixir
carrier = Enum.filter(request_headers, fn {key, _value} -> key in ["traceparent", "tracestate"] end)
parent = :otel_propagator_text_map.extract_to(:otel_ctx.new(), :otel_propagator_trace_context, carrier)
span = :otel_tracer.start_span(parent, :opentelemetry.get_application_tracer(__MODULE__), "http.server.request", %{kind: :server})
ctx = :otel_tracer.set_current_span(parent, span)
trace_id = OpenTelemetry.Span.hex_trace_id(:otel_tracer.current_span_ctx(ctx))
```

For an unexpected Plug error, set the response header and return a fixed body; do not expose the exception or stack:

```elixir
def internal_error(conn, trace_id) do
  body = Jason.encode!(%{code: trace_id, error: "INTERNAL"})

  conn
  |> Plug.Conn.put_resp_header("x-q9-diagnostic-code", trace_id)
  |> Plug.Conn.send_resp(500, body)
end
```

Use only [`ATTRIBUTE_KEYS`](../packages/diagnostics/src/index.ts). Filter span event and logger metadata before handing them to an exporter: keep a strict key allowlist (`flow`, `flow_run`, `flow_step`, `outcome`, `error_code` are examples), validate bounded safe values, replace free-text bodies with fixed messages, and drop everything else. Never export raw exceptions, request data, provider payloads, URLs, tokens, or IDs. Put an Erlang `:logger` filter ahead of the OTel handler so unrelated or unsafe application log events are stopped rather than exported.

The OpenTelemetry Erlang logger handler is `:otel_log_handler` and uses the OTLP exporter. Use a handler filter that forwards only the fixed diagnostic event and its four allowlisted flow keys:

```elixir
defmodule Q9.OtelLogFilter do
  @keys [:flow, :flow_run, :flow_step, :outcome]
  @correlation_keys [:otel_trace_id, :otel_span_id]
  @run_id ~r/^[A-Fa-f0-9]{32}$/
  @trace_id ~r/^[A-Fa-f0-9]{32}$/
  @span_id ~r/^[A-Fa-f0-9]{16}$/

  def filter(%{msg: {"q9.flow.step", []}, meta: meta} = event, _extra) do
    safe = Map.take(meta, @keys)
    correlation = Map.take(meta, @correlation_keys)

    if map_size(safe) == 4 and Enum.all?(safe, &safe_attr?/1) and
         Map.has_key?(correlation, :otel_trace_id) and Map.has_key?(correlation, :otel_span_id) and
         is_binary(correlation.otel_trace_id) and Regex.match?(@trace_id, correlation.otel_trace_id) and
         is_binary(correlation.otel_span_id) and Regex.match?(@span_id, correlation.otel_span_id) do
      %{event | meta: Map.merge(correlation, safe)}
    else
      :stop
    end
  end

  def filter(_event, _extra), do: :stop

  defp safe_attr?({:flow, "recording.provider.callback"}), do: true
  defp safe_attr?({:flow_run, value}) when is_binary(value), do: Regex.match?(@run_id, value)

  defp safe_attr?({:flow_step, value}),
    do: value in ["authorized_branch", "attempt", "provider_result", "artifact_state"]

  defp safe_attr?({:outcome, value}),
    do: value in ["authorized", "denied", "started", "stored", "rejected", "available", "missing"]
  defp safe_attr?(_attribute), do: false
end

:ok =
  :logger.add_handler(:q9_otel, :otel_log_handler, %{
    level: :info,
    exporter: {:opentelemetry_exporter, %{protocol: :http_protobuf}},
    filters: [{:q9_allowlist, {&Q9.OtelLogFilter.filter/2, nil}}],
    filter_default: :stop
  })
```

The OTLP log path needs `opentelemetry_experimental` 0.6.0 or later with `opentelemetry_exporter` 1.11.0 or later, both released 2026-09-15. Earlier releases dispatched logs to a module missing from the Hex packages and could stall on idle export ([upstream issue #1006](https://github.com/open-telemetry/opentelemetry-erlang/issues/1006)). Stdout logs are not exported OTel logs. Sync exports spans but no logs today, so its briefs miss Sync log lines until this handler is added and passes the conformance check below.

## Record a flow step

Chalk's checkpoint catalog names `authorized_branch`, `attempt`, `provider_result`, and `artifact_state` for `recording.provider.callback` (`chalk/apps/api/internal/episodediagnostics/checkpoint_catalog.go:137-138`; `chalk/packages/diagnostics-contracts/src/actions.ts:124`). Generate `flow_run` once per run from 16 cryptographically random bytes and hex-encode it; reuse it across traces, never use a user or account ID:

```elixir
def record_step(ctx, span, run, step, outcome) do
  attrs = safe_attrs(%{
    "flow" => "recording.provider.callback",
    "flow_run" => run,
    "flow_step" => step,
    "outcome" => outcome
  })

  :otel_span.add_event(span, "q9.flow.step", attrs)
  Logger.info("q9.flow.step", [
    otel_trace_id: OpenTelemetry.Span.hex_trace_id(:otel_tracer.current_span_ctx(ctx)),
    otel_span_id: OpenTelemetry.Span.hex_span_id(:otel_tracer.current_span_ctx(ctx)),
    flow: attrs["flow"], flow_run: attrs["flow_run"],
    flow_step: attrs["flow_step"], outcome: attrs["outcome"]
  ])
end
```

`safe_attrs/1` is the pre-export filter; only keys in `ATTRIBUTE_KEYS` and bounded safe values survive. Implement it as:

```elixir
@run_id ~r/^[A-Fa-f0-9]{32}$/

def safe_attrs(attrs) do
  Enum.reduce(attrs, %{}, fn
    {"flow", "recording.provider.callback"}, safe ->
      Map.put(safe, "flow", "recording.provider.callback")
    {"flow_run", value}, safe when is_binary(value) ->
      if Regex.match?(@run_id, value), do: Map.put(safe, "flow_run", value), else: safe
    {"flow_step", value}, safe
    when value in ["authorized_branch", "attempt", "provider_result", "artifact_state"] ->
      Map.put(safe, "flow_step", value)
    {"outcome", value}, safe
    when value in ["authorized", "denied", "started", "stored", "rejected", "available", "missing"] ->
      Map.put(safe, "outcome", value)
    _unsafe, safe -> safe
  end)
end
```

At the call site, put `otel_trace_id` and `otel_span_id` into Erlang Logger metadata from the active span context; the handler must encode them as OTLP log correlation fields, not as attributes. Define the same four-step `recording.provider.callback` flow in `diagnostics/flows.json` as in the [Go recipe](diagnostics-go.md). Emit each checkpoint as both a span event and a correlated log record.

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

Configure the Axiom source with the dataset names and a read-only query token:

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

Add a `command` source when own-database tables (for example, Chalk's Postgres episode records) must be joined into the same brief. Keep database drivers and query authorization in that product-owned command; see [the command adapter recipe](diagnostics-command.md) and [flow lookup](diagnostics-flows.md).

## Conformance check

With a local-only `__diag/recording-provider-callback` endpoint that emits the four checkpoints and then raises, run:

```sh
curl -sS -D /tmp/q9-diag.headers -o /tmp/q9-diag.body -X POST http://127.0.0.1:4100/__diag/recording-provider-callback
CODE="$(awk 'tolower($1) == "x-q9-diagnostic-code:" { gsub("\r", "", $2); print $2 }' /tmp/q9-diag.headers)"
test "${#CODE}" -eq 32
jq -e --arg code "$CODE" '.code == $code and .error == "INTERNAL"' /tmp/q9-diag.body
q9 diag trace "$CODE" --json > /tmp/q9-diag.brief.json
jq -e '.serverSpans | length > 0' /tmp/q9-diag.brief.json
jq -e '.events | any(.name == "q9.flow.step")' /tmp/q9-diag.brief.json
jq -e '.flows[] | select(.flow == "recording.provider.callback") | .steps[] | select(.id == "provider_result" and .status == "ok")' /tmp/q9-diag.brief.json
```

Inspect the text form with `q9 diag trace "$CODE"` to confirm the log line is readable. Repeat with an incoming `traceparent`. Do not ship the fixture. This check must fail while the released logger/exporter pair cannot export logs; a span-only result is not complete.

## Chalk differences today

Sync reads `CHALK_SYNC_OTLP_ENDPOINT`, not `OTEL_EXPORTER_OTLP_ENDPOINT`, and configures no OTLP headers or logger handler (`chalk/apps/sync/config/runtime.exs:382-393`, `chalk/apps/sync/mix.exs:25-38`). It does extract W3C trace context, but its span attributes include `chalk.journey.id`, `chalk.sync.event`, and `chalk.sync.stage`, and its Logger metadata contains `journey_id` and an unfiltered attribute map (`chalk/apps/sync/lib/chalk_sync/observability.ex:301-355,398-424`). Production env config currently supplies trace headers only (`chalk/infrastructure/managed-episode/env/sync.env.example:29-31`). Sync therefore does not yet conform to the q9 attribute allowlist/redaction rule or provide OTel logs. These are documented gaps, not examples to copy.
