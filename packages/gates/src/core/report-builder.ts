import type { GateReport, LaneReport } from "./report.js";
import type { GateScope } from "./types.js";

export interface GateReportInput {
  readonly repo: string;
  readonly ref: string;
  readonly scope: GateScope;
  readonly base?: string;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly concurrency: number;
  readonly lanes: readonly LaneReport[];
}

export function buildGateReport(input: GateReportInput): GateReport {
  const summary = {
    passed: input.lanes.filter((lane) => lane.status === "passed").length,
    failed: input.lanes.filter((lane) => lane.status === "failed").length,
    skipped: input.lanes.filter((lane) => lane.status === "skipped").length,
  };
  return {
    schemaVersion: 1,
    repo: input.repo,
    ref: input.ref,
    scope: input.scope,
    ...(input.base === undefined ? {} : { base: input.base }),
    startedAt: input.startedAt,
    durationMs: input.durationMs,
    concurrency: input.concurrency,
    lanes: [...input.lanes],
    summary,
  };
}
