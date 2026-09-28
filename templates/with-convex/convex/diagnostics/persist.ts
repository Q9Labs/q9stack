import { diagnosticEventSchema, type DiagnosticEvent } from "@q9labsai/diagnostics";
import { v } from "convex/values";

import { internalMutation } from "../_generated/server.js";
import { toStoredEvent } from "./event.js";

export const persistFailure = internalMutation({
  args: {
    traceId: v.string(),
    subjectId: v.string(),
    functionName: v.string(),
    occurredAt: v.number(),
    safeStackFrames: v.optional(
      v.array(
        v.object({
          file: v.string(),
          line: v.number(),
          column: v.optional(v.number()),
          function: v.optional(v.string()),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const event: DiagnosticEvent = diagnosticEventSchema.parse({
      version: 1,
      traceId: args.traceId,
      spanId: args.traceId.slice(16),
      eventId: `server_${args.traceId}`,
      occurredAt: args.occurredAt,
      source: "server",
      kind: "error",
      name: "convex.function.failed",
      status: "error",
      level: "error",
      attributes: { function: args.functionName, source_surface: "web" },
      errorClass: "INTERNAL",
      safeStackFrames: args.safeStackFrames,
    });
    return await ctx.db.insert("diagnosticEvents", {
      event: toStoredEvent(event),
      traceId: event.traceId,
      eventId: event.eventId,
      occurredAt: event.occurredAt,
      receivedAt: Date.now(),
      subjectId: args.subjectId,
      sourceSurface: "web",
    });
  },
});
