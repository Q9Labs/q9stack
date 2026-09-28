import { basename } from "node:path";
import { performance } from "node:perf_hooks";

import {
  changedFiles,
  gitRef,
  optionalDefaultBase,
  resolveDefaultBase,
  validateExplicitFiles,
} from "../adapters/git.js";
import { writeGateReport } from "../adapters/report-writer.js";
import { printLaneResult, printPlan, printSummary, writeLine } from "../adapters/terminal.js";
import { classify } from "../core/classify.js";
import { GatePlanningError, plan, selectPlanLanes } from "../core/plan.js";
import { canonicalRepoRelativePath } from "../core/repo-path.js";
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
  readonly files?: readonly string[];
  readonly target?: string;
  readonly lanes: readonly string[];
  readonly concurrency?: number | `${number}%`;
  readonly json: boolean;
  readonly paranoid: boolean;
}

interface RunSelection {
  readonly scope: GateScope;
  readonly workspaceRoots?: readonly string[];
  readonly base?: string;
  readonly files: readonly string[];
  readonly classification: ReturnType<typeof classify>;
  readonly scopedClassification: ReturnType<typeof classify>;
  readonly gatePlan: ReturnType<typeof plan>;
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

function normalizeTargetRoot(input: string, target: string): string {
  const normalized = canonicalRepoRelativePath(input);
  if (normalized === undefined) {
    throw new GatePlanningError(
      "invalid-target-path",
      `Target "${target}" contains a non-canonical repo-relative path: "${input}".`,
    );
  }
  return normalized;
}

function targetRoots(config: GateConfig, target?: string): readonly string[] {
  if (target === undefined) {
    return config.workspaceRoots;
  }
  const targets = config.targets;
  if (targets === undefined || !Object.hasOwn(targets, target)) {
    const known = Object.keys(targets ?? {}).toSorted();
    const detail =
      known.length === 0 ? "No targets are configured." : `Known targets: ${known.join(", ")}.`;
    throw new GatePlanningError("unknown-target", `Unknown target "${target}". ${detail}`);
  }
  const roots = targets[target];
  if (roots === undefined || roots.length === 0) {
    throw new GatePlanningError(
      "empty-target",
      `Target "${target}" must declare at least one path.`,
    );
  }
  return roots.map((root) => normalizeTargetRoot(root, target));
}

function isWithinTarget(file: string, roots: readonly string[]): boolean {
  return roots.some((root) => file === root || file.startsWith(`${root}/`));
}

async function runBase(options: RunCommandOptions, scope: GateScope): Promise<string | undefined> {
  if (scope === "branch") {
    return options.base ?? (await resolveDefaultBase(options.exec, options.repoRoot));
  }
  return optionalDefaultBase(options.exec, options.repoRoot);
}

async function runFiles(
  options: RunCommandOptions,
  scope: GateScope,
  base: string | undefined,
): Promise<readonly string[]> {
  if (options.files === undefined) {
    return changedFiles(options.exec, options.repoRoot, scope, base);
  }
  return validateExplicitFiles(
    options.exec,
    options.repoRoot,
    options.files,
    base ?? (scope === "staged" ? "HEAD" : undefined),
    scope === "branch",
  );
}

function classifyRunFiles(
  files: readonly string[],
  config: GateConfig,
  workspaceRoots: readonly string[] | undefined,
): Pick<RunSelection, "classification" | "scopedClassification"> {
  const plannedFiles =
    workspaceRoots === undefined
      ? files
      : files.filter((file) => isWithinTarget(file, workspaceRoots));
  const classification = classify(plannedFiles, config.classifiers);
  const outOfTargetGateDefinition =
    workspaceRoots === undefined
      ? undefined
      : classify(
          files.filter((file) => !isWithinTarget(file, workspaceRoots)),
          config.classifiers,
        ).categories.find((category) => category.category === "gateDefinition")?.files[0];
  const scopedClassification =
    outOfTargetGateDefinition === undefined
      ? classification
      : {
          ...classification,
          fullRequired: true,
          fullReason: `${outOfTargetGateDefinition} changes gate behavior`,
        };
  return { classification, scopedClassification };
}

async function selectRun(options: RunCommandOptions): Promise<RunSelection> {
  const scope = commandScope(options);
  const workspaceRoots =
    options.target === undefined ? undefined : targetRoots(options.config, options.target);
  const base = await runBase(options, scope);
  const files = await runFiles(options, scope, base);
  const { classification, scopedClassification } = classifyRunFiles(
    files,
    options.config,
    workspaceRoots,
  );
  const initialPlan = plan(scopedClassification, options.config.lanes, scope, {
    target: options.target,
    allChangedFiles: files,
  });
  const gatePlan = selectPlanLanes(initialPlan, options.lanes);
  return {
    scope,
    ...(workspaceRoots === undefined ? {} : { workspaceRoots }),
    ...(base === undefined ? {} : { base }),
    files,
    classification,
    scopedClassification,
    gatePlan,
  };
}

function laneContext(options: RunCommandOptions, selection: RunSelection): LaneContext {
  return {
    repoRoot: options.repoRoot,
    ...(selection.workspaceRoots === undefined ? {} : { workspaceRoots: selection.workspaceRoots }),
    changedFiles: selection.classification.changedFiles,
    allChangedFiles: selection.files,
    classification: selection.scopedClassification,
    explicitFileSelection: options.files !== undefined || options.target !== undefined,
    scope: selection.scope,
    target: options.target,
    exec: options.exec,
    ...(selection.base === undefined ? {} : { base: selection.base }),
  };
}

async function executeSelectedRun(options: RunCommandOptions, selection: RunSelection) {
  const concurrency = resolveConcurrency(options.concurrency ?? options.config.concurrency);
  const startedAt = new Date();
  const started = performance.now();
  const laneReports = await runPlan(selection.gatePlan, laneContext(options, selection), {
    repoRoot: options.repoRoot,
    exec: options.exec,
    concurrency,
    paranoid: options.paranoid,
    onResult: printLaneResult,
    ...(selection.base === undefined ? {} : { base: selection.base }),
  });
  return buildGateReport({
    repo: basename(options.repoRoot),
    ref: await gitRef(options.exec, options.repoRoot),
    scope: selection.scope,
    startedAt: startedAt.toISOString(),
    durationMs: performance.now() - started,
    concurrency,
    lanes: laneReports,
    ...(selection.base === undefined ? {} : { base: selection.base }),
  });
}

export async function runCommand(options: RunCommandOptions): Promise<number> {
  const selection = await selectRun(options);
  printPlan(selection.gatePlan);
  const report = await executeSelectedRun(options, selection);
  await writeGateReport(options.repoRoot, report);
  printSummary(report);
  if (options.json) {
    writeLine(JSON.stringify(report, null, 2));
  }
  return report.summary.failed > 0 ? 1 : 0;
}
