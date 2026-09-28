import { diagnosticCodeSchema } from "@q9labsai/diagnostics";
import { v } from "convex/values";

import { internalQuery } from "../_generated/server.js";
import { diagnosticEventValidator } from "../schema.js";

const RETENTION = 14 * 24 * 60 * 60 * 1000;
const LIMIT = 2000;

export const trace = internalQuery({
  args: { traceId: v.string() },
  returns: v.object({
    events: v.array(diagnosticEventValidator),
    expired: v.optional(v.boolean()),
  }),
  handler: async (ctx, { traceId }) => {
    if (!diagnosticCodeSchema.safeParse(traceId).success) throw new Error("DIAGNOSTICS_INVALID");
    const direct = await ctx.db
      .query("diagnosticEvents")
      .withIndex("by_trace_occurred", (q) => q.eq("traceId", traceId))
      .take(LIMIT + 1);
    const journeyTraceId = direct.find(
      (row) => row.journeyTraceId && row.journeyTraceId !== traceId,
    )?.journeyTraceId;
    const journey = journeyTraceId
      ? await ctx.db
          .query("diagnosticEvents")
          .withIndex("by_trace_occurred", (q) => q.eq("traceId", journeyTraceId))
          .take(LIMIT + 1)
      : [];
    const subjectId = direct[0]?.subjectId;
    const cutoff = Date.now() - RETENTION;
    const combined = [...direct, ...journey].filter(
      (row) => row.subjectId === subjectId && row.receivedAt >= cutoff,
    );
    // oxlint-disable-next-line unicorn/no-array-sort -- Combined is a fresh bounded array, not shared state.
    combined.sort((a, b) => a.occurredAt - b.occurredAt || a.eventId.localeCompare(b.eventId));
    if (direct.length > LIMIT || journey.length > LIMIT || combined.length > LIMIT) {
      console.warn("diagnostics.lookup.truncated", { traceId });
    }
    return {
      events: combined
        .slice(0, LIMIT)
        .map((row) =>
          row.traceId === traceId
            ? row.event
            : { ...row.event, traceId, journeyTraceId: row.traceId },
        ),
      expired: direct.length > 0 && combined.length === 0,
    };
  },
});
