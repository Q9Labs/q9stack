import { diagnosticEventSchema, type DiagnosticEvent } from "@q9labsai/diagnostics";
import { v } from "convex/values";

import { mutation, type MutationCtx } from "../_generated/server.js";
import { diagnosticEventValidator } from "../schema.js";
import { toStoredEvent } from "./event.js";

const DAY = 24 * 60 * 60 * 1000;
const MAX_BATCH = 20;
const MAX_EVENTS_PER_DAY = 500;
const MAX_REQUESTS_PER_DAY = 100;

function validBrowserEvents(events: unknown[], now: number): DiagnosticEvent[] {
  return events.map((event) => {
    const parsed = diagnosticEventSchema.safeParse(event);
    if (
      !parsed.success ||
      parsed.data.source !== "browser" ||
      Math.abs(now - parsed.data.occurredAt) > 7 * DAY
    ) {
      throw new Error("DIAGNOSTICS_INVALID");
    }
    return parsed.data;
  });
}

async function verifyTraceLinks(
  ctx: MutationCtx,
  events: DiagnosticEvent[],
  subjectId: string,
): Promise<void> {
  for (const event of events) {
    const existingTrace = await ctx.db
      .query("diagnosticEvents")
      .withIndex("by_trace_occurred", (q) => q.eq("traceId", event.traceId))
      .first();
    if (existingTrace && existingTrace.subjectId !== subjectId)
      throw new Error("DIAGNOSTICS_INVALID");
    const linkedJourney = event.journeyTraceId;
    if (!linkedJourney || linkedJourney === event.traceId) continue;
    const existingJourney = await ctx.db
      .query("diagnosticEvents")
      .withIndex("by_trace_occurred", (q) => q.eq("traceId", linkedJourney))
      .first();
    if (existingJourney && existingJourney.subjectId !== subjectId)
      throw new Error("DIAGNOSTICS_INVALID");
    const inBatch = events.some((candidate) => candidate.traceId === linkedJourney);
    if (!existingJourney && !inBatch) throw new Error("DIAGNOSTICS_INVALID");
  }
}

async function findNewEvents(
  ctx: MutationCtx,
  events: DiagnosticEvent[],
  subjectId: string,
): Promise<DiagnosticEvent[]> {
  const result: DiagnosticEvent[] = [];
  const seen = new Set<string>();
  for (const event of events) {
    const key = `${event.traceId}:${event.eventId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const existing = await ctx.db
      .query("diagnosticEvents")
      .withIndex("by_trace_event", (q) =>
        q.eq("traceId", event.traceId).eq("eventId", event.eventId),
      )
      .unique();
    if (existing) {
      if (existing.subjectId !== subjectId) throw new Error("DIAGNOSTICS_INVALID");
      continue;
    }
    result.push(event);
  }
  return result;
}

export const ingest = mutation({
  args: { events: v.array(diagnosticEventValidator) },
  returns: v.object({ accepted: v.number() }),
  handler: async (ctx, { events }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("UNAUTHENTICATED");
    if (events.length < 1 || events.length > MAX_BATCH) throw new Error("DIAGNOSTICS_LIMIT");

    const now = Date.now();
    const subjectId = identity.subject;
    const recentRequests = await ctx.db
      .query("diagnosticIngestRequests")
      .withIndex("by_subject_received", (q) =>
        q.eq("subjectId", subjectId).gte("receivedAt", now - DAY),
      )
      .take(MAX_REQUESTS_PER_DAY);
    if (recentRequests.length >= MAX_REQUESTS_PER_DAY) throw new Error("DIAGNOSTICS_LIMIT");

    const validated = validBrowserEvents(events, now);
    await verifyTraceLinks(ctx, validated, subjectId);
    const newEvents = await findNewEvents(ctx, validated, subjectId);
    const recentEvents = await ctx.db
      .query("diagnosticEvents")
      .withIndex("by_subject_received", (q) =>
        q.eq("subjectId", subjectId).gte("receivedAt", now - DAY),
      )
      .take(MAX_EVENTS_PER_DAY);
    if (recentEvents.length + newEvents.length > MAX_EVENTS_PER_DAY)
      throw new Error("DIAGNOSTICS_LIMIT");

    for (const event of newEvents) {
      await ctx.db.insert("diagnosticEvents", {
        event: toStoredEvent(event),
        traceId: event.traceId,
        eventId: event.eventId,
        ...(event.journeyTraceId !== undefined && { journeyTraceId: event.journeyTraceId }),
        occurredAt: event.occurredAt,
        receivedAt: now,
        subjectId,
        sourceSurface: "web",
      });
    }
    await ctx.db.insert("diagnosticIngestRequests", { subjectId, receivedAt: now });
    return { accepted: newEvents.length };
  },
});
