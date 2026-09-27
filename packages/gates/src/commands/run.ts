import { basename } from "node:path";
import { performance } from "node:perf_hooks";

import { changedFiles, gitRef, resolveDefaultBase } from "../adapters/git.js";
import { writeGateReport } from "../adapters/report-writer.js";
import { printLaneResult, printPlan, printSummary, writeLine } from "../adapters/terminal.js";
import { classify } from "../core/classify.js";
import { plan, selectPlanLanes } from "../core/plan.js";
import { buildGateReport } from "../core/report-builder.js";
import type { GateConfig, GateExec, GateScope, LaneContext } from "../core/types.js";
import { resolveConcurrency } from "../orchestrator/concurrency.js";
import { runPlan } from "../orchestrator/run-plan.js";

export interface RunCommandOptions {
  readonly repoRoot: string;
  readonly config: GateConfig;
  readonly exec: GateExec;
  readonly staged: boolean;
  readonly full: boolean;
  readonly base?: string;
  readonly lanes: readonly string[];
  readonly concurrency?: number | `${number}%`;
  readonly json: boolean;
  readonly paranoid: boolean;
}

function commandScope(options: RunCommandOptions): GateScope {
  const explicitScopes =
    Number(options.staged) + Number(options.full) + Number(options.base !== undefined);
  if (explicitScopes > 1) {
    throw new Error("Choose only one of --staged, --base <ref>, or --full.");
  }
  if (options.full) {
    return "full";
  }
  if (options.base !== undefined) {
    return "branch";
  }
  return "staged";
}

export async function runCommand(options: RunCommandOptions): Promise<number> {
  const scope = commandScope(options);
  const base =
    scope === "branch"
      ? (options.base ?? (await resolveDefaultBase(options.exec, options.repoRoot)))
      : undefined;
  const files = await changedFiles(options.exec, options.repoRoot, scope, base);
  const classification = classify(files, options.config.classifiers);
  const initialPlan = plan(classification, options.config.lanes, scope);
  const gatePlan = selectPlanLanes(initialPlan, options.lanes);
  printPlan(gatePlan);

  const concurrency = resolveConcurrency(options.concurrency ?? options.config.concurrency);
  const startedAt = new Date();
  const started = performance.now();
  const context: LaneContext = {
    repoRoot: options.repoRoot,
    changedFiles: classification.changedFiles,
    classification,
    scope,
    exec: options.exec,
    ...(base === undefined ? {} : { base }),
  };
  const laneReports = await runPlan(gatePlan, context, {
    repoRoot: options.repoRoot,
    exec: options.exec,
    concurrency,
    paranoid: options.paranoid,
    onResult: printLaneResult,
    ...(base === undefined ? {} : { base }),
  });
  const report = buildGateReport({
    repo: basename(options.repoRoot),
    ref: await gitRef(options.exec, options.repoRoot),
    scope,
    startedAt: startedAt.toISOString(),
    durationMs: performance.now() - started,
    concurrency,
    lanes: laneReports,
    ...(base === undefined ? {} : { base }),
  });
  await writeGateReport(options.repoRoot, report);
  printSummary(report);
  if (options.json) {
    writeLine(JSON.stringify(report, null, 2));
  }
  return report.summary.failed > 0 ? 1 : 0;
}
