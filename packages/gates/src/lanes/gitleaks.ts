import type { ToolRequirement } from "../adapters/tool.js";
import type { GateLane, LaneContext, LaneResult } from "../core/types.js";
import { runToolCommand } from "./tool-command.js";
import { alwaysTrigger } from "./trigger.js";

export interface GitleaksLaneOptions {
  readonly baseline?: string;
  readonly baselinePath?: string;
  readonly config?: string;
}

const gitleaksTool: ToolRequirement = {
  command: "gitleaks",
  installHint:
    "Install Gitleaks from https://github.com/gitleaks/gitleaks#installing, then rerun q9gate.",
};

async function runGitleaks(
  context: LaneContext,
  options: GitleaksLaneOptions,
): Promise<LaneResult> {
  return runToolCommand(context, gitleaksTool, {
    args: () => {
      const args = ["detect", "--source", ".", "--redact", "--verbose"];
      const baselinePath = options.baselinePath ?? options.baseline;
      if (baselinePath !== undefined) {
        args.push("--baseline-path", baselinePath);
      }
      if (options.config !== undefined) {
        args.push("--config", options.config);
      }
      return args;
    },
    emptyOutputMessage: "gitleaks detected secrets.",
  });
}

export function gitleaks(options: GitleaksLaneOptions = {}): GateLane {
  const baselinePath = options.baselinePath ?? options.baseline;
  return {
    id: "gitleaks",
    title: "Secret Scan",
    triggers: alwaysTrigger,
    run: (context) => runGitleaks(context, options),
    ...(baselinePath === undefined
      ? {}
      : { baseline: { path: baselinePath, format: "json-document" as const } }),
  };
}
