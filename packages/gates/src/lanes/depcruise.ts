import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { resolve } from "node:path";

import glob from "fast-glob";
import { z } from "zod";

import { probeTool, type ToolRequirement } from "../adapters/tool.js";
import type { GateLane, LaneContext, LaneResult } from "../core/types.js";
import { commandFinding } from "./command.js";
import { categoryTrigger } from "./trigger.js";

export interface DepcruiseLaneOptions {
  readonly config?: string;
  readonly source?: string;
}

const depcruiseTool: ToolRequirement = {
  command: "depcruise",
  installHint:
    "Install dependency-cruiser with TypeScript <7 in dependency-cruiser's dependency context, then rerun q9gate.",
};

const depcruiseReportSchema = z.object({
  modules: z.array(z.object({ source: z.string() })),
});

const typeScriptFiles = "**/*.{ts,tsx}";
const ignoredTypeScriptPaths = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/.turbo/**",
  "**/.worktrees/**",
  "**/.wrangler/**",
  "**/.output/**",
  "**/test/fixtures/**",
  "**/tests/fixtures/**",
  "**/__tests__/fixtures/**",
  "**/__fixtures__/**",
];

async function findTool(context: LaneContext): Promise<ToolRequirement> {
  const configPackageTool = resolve(
    context.repoRoot,
    "node_modules/@q9labsai/config-depcruise/node_modules/.bin/depcruise",
  );
  try {
    await access(configPackageTool, constants.X_OK);
    return { ...depcruiseTool, command: configPackageTool };
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      "code" in error &&
      ["ENOENT", "ENOTDIR", "EACCES", "EPERM"].includes(String(error.code))
    ) {
      return depcruiseTool;
    }
    throw error;
  }
}

function typeScriptPattern(source: string): string {
  const normalized = source.replace(/\/+$/u, "");
  if (normalized.length === 0 || normalized === ".") {
    return typeScriptFiles;
  }
  if (/\.tsx?$/u.test(normalized)) {
    return normalized;
  }
  return `${normalized}/${typeScriptFiles}`;
}

async function projectTypeScriptFiles(
  repoRoot: string,
  source: string,
): Promise<readonly string[]> {
  return glob(typeScriptPattern(source), {
    cwd: repoRoot,
    dot: true,
    ignore: ignoredTypeScriptPaths,
    onlyFiles: true,
    unique: true,
  });
}

async function runDepcruise(
  context: LaneContext,
  options: DepcruiseLaneOptions,
): Promise<LaneResult> {
  const tool = await findTool(context);
  const availability = await probeTool(context.exec, tool, context.repoRoot);
  if (!availability.available) {
    return { status: "failed", findings: [availability.finding] };
  }

  const args = [
    "--config",
    options.config ?? ".dependency-cruiser.cjs",
    "--output-type",
    "json",
    options.source ?? ".",
  ];
  try {
    const result = await context.exec(tool.command, args, { cwd: context.repoRoot });
    if (result.failed || result.exitCode !== 0) {
      const output = result.stderr.trim() || result.stdout.trim();
      return {
        status: "failed",
        findings: [
          commandFinding(
            tool.command,
            output.length === 0
              ? "Dependency Cruiser failed."
              : `Dependency Cruiser failed: ${output}`,
          ),
        ],
      };
    }

    const parsed: unknown = JSON.parse(result.stdout);
    const report = depcruiseReportSchema.safeParse(parsed);
    if (!report.success) {
      return {
        status: "failed",
        findings: [
          commandFinding(
            tool.command,
            `Dependency Cruiser returned an invalid JSON report: ${report.error.message}`,
          ),
        ],
      };
    }

    const sourceFiles = await projectTypeScriptFiles(context.repoRoot, options.source ?? ".");
    const sourceModules = report.data.modules.filter(({ source }) => /\.tsx?$/u.test(source));
    const metrics = { filesChecked: report.data.modules.length };
    if (sourceFiles.length > 0 && sourceModules.length === 0) {
      return {
        status: "failed",
        findings: [
          commandFinding(
            tool.command,
            `Dependency Cruiser analyzed 0 TypeScript modules although ${sourceFiles.length} .ts/.tsx files exist; install TypeScript <7 in dependency-cruiser's dependency context.`,
            "typescript-not-cruised",
          ),
        ],
        metrics,
      };
    }

    return { status: "passed", metrics };
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      status: "failed",
      findings: [commandFinding(tool.command, `Dependency Cruiser could not run: ${detail}`)],
    };
  }
}

export function depcruise(options: DepcruiseLaneOptions = {}): GateLane {
  return {
    id: "depcruise",
    title: "Dependency Cruiser",
    categories: ["source", "contract"],
    triggers: categoryTrigger(["source", "contract"]),
    run: (context) => runDepcruise(context, options),
  };
}
