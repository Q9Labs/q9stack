import { describe, expect, it } from "vitest";

import { isGateReport, validateGateReport } from "../../src/core/report.js";

const validReport = {
  schemaVersion: 1,
  repo: "q9stack",
  ref: "abc123",
  scope: "branch",
  base: "origin/main",
  startedAt: "2026-08-23T00:00:00.000Z",
  durationMs: 1250,
  concurrency: 4,
  lanes: [
    {
      id: "fallow",
      status: "passed",
      reason: "12 source files changed",
      durationMs: 320,
      metrics: { deadCode: 3, dupes: 1, complexityOverBaseline: 0 },
      baseline: { before: 14, after: 14 },
      findings: [
        { file: "packages/core/src/old.ts", line: 1, rule: "dead-code", message: "unused export" },
      ],
    },
    {
      id: "docs-only",
      status: "skipped",
      reason: "skipped: documentation-only change",
      durationMs: 0,
    },
  ],
  summary: { passed: 1, failed: 0, skipped: 1 },
};

describe("gate report schema v1", () => {
  it("accepts a complete report with metrics, baselines, and findings", () => {
    const report = validateGateReport(validReport);

    expect(report.schemaVersion).toBe(1);
    expect(report.lanes).toHaveLength(2);
    expect(report.lanes[0]?.metrics?.deadCode).toBe(3);
    expect(isGateReport(validReport)).toBe(true);
  });

  it("accepts a report without the optional base, metrics, baseline, or findings", () => {
    const report = {
      schemaVersion: 1,
      repo: "repo",
      ref: "working-tree",
      scope: "full",
      startedAt: "2026-08-23T00:00:00Z",
      durationMs: 0,
      concurrency: 1,
      lanes: [{ id: "hygiene", status: "skipped", reason: "not configured", durationMs: 0 }],
      summary: { passed: 0, failed: 0, skipped: 1 },
    };

    expect(validateGateReport(report)).toMatchObject({ repo: "repo", scope: "full" });
  });

  it("rejects wrong versions and malformed top-level fields", () => {
    expect(isGateReport({ ...validReport, schemaVersion: 2 })).toBe(false);
    expect(isGateReport({ ...validReport, repo: "" })).toBe(false);
    expect(isGateReport({ ...validReport, scope: "staged-ish" })).toBe(false);
    expect(isGateReport({ ...validReport, startedAt: "not-a-date" })).toBe(false);
    expect(isGateReport({ ...validReport, durationMs: -1 })).toBe(false);
    expect(isGateReport({ ...validReport, concurrency: 0 })).toBe(false);
    expect(isGateReport({ ...validReport, lanes: undefined })).toBe(false);
    expect(isGateReport({ ...validReport, summary: { passed: 2, failed: 0, skipped: 0 } })).toBe(
      false,
    );
  });

  it("rejects malformed lane results and findings", () => {
    expect(
      isGateReport({
        ...validReport,
        lanes: [{ id: "test", status: "running", reason: "checking", durationMs: 1 }],
      }),
    ).toBe(false);
    expect(
      isGateReport({
        ...validReport,
        lanes: [
          {
            id: "test",
            status: "failed",
            reason: "failed",
            durationMs: 1,
            findings: [{ file: "x.ts", line: 0, rule: "r", message: "m" }],
          },
        ],
      }),
    ).toBe(false);
    expect(
      isGateReport({
        ...validReport,
        lanes: [
          {
            id: "test",
            status: "failed",
            reason: "failed",
            durationMs: 1,
            baseline: { before: -1, after: 0 },
          },
        ],
      }),
    ).toBe(false);
  });

  it("throws a validation error when parsing malformed input", () => {
    expect(() => validateGateReport({ ...validReport, schemaVersion: 0 })).toThrow();
    expect(() => validateGateReport(null)).toThrow();
  });
});
