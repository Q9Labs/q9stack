import { Reactivity } from "@effect/experimental";
import { SqlClient, Statement, type SqlConnection } from "@effect/sql";
import { diagnosticEventSchema, diagnosticTraceBriefSchema } from "@q9labsai/diagnostics";
import { Effect, Stream } from "effect";
import { describe, expect, it } from "vitest";

import { lookupRun, lookupTrace } from "../src/lookup.js";

const event = diagnosticEventSchema.parse({
  version: 1,
  traceId: "1234567890abcdef1234567890abcdef",
  spanId: "1234567890abcdef",
  eventId: "event1",
  occurredAt: 1_700_000_000_000,
  source: "server",
  kind: "event",
  name: "flow.step",
  status: "ok",
  level: "info",
  attributes: { flow: "checkout", flow_run: "run-1", flow_step: "paid" },
});

const query = (statement: string, params: ReadonlyArray<unknown>) => {
  expect(statement).toContain("FROM diagnostic_events");
  expect(statement).toContain("ORDER BY occurred_at, event_id");
  return params[0] === event.traceId || params[0] === event.attributes?.flow_run ? [{ event }] : [];
};

function fakeSqlClient() {
  const connection: SqlConnection.Connection = {
    execute: (statement, params) => Effect.succeed(query(statement, params)),
    executeRaw: (statement, params) => Effect.succeed(query(statement, params)),
    executeUnprepared: (statement, params) => Effect.succeed(query(statement, params)),
    executeStream: (statement, params) => Stream.fromIterable(query(statement, params)),
    executeValues: () => Effect.succeed([]),
  };
  return SqlClient.make({
    acquirer: Effect.succeed(connection),
    compiler: Statement.makeCompilerSqlite(),
    spanAttributes: [],
  }).pipe(Effect.provide(Reactivity.layer));
}

describe("Postgres command lookup", () => {
  it("returns a schema-valid trace brief and not_found for missing codes", async () => {
    const sql = await Effect.runPromise(fakeSqlClient());
    const found = await Effect.runPromise(lookupTrace(sql, event.traceId));
    expect(diagnosticTraceBriefSchema.safeParse(found).success).toBe(true);
    expect(found.events).toEqual([event]);
    const missing = await Effect.runPromise(lookupTrace(sql, "abcdef1234567890abcdef1234567890"));
    expect(missing.completeness).toBe("not_found");
  });

  it("reads all retained flow events through SqlClient", async () => {
    const sql = await Effect.runPromise(fakeSqlClient());
    const result = await Effect.runPromise(lookupRun(sql, "run-1"));
    expect(result).toEqual({ events: [event] });
  });
});
