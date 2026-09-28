import type { DiagnosticEvent } from "@q9labsai/diagnostics";
import type { Infer } from "convex/values";

import type { diagnosticEventValidator } from "../schema.js";

export function toStoredEvent(event: DiagnosticEvent): Infer<typeof diagnosticEventValidator> {
  return {
    version: event.version,
    traceId: event.traceId,
    spanId: event.spanId,
    eventId: event.eventId,
    occurredAt: event.occurredAt,
    source: event.source,
    kind: event.kind,
    name: event.name,
    status: event.status,
    level: event.level,
    ...(event.parentSpanId !== undefined && { parentSpanId: event.parentSpanId }),
    ...(event.journeyTraceId !== undefined && { journeyTraceId: event.journeyTraceId }),
    ...(event.durationMs !== undefined && { durationMs: event.durationMs }),
    ...(event.requestId !== undefined && { requestId: event.requestId }),
    ...(event.attributes !== undefined && { attributes: event.attributes }),
    ...(event.errorClass !== undefined && { errorClass: event.errorClass }),
    ...(event.safeMessage !== undefined && { safeMessage: event.safeMessage }),
    ...(event.safeStackFrames !== undefined && {
      safeStackFrames: event.safeStackFrames.map((frame) => ({
        file: frame.file,
        line: frame.line,
        ...(frame.column !== undefined && { column: frame.column }),
        ...(frame.function !== undefined && { function: frame.function }),
      })),
    }),
  };
}
