import type { ToolRequirement } from "../adapters/tool.js";
import type { GateLane, LaneContext, LaneResult } from "../core/types.js";
import { runToolCommand } from "./tool-command.js";
import { categoryTrigger } from "./trigger.js";

export interface FormatLaneOptions {
  readonly config?: string;
}

const formatTool: ToolRequirement = {
  command: "oxfmt",
  installHint: "Install oxfmt with `pnpm add -D oxfmt`, then rerun q9gate.",
};

const formatExtensions = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsonc",
  ".jsx",
  ".md",
  ".mdx",
  ".mjs",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);

function changedFormatFiles(context: LaneContext): readonly string[] {
  return context.changedFiles.filter((file) =>
    formatExtensions.has(file.slice(file.lastIndexOf("."))),
  );
}

function formatArgs(context: LaneContext, options: FormatLaneOptions): readonly string[] {
  const args: string[] = ["--check"];
  if (options.config !== undefined) {
    args.push("--config", options.config);
  }
  args.push(...(context.scope === "full" ? ["."] : changedFormatFiles(context)));
  return args;
}

async function runFormat(context: LaneContext, options: FormatLaneOptions): Promise<LaneResult> {
  return runToolCommand(context, formatTool, {
    args: () => formatArgs(context, options),
    emptyOutputMessage: "oxfmt --check found formatting differences.",
    skip: (args) => args.length === 1 + (options.config === undefined ? 0 : 2),
  });
}

export function format(options: FormatLaneOptions = {}): GateLane {
  return {
    id: "format",
    title: "Format",
    categories: ["source", "docs", "gateDefinition", "env", "workflow", "shell"],
    triggers: categoryTrigger(["source", "docs", "gateDefinition", "env", "workflow", "shell"]),
    run: (context) => runFormat(context, options),
  };
}
