import fg from "fast-glob";

import type { ToolRequirement } from "../adapters/tool.js";
import type { GateLane, LaneContext, LaneResult } from "../core/types.js";
import { runToolCommand } from "./tool-command.js";
import { categoryTrigger } from "./trigger.js";

const shellcheckTool: ToolRequirement = {
  command: "shellcheck",
  installHint: "Install ShellCheck from https://www.shellcheck.net, then rerun q9gate.",
};

async function shellFiles(context: LaneContext): Promise<readonly string[]> {
  if (context.scope !== "full") {
    return context.changedFiles.filter((file) => file.endsWith(".sh"));
  }
  return fg("**/*.sh", {
    cwd: context.repoRoot,
    onlyFiles: true,
    ignore: ["**/node_modules/**", "**/dist/**", "**/.worktrees/**", "**/scratchpad/**"],
  });
}

async function runShellcheck(context: LaneContext): Promise<LaneResult> {
  return runToolCommand(context, shellcheckTool, {
    args: async () => ["--color=never", ...(await shellFiles(context))],
    emptyOutputMessage: "shellcheck failed.",
    skip: (args) => args.length === 1,
  });
}

export function shellcheck(): GateLane {
  return {
    id: "shellcheck",
    title: "Shellcheck",
    categories: ["shell"],
    triggers: categoryTrigger(["shell"]),
    run: runShellcheck,
  };
}
