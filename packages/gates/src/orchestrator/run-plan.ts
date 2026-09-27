import { performance } from "node:perf_hooks";

import { gitStatus } from "../adapters/git.js";
import type { LaneFinding, LaneReport } from "../core/report.js";
import type { GateExec, GatePlan, LaneContext, LaneResult, PlannedLane } from "../core/types.js";

export interface RunPlanOptions {
  readonly repoRoot: string;
  readonly base?: string;
  readonly exec: GateExec;
  readonly concurrency: number;
  readonly paranoid: boolean;
  readonly onResult?: (result: LaneReport) => void;
}

function failureFinding(error: unknown): LaneFinding {
  return {
    file: "q9gate",
    rule: "lane-error",
    message: error instanceof Error ? error.message : String(error),
  };
}

function changedStatus(before: readonly string[], after: readonly string[]): readonly string[] {
  const initial = new Set(before);
  const final = new Set(after);
  return [
    ...before.filter((line) => !final.has(line)).map((line) => `removed ${line}`),
    ...after.filter((line) => !initial.has(line)).map((line) => `added ${line}`),
  ];
}

function laneReport(
  planned: PlannedLane,
  result: LaneResult,
  durationMs: number,
  extraFindings: readonly LaneFinding[] = [],
): LaneReport {
  const findings = [...(result.findings ?? []), ...extraFindings];
  const value: LaneReport = {
    id: planned.lane.id,
    status: extraFindings.length > 0 ? "failed" : result.status,
    reason: planned.reason,
    durationMs,
    ...(result.metrics === undefined ? {} : { metrics: result.metrics }),
    ...(result.baseline === undefined ? {} : { baseline: result.baseline }),
    ...(findings.length === 0 ? {} : { findings }),
  };
  return value;
}

async function runLane(
  planned: PlannedLane,
  context: LaneContext,
  options: RunPlanOptions,
): Promise<LaneReport> {
  const started = performance.now();
  try {
    const before = options.paranoid ? await gitStatus(options.exec, options.repoRoot) : [];
    const result = await planned.lane.run(context);
    const after = options.paranoid ? await gitStatus(options.exec, options.repoRoot) : before;
    const mutations = changedStatus(before, after);
    const mutationFindings = mutations.map((line) => ({
      file: "worktree",
      rule: "tree-mutation",
      message: `Lane ${planned.lane.id} changed the worktree: ${line}`,
    }));
    return laneReport(planned, result, performance.now() - started, mutationFindings);
  } catch (error: unknown) {
    return laneReport(
      planned,
      { status: "failed", findings: [failureFinding(error)] },
      performance.now() - started,
    );
  }
}

async function runPool(
  lanes: readonly PlannedLane[],
  context: LaneContext,
  options: RunPlanOptions,
): Promise<readonly LaneReport[]> {
  const results = new Map<number, LaneReport>();
  const assignments = lanes.entries();
  const worker = async (): Promise<void> => {
    for (let assignment = assignments.next(); !assignment.done; assignment = assignments.next()) {
      const [index, planned] = assignment.value;
      // oxlint-disable-next-line no-await-in-loop -- Each pool worker claims one lane at a time to enforce the concurrency limit.
      const result = await runLane(planned, context, options);
      results.set(index, result);
      options.onResult?.(result);
    }
  };
  const workers = Array.from({ length: Math.min(options.concurrency, lanes.length) }, async () =>
    worker(),
  );
  await Promise.all(workers);
  return lanes.flatMap((_, index) => {
    const result = results.get(index);
    return result === undefined ? [] : [result];
  });
}

export async function runPlan(
  plan: GatePlan,
  context: LaneContext,
  options: RunPlanOptions,
): Promise<readonly LaneReport[]> {
  const reports = new Map<string, LaneReport>();
  const pending: PlannedLane[] = [];
  const flush = async (): Promise<void> => {
    if (pending.length === 0) {
      return;
    }
    const completed = await runPool(pending.splice(0), context, options);
    for (const report of completed) {
      reports.set(report.id, report);
    }
  };

  for (const planned of plan.lanes) {
    if (!planned.selected) {
      const skipped: LaneReport = {
        id: planned.lane.id,
        status: "skipped",
        reason: planned.reason,
        durationMs: 0,
      };
      reports.set(skipped.id, skipped);
      options.onResult?.(skipped);
      continue;
    }
    if (planned.lane.exclusive === true) {
      // oxlint-disable-next-line no-await-in-loop -- Earlier concurrent lanes must finish before an exclusive lane starts.
      await flush();
      // oxlint-disable-next-line no-await-in-loop -- Exclusive lanes must finish before later lanes can be scheduled.
      const result = await runLane(planned, context, options);
      reports.set(result.id, result);
      options.onResult?.(result);
      continue;
    }
    pending.push(planned);
  }
  await flush();
  return plan.lanes.flatMap((entry) => {
    const report = reports.get(entry.lane.id);
    return report === undefined ? [] : [report];
  });
}
