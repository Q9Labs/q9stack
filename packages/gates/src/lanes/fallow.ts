import { access } from "node:fs/promises";
import { join, resolve } from "node:path";

import { probeTool } from "../adapters/tool.js";
import type { LaneMetrics } from "../core/report.js";
import type { CommandResult, GateLane, LaneContext, LaneResult } from "../core/types.js";
import { outputFindings } from "./lane-report.js";
import { categoryTrigger } from "./trigger.js";

export interface FallowOptions {
  readonly baselineDir?: string;
}

const baselineNames = [
  ["dead-code", "--dead-code-baseline"],
  ["health", "--health-baseline"],
  ["dupes", "--dupes-baseline"],
] as const;

function metric(output: string, patterns: readonly RegExp[]): number | undefined {
  for (const pattern of patterns) {
    const match = pattern.exec(output);
    const value = match?.[1];
    if (value !== undefined) {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

function metricsFromOutput(output: string): LaneMetrics | undefined {
  const deadCode = metric(output, [/(?:dead[\s_-]*code|deadCode)[^\d]*(\d+)/iu]);
  const dupes = metric(output, [/(?:dupe|duplicate)[^\d]*(\d+)/iu]);
  const complexityOverBaseline = metric(output, [
    /(?:complexity|complexityOverBaseline)[^\d]*(\d+)/iu,
  ]);
  const dependencyIssues = metric(output, [
    /(?:dependency|dependencies|dependencyIssues)[^\d]*(\d+)/iu,
  ]);
  const metrics: LaneMetrics = {
    ...(deadCode === undefined ? {} : { deadCode }),
    ...(dupes === undefined ? {} : { dupes }),
    ...(complexityOverBaseline === undefined ? {} : { complexityOverBaseline }),
    ...(dependencyIssues === undefined ? {} : { dependencyIssues }),
  };
  return Object.keys(metrics).length === 0 ? undefined : metrics;
}

async function baselineArgs(repoRoot: string, baselineDir: string): Promise<readonly string[]> {
  const args = await Promise.all(
    baselineNames.map(async ([name, flag]): Promise<readonly string[]> => {
      const relativePath = join(baselineDir, `${name}.json`);
      const path = resolve(repoRoot, relativePath);
      try {
        await access(path);
        return [flag, relativePath];
      } catch (error: unknown) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
          return [];
        }
        throw error;
      }
    }),
  );
  return args.flat();
}

// Mirrors Fallow's own base detection: upstream, origin defaults, then local defaults.
const AUDIT_BASE_REFS = [
  "@{upstream}",
  "origin/HEAD",
  "origin/main",
  "origin/master",
  "main",
  "master",
] as const;

async function detectableAuditBase(context: LaneContext): Promise<boolean> {
  for (const ref of AUDIT_BASE_REFS) {
    const result = await context.exec(
      "git",
      ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`],
      { cwd: context.repoRoot },
    );
    if (!result.failed) {
      return true;
    }
  }
  return false;
}

async function rootCommit(context: LaneContext): Promise<string | undefined> {
  const result = await context.exec("git", ["rev-list", "--max-parents=0", "HEAD"], {
    cwd: context.repoRoot,
  });
  if (result.failed) {
    return undefined;
  }
  const commits = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return commits.at(-1);
}

interface FallowInvocation {
  readonly args: readonly string[];
  readonly input?: string;
}

type FallowPreparation =
  | { readonly kind: "ready"; readonly invocation: FallowInvocation }
  | { readonly kind: "failed"; readonly result: LaneResult };

async function fallowInvocation(
  context: LaneContext,
  options: FallowOptions,
): Promise<FallowPreparation> {
  const args = ["audit"];
  let input: string | undefined;
  if (context.scope === "staged") {
    const diff = await context.exec("git", ["diff", "--cached", "--no-ext-diff", "--binary"], {
      cwd: context.repoRoot,
    });
    if (diff.failed) {
      return {
        kind: "failed",
        result: {
          status: "failed",
          findings: [
            {
              file: "git",
              rule: "diff",
              message: diff.stderr || diff.stdout || "Could not read staged changes for Fallow.",
            },
          ],
        },
      };
    }
    args.push("--diff-stdin");
    input = diff.stdout;
  }
  if (context.scope === "branch" && context.base !== undefined) {
    args.push("--changed-since", context.base);
  }
  if (!args.includes("--changed-since") && !(await detectableAuditBase(context))) {
    // Fresh repositories without an upstream or origin default branch break Fallow's
    // base detection; the root commit keeps the audit's changed-since contract intact.
    const fallback = await rootCommit(context);
    if (fallback !== undefined) {
      args.push("--changed-since", fallback);
    }
  }
  args.push(
    ...(await baselineArgs(context.repoRoot, options.baselineDir ?? "gates/baselines/fallow")),
  );
  const invocation = input === undefined ? { args } : { args, input };
  return { kind: "ready", invocation };
}

function fallowCommandResult(result: CommandResult): LaneResult {
  const output = `${result.stdout}\n${result.stderr}`.trim();
  if (!result.failed) {
    const metrics = metricsFromOutput(output);
    return metrics === undefined ? { status: "passed" } : { status: "passed", metrics };
  }

  const findings = outputFindings(output, { fallbackFile: "fallow", rule: "audit" });
  const metrics = metricsFromOutput(output);
  const resultFindings =
    findings.length === 0
      ? [{ file: "fallow", rule: "audit", message: "Fallow audit failed." }]
      : findings;
  return metrics === undefined
    ? { status: "failed", findings: resultFindings }
    : { status: "failed", findings: resultFindings, metrics };
}

async function executeFallow(
  context: LaneContext,
  invocation: FallowInvocation,
): Promise<LaneResult> {
  try {
    const result = await context.exec("fallow", invocation.args, {
      cwd: context.repoRoot,
      ...(invocation.input === undefined ? {} : { input: invocation.input }),
    });
    return fallowCommandResult(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "failed",
      findings: [{ file: "fallow", rule: "execution", message }],
    };
  }
}

async function runFallow(context: LaneContext, options: FallowOptions): Promise<LaneResult> {
  const available = await probeTool(
    context.exec,
    {
      command: "fallow",
      installHint: "Install Fallow with `pnpm add -D fallow`, then rerun the gate.",
    },
    context.repoRoot,
  );
  if (!available.available) {
    return { status: "failed", findings: [available.finding] };
  }
  const invocation = await fallowInvocation(context, options);
  if (invocation.kind === "failed") {
    return invocation.result;
  }
  return executeFallow(context, invocation.invocation);
}

export function fallow(options: FallowOptions = {}): GateLane {
  return {
    id: "fallow",
    title: "Fallow changed-code audit",
    categories: ["source"],
    triggers: categoryTrigger(["source"]),
    baseline: { path: options.baselineDir ?? "gates/baselines/fallow", format: "directory" },
    run: (context) => runFallow(context, options),
  };
}
