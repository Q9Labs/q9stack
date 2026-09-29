import type { SqlClient } from "@effect/sql";
import {
  diagnosticCodeSchema,
  diagnosticEventSchema,
  diagnosticTraceBriefSchema,
  redactDiagnosticAttributes,
  type DiagnosticEvent,
  type DiagnosticTraceBrief,
} from "@q9labsai/diagnostics";
import { Effect } from "effect";

interface EventRow {
  readonly event: unknown;
}

const decodeRows = (rows: readonly EventRow[]): DiagnosticEvent[] =>
  rows.map((row) => diagnosticEventSchema.parse(row.event));

export function lookupTrace(sql: SqlClient.SqlClient, code: string, target = "development") {
  const traceId = diagnosticCodeSchema.parse(code);
  return Effect.gen(function* () {
    const rows = yield* sql<EventRow>`SELECT event FROM diagnostic_events
      WHERE trace_id = ${traceId} ORDER BY occurred_at, event_id LIMIT 501`;
    const events = decodeRows(rows.slice(0, 500));
    const truncated =
      rows.length > 500 ||
      events.filter((event) => event.kind === "error").length > 100 ||
      events.filter((event) => event.source === "server" && event.kind === "span").length > 200;
    const brief: DiagnosticTraceBrief = {
      version: 1,
      code: traceId,
      target,
      retrievedAt: new Date().toISOString(),
      completeness: events.length ? (truncated ? "partial" : "complete") : "not_found",
      summary: events.length ? (truncated ? "Trace truncated" : "Trace found") : "Trace not found",
      events,
      serverSpans: events
        .filter((event) => event.source === "server" && event.kind === "span")
        .slice(0, 200)
        .map((event) => {
          const span: DiagnosticTraceBrief["serverSpans"][number] = {
            traceId: event.traceId,
            spanId: event.spanId,
            name: event.name,
            occurredAt: event.occurredAt,
            status: event.status,
            correlation: "trace_id",
          };
          if (event.parentSpanId) span.parentSpanId = event.parentSpanId;
          if (event.durationMs !== undefined) span.durationMs = event.durationMs;
          return span;
        }),
      errors: events.filter((event) => event.kind === "error").slice(0, 100),
      links: [],
      visibilityGaps: [],
      truncated,
    };
    return diagnosticTraceBriefSchema.parse(brief);
  });
}

export function lookupRun(sql: SqlClient.SqlClient, run: string) {
  if (redactDiagnosticAttributes({ flow_run: run }).attributes?.flow_run !== run)
    throw new Error("Invalid flow run");
  return Effect.gen(function* () {
    const rows = yield* sql<EventRow>`SELECT event FROM diagnostic_events
      WHERE flow_run = ${run} ORDER BY occurred_at, event_id LIMIT 10001`;
    if (rows.length > 10_000) throw new Error("Flow run exceeds lookup bound");
    return { events: decodeRows(rows) };
  });
}
