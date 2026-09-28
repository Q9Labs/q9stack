import { v } from "convex/values";

import { internal } from "../_generated/api.js";
import { internalMutation } from "../_generated/server.js";

const DAY = 24 * 60 * 60 * 1000;
const LIMIT = 500;

export const cleanupExpired = internalMutation({
  args: {},
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx) => {
    const cutoff = Date.now() - 14 * DAY;
    const events = await ctx.db
      .query("diagnosticEvents")
      .withIndex("by_received", (q) => q.lt("receivedAt", cutoff))
      .take(LIMIT);
    const requests = await ctx.db
      .query("diagnosticIngestRequests")
      .withIndex("by_received", (q) => q.lt("receivedAt", Date.now() - DAY))
      .take(LIMIT - events.length);
    for (const row of events) await ctx.db.delete(row._id);
    for (const row of requests) await ctx.db.delete(row._id);
    if (events.length + requests.length === LIMIT) {
      await ctx.scheduler.runAfter(0, internal.diagnostics.maintenance.cleanupExpired, {});
    }
    return { deleted: events.length + requests.length };
  },
});
