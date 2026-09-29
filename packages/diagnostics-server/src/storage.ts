import { SqlClient } from "@effect/sql";
import { diagnosticEventSchema, type DiagnosticEvent } from "@q9labsai/diagnostics";
import { Effect } from "effect";

export function writeDiagnosticEvent(event: DiagnosticEvent) {
  return Effect.gen(function* () {
    const safe = diagnosticEventSchema.parse(event);
    const sql = yield* SqlClient.SqlClient;
    yield* sql`INSERT INTO diagnostic_events
      (event_id, trace_id, span_id, flow_run, occurred_at, event)
      VALUES (${safe.eventId}, ${safe.traceId}, ${safe.spanId},
        ${typeof safe.attributes?.flow_run === "string" ? safe.attributes.flow_run : null},
        ${safe.occurredAt}, ${JSON.stringify(safe)}::jsonb)`;
  });
}
