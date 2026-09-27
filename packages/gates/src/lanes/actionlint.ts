import type { ToolRequirement } from "../adapters/tool.js";
import type { GateLane, LaneContext, LaneResult } from "../core/types.js";
import { runToolCommand } from "./tool-command.js";
import { categoryTrigger } from "./trigger.js";

const actionlintTool: ToolRequirement = {
  command: "actionlint",
  installHint:
    "Install actionlint from https://github.com/rhysd/actionlint#installation, then rerun q9gate.",
};

function changedWorkflowFiles(context: LaneContext): readonly string[] {
  return context.changedFiles.filter((file) => file.startsWith(".github/workflows/"));
}

async function runActionlint(context: LaneContext): Promise<LaneResult> {
  return runToolCommand(context, actionlintTool, {
    args: () => (context.scope === "full" ? [] : changedWorkflowFiles(context)),
    emptyOutputMessage: "actionlint failed.",
    skip: (files) => files.length === 0 && context.scope !== "full",
  });
}

export function actionlint(): GateLane {
  return {
    id: "actionlint",
    title: "GitHub Actions",
    categories: ["workflow"],
    triggers: categoryTrigger(["workflow"]),
    run: runActionlint,
  };
}
