import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { checkFlowRun, diagnosticEventSchema, flowDefinitionSchema } from "../src/index.js";

const fixture: unknown = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../fixtures/resume-import-flow.v1.json", import.meta.url)),
    "utf8",
  ),
);
const flow = flowDefinitionSchema.parse(fixture);
const traceId = "1234567890abcdef1234567890abcdef";
const base = 1_780_000_000_000;
function event(step: string, offset: number, outcome?: string) {
  return diagnosticEventSchema.parse({
    version: 1,
    traceId,
    spanId: "1234567890abcdef",
    eventId: `${step}_${offset}`,
    occurredAt: base + offset,
    source: "server",
    kind: "event",
    name: "resume.import",
    status: "ok",
    level: "info",
    attributes: {
      flow: flow.id,
      flow_run: "run_1",
      flow_step: step,
      ...(outcome ? { outcome } : {}),
    },
  });
}
function statuses(events: ReturnType<typeof event>[], now = base + 1_000_000) {
  return checkFlowRun(flow, events, now).steps.map((step) => step.status);
}

describe("FlowDefinition/v1 and flow checking", () => {
  it("checks the resume import branch for each outcome", () => {
    expect(
      statuses([
        event("uploaded", 0),
        event("parsed", 10_000),
        event("result", 20_000, "candidate_created"),
        event("scored", 30_000),
      ]),
    ).toEqual(["ok", "ok", "ok", "ok"]);
    for (const outcome of ["duplicate", "failed"])
      expect(
        statuses([event("uploaded", 0), event("parsed", 10_000), event("result", 20_000, outcome)]),
      ).toEqual(["ok", "ok", "ok", "not_observable"]);
  });
  it("distinguishes late, missing, and pending", () => {
    expect(
      statuses([
        event("uploaded", 0),
        event("parsed", 121_000),
        event("result", 122_000, "duplicate"),
      ])[1],
    ).toBe("late");
    expect(statuses([event("uploaded", 0)])[1]).toBe("missing");
    expect(statuses([event("uploaded", 0)], base + 119_000)[1]).toBe("pending");
  });
  it("allows two seconds of skew but reports more", () => {
    expect(
      statuses([
        event("uploaded", 10_000),
        event("parsed", 8_001),
        event("result", 12_000, "duplicate"),
      ])[1],
    ).toBe("ok");
    expect(
      statuses([
        event("uploaded", 10_000),
        event("parsed", 7_999),
        event("result", 12_000, "duplicate"),
      ])[1],
    ).toBe("out_of_order");
  });
  it("selects a later satisfying event after an early out-of-order event", () => {
    const result = checkFlowRun(
      flow,
      [
        event("uploaded", 10_000),
        event("parsed", 7_999),
        event("parsed", 12_000),
        event("result", 15_000, "duplicate"),
      ],
      base + 1_000_000,
    );
    expect(result.steps[1]?.status).toBe("ok");
    expect(result.steps[1]?.observedAt).toBe(base + 12_000);
  });
  it("blocks dependents when a branch outcome is invalid", () => {
    const result = checkFlowRun(
      flow,
      [
        event("uploaded", 0),
        event("parsed", 1_000),
        event("result", 2_000, "other"),
        event("scored", 3_000),
      ],
      base + 1_000_000,
    );
    expect(result.steps.map((step) => step.status)).toEqual([
      "ok",
      "ok",
      "not_observable",
      "not_observable",
    ]);
  });
  it("does not fail for best effort or unexpected steps", () => {
    const definition = flowDefinitionSchema.parse({
      id: "job",
      version: 1,
      steps: [{ id: "start" }, { id: "optional", after: ["start"], need: "best_effort" }],
    });
    const events = [
      diagnosticEventSchema.parse({
        ...event("start", 0),
        name: "job.start",
        attributes: { flow: "job", flow_run: "run_1", flow_step: "start" },
      }),
      diagnosticEventSchema.parse({
        ...event("extra", 1),
        name: "job.extra",
        attributes: { flow: "job", flow_run: "run_1", flow_step: "extra" },
      }),
    ];
    const result = checkFlowRun(definition, events, base + 1000);
    expect(result.verdict).toBe("ok");
    expect(result.steps[1]?.status).toBe("missing");
    expect(result.unexpected).toHaveLength(1);
  });
  it("rejects invalid references, cycles, outcomes, and durations with context", () => {
    for (const steps of [
      [{ id: "a", after: ["absent"] }],
      [
        { id: "a", after: ["b"] },
        { id: "b", after: ["a"] },
      ],
      [
        { id: "a", oneOf: ["yes", "no"] },
        { id: "b", after: ["a:other"] },
      ],
      [
        { id: "a", oneOf: ["yes", "no"] },
        { id: "b", after: ["a:"] },
      ],
      [{ id: "a", within: "soon" }],
      [{ id: "a", within: "" }],
    ]) {
      const result = flowDefinitionSchema.safeParse({ id: "job", version: 1, steps });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.message).toContain("Flow job, step");
    }
  });
});
