import { probeTool } from "../adapters/tool.js";
import type { LaneFinding } from "../core/report.js";
import type { GateExec, GateLane, LaneContext, LaneResult } from "../core/types.js";
import { categoryTrigger } from "./trigger.js";

export interface ContractDriftOptions {
  readonly generate: string;
  readonly paths?: readonly string[];
  /** Override the lane id when a gate declares more than one drift check. */
  readonly id?: string;
  readonly title?: string;
}

interface DirtyPath {
  readonly path: string;
  readonly status: string;
  readonly untracked: boolean;
  readonly worktreeDirty: boolean;
}

function finding(file: string, rule: string, message: string): LaneFinding {
  return { file, rule, message };
}

function commandResultText(stdout: string, stderr: string): string {
  return stderr.trim() || stdout.trim();
}

function dirtyPaths(output: string): readonly DirtyPath[] {
  return output
    .split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .filter((line) => line.length >= 3)
    .map((line) => {
      const status = line.slice(0, 2);
      const rawPath = line.slice(3).trim();
      const renameParts = rawPath.split(" -> ");
      const path = renameParts[renameParts.length - 1] ?? rawPath;
      return {
        path,
        status,
        untracked: status === "??",
        worktreeDirty: status === "??" || status[1] !== " ",
      };
    })
    .filter((entry) => entry.path.length > 0);
}

function gitPathArgs(paths: readonly string[] | undefined): readonly string[] {
  return paths === undefined || paths.length === 0 ? [] : ["--", ...paths];
}

async function statusPaths(
  exec: GateExec,
  repoRoot: string,
  paths?: readonly string[],
): Promise<readonly DirtyPath[]> {
  const result = await exec(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all", ...gitPathArgs(paths)],
    { cwd: repoRoot },
  );
  if (result.failed) {
    throw new Error(
      commandResultText(result.stdout, result.stderr) || "Could not inspect generated files.",
    );
  }
  return dirtyPaths(result.stdout);
}

async function changedNames(
  exec: GateExec,
  repoRoot: string,
  paths: readonly string[] | undefined,
): Promise<readonly string[]> {
  const result = await exec("git", ["diff", "--name-only", ...gitPathArgs(paths)], {
    cwd: repoRoot,
  });
  if (result.failed) {
    throw new Error(
      commandResultText(result.stdout, result.stderr) || "Could not inspect generated diff.",
    );
  }
  return result.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function restoreChangedPaths(
  exec: GateExec,
  repoRoot: string,
  changed: readonly DirtyPath[],
): Promise<void> {
  if (changed.length === 0) {
    return;
  }
  const tracked = changed.filter((entry) => !entry.untracked).map((entry) => entry.path);
  const untracked = changed.filter((entry) => entry.untracked).map((entry) => entry.path);
  if (tracked.length > 0) {
    const checkout = await exec("git", ["checkout", "--", ...tracked], { cwd: repoRoot });
    if (checkout.failed) {
      throw new Error(
        commandResultText(checkout.stdout, checkout.stderr) || "Could not restore generated files.",
      );
    }
  }
  if (untracked.length > 0) {
    const clean = await exec("git", ["clean", "-f", "--", ...untracked], { cwd: repoRoot });
    if (clean.failed) {
      throw new Error(
        commandResultText(clean.stdout, clean.stderr) || "Could not remove generated files.",
      );
    }
  }
}

function changedPaths(
  before: readonly DirtyPath[],
  after: readonly DirtyPath[],
): readonly DirtyPath[] {
  const beforeStates = new Set(before.map((entry) => `${entry.status}:${entry.path}`));
  return after.filter((entry) => !beforeStates.has(`${entry.status}:${entry.path}`));
}

async function driftFindings(
  exec: GateExec,
  repoRoot: string,
  paths: readonly string[] | undefined,
  changedByRun: readonly DirtyPath[],
): Promise<readonly LaneFinding[]> {
  const diffFiles = await changedNames(exec, repoRoot, paths);
  const allDiffFiles = [...new Set([...diffFiles, ...changedByRun.map((entry) => entry.path)])];
  if (allDiffFiles.length === 0) {
    return [];
  }
  const diff = await exec("git", ["diff", ...gitPathArgs(paths)], { cwd: repoRoot });
  const detail = commandResultText(diff.stdout, diff.stderr);
  return allDiffFiles.map((file) =>
    finding(
      file,
      "generated-drift",
      detail || "Generated output differs from the committed files.",
    ),
  );
}

interface GenerationOutcome {
  readonly after: readonly DirtyPath[];
  readonly changedByRun: readonly DirtyPath[];
  readonly generationError?: string;
  readonly findings: readonly LaneFinding[];
}

async function executeGeneration(
  context: LaneContext,
  generate: string,
  paths: readonly string[] | undefined,
  before: readonly DirtyPath[],
): Promise<GenerationOutcome> {
  const generated = await context.exec("sh", ["-c", generate], { cwd: context.repoRoot });
  const generationError = generated.failed
    ? commandResultText(generated.stdout, generated.stderr) || "Generation command failed."
    : undefined;
  const after = await statusPaths(context.exec, context.repoRoot);
  const changedByRun = changedPaths(before, after);
  const findings = await driftFindings(context.exec, context.repoRoot, paths, changedByRun);
  return {
    after,
    changedByRun,
    ...(generationError === undefined ? {} : { generationError }),
    findings,
  };
}

interface RecoveryOutcome {
  readonly after: readonly DirtyPath[];
  readonly finding?: LaneFinding;
}

async function recoverGeneration(
  context: LaneContext,
  before: readonly DirtyPath[],
): Promise<RecoveryOutcome> {
  let after: readonly DirtyPath[] = [];
  try {
    after = await statusPaths(context.exec, context.repoRoot);
    await restoreChangedPaths(context.exec, context.repoRoot, changedPaths(before, after));
    return { after };
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    return { after, finding: finding(".", "restore-failed", detail) };
  }
}

async function runGeneration(
  context: LaneContext,
  generate: string,
  paths?: readonly string[],
): Promise<LaneResult> {
  const findings: LaneFinding[] = [];
  let before: readonly DirtyPath[] = [];
  let after: readonly DirtyPath[] = [];
  let generationError: string | undefined;

  try {
    before = await statusPaths(context.exec, context.repoRoot);
    const unsafeBefore = before.filter((entry) => entry.worktreeDirty);
    if (unsafeBefore.length > 0) {
      return {
        status: "failed",
        findings: unsafeBefore.map((entry) =>
          finding(
            entry.path,
            "preexisting-generated-change",
            "Generated paths have unstaged or untracked changes. Commit or stage them before checking drift so q9gate can restore safely.",
          ),
        ),
      };
    }
    const outcome = await executeGeneration(context, generate, paths, before);
    after = outcome.after;
    findings.push(...outcome.findings);
    generationError = outcome.generationError;
    await restoreChangedPaths(context.exec, context.repoRoot, outcome.changedByRun);
  } catch (error: unknown) {
    generationError = error instanceof Error ? error.message : String(error);
    const recovery = await recoverGeneration(context, before);
    after = recovery.after;
    if (recovery.finding !== undefined) {
      findings.push(recovery.finding);
    }
  }

  if (generationError !== undefined) {
    findings.push(finding(".", "generation-failed", generationError));
  }
  const failed = findings.length > 0;
  const result: LaneResult = {
    status: failed ? "failed" : "passed",
    metrics: { filesChecked: after.length },
  };
  return failed ? { ...result, findings } : result;
}

export function contractDrift(options: ContractDriftOptions): GateLane {
  return {
    id: options.id ?? "contract-drift",
    title: options.title ?? "Generated contract drift",
    categories: ["contract"],
    triggers: categoryTrigger(["contract"]),
    exclusive: true,
    run: (context) => runGeneration(context, options.generate, options.paths),
  };
}

export function convexCodegenDrift(): GateLane {
  return {
    id: "convex-codegen-drift",
    title: "Convex codegen drift",
    categories: ["contract"],
    triggers: categoryTrigger(["contract"]),
    exclusive: true,
    run: async (context) => {
      const availability = await probeTool(
        context.exec,
        {
          command: "convex",
          installHint: "Install Convex with `pnpm add convex`, then rerun the codegen drift gate.",
        },
        context.repoRoot,
      );
      if (!availability.available) {
        return { status: "failed", findings: [availability.finding] };
      }
      return runGeneration(context, "convex codegen");
    },
  };
}
