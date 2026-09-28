import glob from "fast-glob";
import { z } from "zod";

import type { ToolRequirement } from "../adapters/tool.js";
import type { GateLane, LaneContext, LaneResult } from "../core/types.js";
import { commandFinding } from "./command.js";
import { runToolCommand } from "./tool-command.js";
import { categoryTrigger } from "./trigger.js";

export interface DepcruiseLaneOptions {
  readonly config?: string;
  readonly source?: string;
}

const depcruiseTool: ToolRequirement = {
  command: "depcruise",
  candidates: ["node_modules/@q9labsai/config-depcruise/node_modules/.bin/depcruise"],
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

async function depcruiseOutput(
  context: LaneContext,
  options: DepcruiseLaneOptions,
  command: string,
  output: string,
): Promise<LaneResult> {
  const parsed: unknown = JSON.parse(output);
  const report = depcruiseReportSchema.safeParse(parsed);
  if (!report.success) {
    return {
      status: "failed",
      findings: [
        commandFinding(
          command,
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
          command,
          `Dependency Cruiser analyzed 0 TypeScript modules although ${sourceFiles.length} .ts/.tsx files exist; install TypeScript <7 in dependency-cruiser's dependency context.`,
          "typescript-not-cruised",
        ),
      ],
      metrics,
    };
  }

  return { status: "passed", metrics };
}

async function runDepcruise(
  context: LaneContext,
  options: DepcruiseLaneOptions,
): Promise<LaneResult> {
  return runToolCommand(context, depcruiseTool, {
    args: [
      "--config",
      options.config ?? ".dependency-cruiser.cjs",
      "--output-type",
      "json",
      options.source ?? ".",
    ],
    displayName: "Dependency Cruiser",
    emptyOutputMessage: "Dependency Cruiser failed.",
    executionFailureMessage: (detail) => `Dependency Cruiser could not run: ${detail}`,
    onSuccess: (result, command) => depcruiseOutput(context, options, command, result.stdout),
  });
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
