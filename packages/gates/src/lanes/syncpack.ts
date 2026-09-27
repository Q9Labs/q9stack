import type { ToolRequirement } from "../adapters/tool.js";
import type { GateLane, LaneContext, LaneResult } from "../core/types.js";
import { runToolCommand } from "./tool-command.js";
import { categoryTrigger } from "./trigger.js";

const syncpackTool: ToolRequirement = {
  command: "syncpack",
  installHint: "Install syncpack with `pnpm add -D syncpack`, then rerun q9gate.",
};

async function runSyncpack(context: LaneContext): Promise<LaneResult> {
  return runToolCommand(context, syncpackTool, {
    args: ["lint"],
    emptyOutputMessage: "syncpack lint failed.",
  });
}

export function syncpack(): GateLane {
  return {
    id: "syncpack",
    title: "Dependency Policy",
    categories: ["dependency"],
    triggers: categoryTrigger(["dependency"]),
    run: runSyncpack,
  };
}
