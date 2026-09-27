import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  createDiagnosticCode,
  diagnosticAttributesSchema,
  diagnosticEventSchema,
  diagnosticTraceBriefSchema,
  isDiagnosticCode,
  redactDiagnosticAttributes,
  safeIdSchema,
  sanitizeDiagnosticEvent,
} from "../src/index.js";

async function fixture(name: string): Promise<unknown> {
  return JSON.parse(await readFile(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));
}

describe("DiagnosticCode/v1", () => {
  it("generates nonzero W3C trace IDs", () => {
    const codes = Array.from({ length: 100 }, createDiagnosticCode);
    expect(codes.every(isDiagnosticCode)).toBe(true);
    expect(new Set(codes).size).toBe(100);
    expect(isDiagnosticCode("0".repeat(32))).toBe(false);
    expect(isDiagnosticCode("A".repeat(32))).toBe(false);
  });
});

describe("DiagnosticEvent/v1", () => {
  it("accepts the conformance events", async () => {
    const events = await fixture("valid-events.v1.json");
    expect(Array.isArray(events)).toBe(true);
    if (!Array.isArray(events)) return;
    expect(events.every((event) => diagnosticEventSchema.safeParse(event).success)).toBe(true);
  });

  it("rejects secrets, malformed IDs, large values, wrong versions and raw causes", async () => {
    const cases = z
      .array(z.object({ reason: z.string(), event: z.unknown() }))
      .parse(await fixture("rejected-events.v1.json"));
    for (const item of cases) {
      const parsed = diagnosticEventSchema.safeParse(item.event);
      expect(parsed.success, item.reason).toBe(false);
    }
  });

  it("redacts the generic corpus and sanitizes before queueing", async () => {
    const parsed = z
      .object({
        safe: diagnosticAttributesSchema,
        forbidden: z.record(z.string(), z.unknown()),
      })
      .parse(await fixture("redaction-corpus.v1.json"));
    const result = redactDiagnosticAttributes({ ...parsed.safe, ...parsed.forbidden });
    expect(result.attributes).toEqual(parsed.safe);
    expect(result.redactedKeys).toEqual(Object.keys(parsed.forbidden));
    const events = await fixture("valid-events.v1.json");
    if (!Array.isArray(events)) return;
    const event = sanitizeDiagnosticEvent({
      ...events[0],
      attributes: { ...parsed.safe, ...parsed.forbidden },
      safeMessage: "Bearer private token",
    });
    expect(event.attributes).toEqual(parsed.safe);
    expect(event.safeMessage).toBeUndefined();
    expect(JSON.stringify(event)).not.toContain("private");
  });

  it("keeps only location frames and fails closed on unknown ID classes", () => {
    expect(
      safeIdSchema.safeParse({ idClass: "product.database", value: "safe-looking-id" }).success,
    ).toBe(false);
    expect(
      safeIdSchema.safeParse({ idClass: "posthog.session", value: "opaqueReplaySession12" })
        .success,
    ).toBe(true);
    expect(
      safeIdSchema.safeParse({ idClass: "posthog.session", value: "person@example.com" }).success,
    ).toBe(false);
    expect(
      safeIdSchema.safeParse({ idClass: "q9.diagnostic", value: "opaqueReplaySession12" }).success,
    ).toBe(false);
    expect(diagnosticTraceBriefSchema.safeParse({ version: 2 }).success).toBe(false);
  });
});
