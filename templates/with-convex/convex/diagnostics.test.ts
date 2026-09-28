import {
  createDiagnosticCode,
  diagnosticEventSchema,
  sanitizeDiagnosticEvent,
} from "@q9labsai/diagnostics";
import corpus from "@q9labsai/diagnostics/fixtures/redaction-corpus.v1.json";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api.js";
import { toStoredEvent } from "./diagnostics/event.js";
import schema from "./schema.js";

const modules = import.meta.glob([
  "./_generated/*.{js,ts}",
  "./diagnostics/ingest.ts",
  "./diagnostics/lookup.ts",
  "./diagnostics/maintenance.ts",
]);
const DAY = 24 * 60 * 60 * 1000;

function event(traceId = createDiagnosticCode(), occurredAt = Date.now()) {
  return toStoredEvent(
    diagnosticEventSchema.parse({
      version: 1,
      traceId,
      spanId: "1111111111111111",
      eventId: "fixture_event",
      occurredAt,
      source: "browser",
      kind: "event",
      name: "browser.fixture",
      status: "ok",
      level: "info",
    }),
  );
}

describe("diagnostics conformance", () => {
  it("redacts the corpus at capture and rejects unsafe ingest and forged identity", async () => {
    const safe = toStoredEvent(
      sanitizeDiagnosticEvent({ ...event(), attributes: { ...corpus.safe, ...corpus.forbidden } }),
    );
    expect(safe.attributes).toEqual(corpus.safe);
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "member-1" });
    const unsafe = { ...event(), attributes: { email: "person@example.invalid" } };
    await expect(
      user.mutation(api.diagnostics.ingest.ingest, { events: [unsafe] }),
    ).rejects.toThrow();
    const forged = { ...event(), subjectId: "member-2" };
    await expect(
      user.mutation(api.diagnostics.ingest.ingest, { events: [forged] }),
    ).rejects.toThrow();
    await expect(t.mutation(api.diagnostics.ingest.ingest, { events: [safe] })).rejects.toThrow();
  });

  it("deduplicates, orders linked journey events, and returns empty for an unknown code", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "member-1" });
    const journeyId = createDiagnosticCode();
    const failureId = createDiagnosticCode();
    const now = Date.now();
    const journey = event(journeyId, now - 100);
    const failure = {
      ...event(failureId, now),
      journeyTraceId: journeyId,
      eventId: "failure_event",
    };
    expect(
      await user.mutation(api.diagnostics.ingest.ingest, { events: [journey, failure] }),
    ).toEqual({ accepted: 2 });
    expect(
      await user.mutation(api.diagnostics.ingest.ingest, { events: [journey, failure] }),
    ).toEqual({ accepted: 0 });
    const found = await t.query(internal.diagnostics.lookup.trace, { traceId: failureId });
    expect(found.events.map((item) => item.eventId)).toEqual(["fixture_event", "failure_event"]);
    expect(found.events[0]).toMatchObject({ traceId: failureId, journeyTraceId: journeyId });
    expect(
      await t.query(internal.diagnostics.lookup.trace, { traceId: createDiagnosticCode() }),
    ).toEqual({ events: [], expired: false });
  });

  it("rejects forged journey links and removes expired rows by receipt time", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "owner" });
    const other = t.withIdentity({ subject: "other" });
    const journeyId = createDiagnosticCode();
    await owner.mutation(api.diagnostics.ingest.ingest, { events: [event(journeyId)] });
    await expect(
      other.mutation(api.diagnostics.ingest.ingest, {
        events: [{ ...event(), eventId: "linked", journeyTraceId: journeyId }],
      }),
    ).rejects.toThrow("DIAGNOSTICS_INVALID");
    const expiredTraceId = createDiagnosticCode();
    await t.run(async (ctx) => {
      await ctx.db.insert("diagnosticEvents", {
        event: event(expiredTraceId),
        traceId: expiredTraceId,
        eventId: "expired",
        occurredAt: Date.now() - 15 * DAY,
        receivedAt: Date.now() - 15 * DAY,
        subjectId: "owner",
        sourceSurface: "web",
      });
    });
    expect(await t.query(internal.diagnostics.lookup.trace, { traceId: expiredTraceId })).toEqual({
      events: [],
      expired: true,
    });
    expect(await t.mutation(internal.diagnostics.maintenance.cleanupExpired, {})).toEqual({
      deleted: 1,
    });
    expect(
      await t.run(async (ctx) =>
        ctx.db
          .query("diagnosticEvents")
          .withIndex("by_trace_occurred", (q) => q.eq("traceId", expiredTraceId))
          .first(),
      ),
    ).toBeNull();
  });

  it("counts only new events toward the accepted-event quota", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "quota-member" });
    const traceId = createDiagnosticCode();
    const now = Date.now();
    await t.run(async (ctx) => {
      for (let index = 0; index < 499; index += 1) {
        const stored = { ...event(traceId, now), eventId: `existing_${index}` };
        await ctx.db.insert("diagnosticEvents", {
          event: stored,
          traceId,
          eventId: stored.eventId,
          occurredAt: now,
          receivedAt: now,
          subjectId: "quota-member",
          sourceSurface: "web",
        });
      }
    });
    const duplicate = { ...event(traceId, now), eventId: "existing_0" };
    const fresh = { ...event(traceId, now), eventId: "new_event" };
    expect(
      await user.mutation(api.diagnostics.ingest.ingest, { events: [duplicate, fresh] }),
    ).toEqual({ accepted: 1 });
  });
});
