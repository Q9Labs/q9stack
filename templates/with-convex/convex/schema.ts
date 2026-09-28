import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const sampleKindValidator = v.union(
  v.literal("draft"),
  v.literal("published"),
  v.literal("archived"),
);

export const accountRoleValidator = v.union(
  v.literal("admin"),
  v.literal("member"),
  v.literal("viewer"),
);

export const sampleInputValidator = v.union(
  v.object({
    id: v.string(),
    kind: v.literal("draft"),
    title: v.string(),
  }),
  v.object({
    id: v.string(),
    kind: v.literal("published"),
    publishedAt: v.string(),
    title: v.string(),
  }),
  v.object({
    archivedAt: v.string(),
    id: v.string(),
    kind: v.literal("archived"),
    title: v.string(),
  }),
);

export const sampleStoredValidator = v.union(
  v.object({
    fixtureId: v.string(),
    id: v.string(),
    kind: v.literal("draft"),
    title: v.string(),
  }),
  v.object({
    fixtureId: v.string(),
    id: v.string(),
    kind: v.literal("published"),
    publishedAt: v.string(),
    title: v.string(),
  }),
  v.object({
    archivedAt: v.string(),
    fixtureId: v.string(),
    id: v.string(),
    kind: v.literal("archived"),
    title: v.string(),
  }),
);

export const sampleDocumentValidator = v.union(
  v.object({
    _creationTime: v.number(),
    _id: v.id("samples"),
    fixtureId: v.string(),
    id: v.string(),
    kind: v.literal("draft"),
    title: v.string(),
  }),
  v.object({
    _creationTime: v.number(),
    _id: v.id("samples"),
    fixtureId: v.string(),
    id: v.string(),
    kind: v.literal("published"),
    publishedAt: v.string(),
    title: v.string(),
  }),
  v.object({
    _creationTime: v.number(),
    _id: v.id("samples"),
    archivedAt: v.string(),
    fixtureId: v.string(),
    id: v.string(),
    kind: v.literal("archived"),
    title: v.string(),
  }),
);

const samples = defineTable(sampleStoredValidator)
  .index("by_sample_id", ["id"])
  .index("by_kind", ["kind"])
  .index("by_fixture_id", ["fixtureId"]);

const devAccounts = defineTable({
  accountId: v.string(),
  email: v.string(),
  environment: v.literal("development"),
  role: accountRoleValidator,
})
  .index("by_account_id", ["accountId"])
  .index("by_email", ["email"]);

export const diagnosticEventValidator = v.object({
  version: v.literal(1),
  traceId: v.string(),
  spanId: v.string(),
  eventId: v.string(),
  occurredAt: v.number(),
  source: v.union(v.literal("browser"), v.literal("server")),
  kind: v.union(
    v.literal("navigation"),
    v.literal("request"),
    v.literal("event"),
    v.literal("error"),
    v.literal("span"),
  ),
  name: v.string(),
  status: v.union(v.literal("unset"), v.literal("ok"), v.literal("error")),
  level: v.union(v.literal("info"), v.literal("warning"), v.literal("error")),
  parentSpanId: v.optional(v.string()),
  journeyTraceId: v.optional(v.string()),
  durationMs: v.optional(v.number()),
  requestId: v.optional(v.string()),
  attributes: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))),
  errorClass: v.optional(v.string()),
  safeMessage: v.optional(v.string()),
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
});

const diagnosticEvents = defineTable({
  event: diagnosticEventValidator,
  traceId: v.string(),
  eventId: v.string(),
  journeyTraceId: v.optional(v.string()),
  occurredAt: v.number(),
  receivedAt: v.number(),
  subjectId: v.string(),
  sourceSurface: v.literal("web"),
})
  .index("by_trace_occurred", ["traceId", "occurredAt"])
  .index("by_trace_event", ["traceId", "eventId"])
  .index("by_journey_occurred", ["journeyTraceId", "occurredAt"])
  .index("by_subject_received", ["subjectId", "receivedAt"])
  .index("by_received", ["receivedAt"]);

const diagnosticIngestRequests = defineTable({
  subjectId: v.string(),
  receivedAt: v.number(),
})
  .index("by_subject_received", ["subjectId", "receivedAt"])
  .index("by_received", ["receivedAt"]);

export default defineSchema({
  devAccounts,
  diagnosticEvents,
  diagnosticIngestRequests,
  samples,
});
