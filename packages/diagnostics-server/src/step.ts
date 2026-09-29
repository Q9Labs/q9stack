import { randomUUID } from "node:crypto";

import { diagnosticEventSchema, type DiagnosticEvent } from "@q9labsai/diagnostics";
import { Effect } from "effect";

export function recordStep(
  flow: string,
  run: string,
  step: string,
  outcome?: string,
): Effect.Effect<DiagnosticEvent> {
  return Effect.gen(function* () {
    const span = yield* Effect.currentSpan.pipe(Effect.orDie);
    const attributes = { flow, flow_run: run, flow_step: step, ...(outcome ? { outcome } : {}) };
    const event = diagnosticEventSchema.parse({
      version: 1,
      traceId: span.traceId,
      spanId: span.spanId,
      eventId: randomUUID().replaceAll("-", ""),
      occurredAt: Date.now(),
      source: "server",
      kind: "event",
      name: "flow.step",
      status: "ok",
      level: "info",
      attributes,
    });
    yield* Effect.sync(() =>
      span.event("flow.step", BigInt(event.occurredAt) * 1_000_000n, attributes),
    );
    return event;
  });
}
