import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

import { probeTool } from "../adapters/tool.js";
import type { LaneFinding } from "../core/report.js";
import type { GateLane, LaneContext, LaneResult } from "../core/types.js";
import { categoryTrigger } from "./trigger.js";

interface StackDirectory {
  readonly path: string;
  readonly displayPath: string;
}

function finding(file: string, rule: string, message: string): LaneFinding {
  return { file, rule, message };
}

async function stackDirectories(repoRoot: string): Promise<readonly StackDirectory[]> {
  const root = join(repoRoot, "infra", "stacks");
  let entries: readonly Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const name = entry.name;
      const path = join(root, name);
      return { path, displayPath: relative(repoRoot, path) };
    })
    .toSorted((left, right) => left.displayPath.localeCompare(right.displayPath));
}

async function runStackValidation(
  context: LaneContext,
  stacks: readonly StackDirectory[],
): Promise<readonly LaneFinding[]> {
  const results = await Promise.all(
    stacks.map(async (stack) => {
      // `validate` needs modules and providers resolved; `-backend=false` keeps init local-only.
      const init = await context.exec(
        "tofu",
        ["-chdir=" + stack.path, "init", "-backend=false", "-input=false"],
        { cwd: context.repoRoot },
      );
      if (init.failed) {
        return [
          finding(
            stack.displayPath,
            "tofu-init",
            init.stderr || init.stdout || "tofu init failed.",
          ),
        ];
      }
      const result = await context.exec("tofu", ["-chdir=" + stack.path, "validate"], {
        cwd: context.repoRoot,
      });
      return result.failed
        ? [
            finding(
              stack.displayPath,
              "tofu-validate",
              result.stderr || result.stdout || "tofu validate failed.",
            ),
          ]
        : [];
    }),
  );
  return results.flat();
}

async function runFormatCheck(context: LaneContext): Promise<readonly LaneFinding[]> {
  const result = await context.exec("tofu", ["fmt", "-check", "-recursive", "infra"], {
    cwd: context.repoRoot,
  });
  return result.failed
    ? [finding("infra", "tofu-format", result.stderr || result.stdout || "tofu fmt -check failed.")]
    : [];
}

interface OptionalToolResult {
  readonly findings: readonly LaneFinding[];
  readonly toolsSkipped: number;
}

async function runTflint(
  context: LaneContext,
  stacks: readonly StackDirectory[],
): Promise<OptionalToolResult> {
  const availability = await probeTool(
    context.exec,
    {
      command: "tflint",
      installHint: "Install TFLint (https://github.com/terraform-linters/tflint).",
    },
    context.repoRoot,
  );
  if (!availability.available) {
    return {
      findings: [finding("tflint", "optional-tool", availability.finding.message)],
      toolsSkipped: 1,
    };
  }
  const results = await Promise.all(
    stacks.map(async (stack) => {
      const result = await context.exec("tflint", ["--chdir", stack.path], {
        cwd: context.repoRoot,
      });
      return result.failed
        ? [finding(stack.displayPath, "tflint", result.stderr || result.stdout || "tflint failed.")]
        : [];
    }),
  );
  return { findings: results.flat(), toolsSkipped: 0 };
}

async function runTrivy(context: LaneContext): Promise<OptionalToolResult> {
  const availability = await probeTool(
    context.exec,
    {
      command: "trivy",
      installHint:
        "Install Trivy (https://aquasecurity.github.io/trivy/latest/getting-started/installation/).",
    },
    context.repoRoot,
  );
  if (!availability.available) {
    return {
      findings: [finding("trivy", "optional-tool", availability.finding.message)],
      toolsSkipped: 1,
    };
  }
  const result = await context.exec("trivy", ["config", "infra"], { cwd: context.repoRoot });
  return {
    findings: result.failed
      ? [finding("infra", "trivy-config", result.stderr || result.stdout || "trivy config failed.")]
      : [],
    toolsSkipped: 0,
  };
}

async function runTofu(
  context: LaneContext,
  stacks: readonly StackDirectory[],
): Promise<LaneResult> {
  const openTofu = await probeTool(
    context.exec,
    {
      command: "tofu",
      installHint: "Install OpenTofu (https://opentofu.org/docs/intro/install/).",
    },
    context.repoRoot,
  );
  if (!openTofu.available) {
    return {
      status: "failed",
      findings: [openTofu.finding],
      metrics: { stacksChecked: 0, toolsSkipped: 0 },
    };
  }

  const formatFindings = await runFormatCheck(context);
  const validationFindings = await runStackValidation(context, stacks);
  const tflint = await runTflint(context, stacks);
  const trivy = await runTrivy(context);
  const findings = [
    ...formatFindings,
    ...validationFindings,
    ...tflint.findings,
    ...trivy.findings,
  ];
  const toolsSkipped = tflint.toolsSkipped + trivy.toolsSkipped;
  const result: LaneResult = {
    status: findings.some((item) => item.rule !== "optional-tool") ? "failed" : "passed",
    metrics: { stacksChecked: stacks.length, toolsSkipped },
  };
  return findings.length > 0 ? { ...result, findings } : result;
}

export function tofu(): GateLane {
  return {
    id: "tofu",
    title: "OpenTofu infrastructure",
    categories: ["infra"],
    triggers: categoryTrigger(["infra"]),
    exclusive: true,
    run: async (context) => runTofu(context, await stackDirectories(context.repoRoot)),
  };
}
