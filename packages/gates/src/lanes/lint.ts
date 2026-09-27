import type { ToolRequirement } from "../adapters/tool.js";
import type { GateLane, LaneContext, LaneResult } from "../core/types.js";
import { hasProjectPackage } from "./command.js";
import { runToolCommand } from "./tool-command.js";
import { categoryTrigger } from "./trigger.js";

export interface LintLaneOptions {
  readonly config?: string;
  readonly typeAware?: boolean;
}

const lintTool: ToolRequirement = {
  command: "oxlint",
  installHint: "Install oxlint with `pnpm add -D oxlint`, then rerun q9gate.",
};

const lintExtensions = new Set([".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);

function changedLintFiles(context: LaneContext): readonly string[] {
  return context.changedFiles.filter((file) =>
    lintExtensions.has(file.slice(file.lastIndexOf("."))),
  );
}

function lintArgs(context: LaneContext, options: LintLaneOptions): readonly string[] {
  const args: string[] = [];
  const typeAware = options.typeAware ?? hasProjectPackage(context.repoRoot, "oxlint-tsgolint");
  if (typeAware) {
    args.push("--type-aware");
  }
  if (options.config !== undefined) {
    args.push("--config", options.config);
  }
  const files = context.scope === "full" ? ["."] : changedLintFiles(context);
  args.push(...files);
  return args;
}

async function runLint(context: LaneContext, options: LintLaneOptions): Promise<LaneResult> {
  return runToolCommand(context, lintTool, {
    args: () => lintArgs(context, options),
    emptyOutputMessage: "oxlint exited with a non-zero status.",
    skip: (args) => args.length === 0,
    passWhen: (output) => output.includes("No files found to lint"),
  });
}

export function lint(options: LintLaneOptions = {}): GateLane {
  return {
    id: "lint",
    title: "Lint",
    categories: ["source", "ui"],
    triggers: categoryTrigger(["source", "ui"]),
    run: (context) => runLint(context, options),
  };
}
