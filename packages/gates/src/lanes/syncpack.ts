import type { ToolRequirement } from "../adapters/tool.js";
import type { GateLane, LaneContext, LaneResult } from "../core/types.js";
import { runToolCommand } from "./tool-command.js";
import { categoryTrigger } from "./trigger.js";

const syncpackTool: ToolRequirement = {
  command: "syncpack",
  installHint: "Install syncpack with `pnpm add -D syncpack`, then rerun q9gate.",
};

export interface SyncpackLaneOptions {
  readonly args?: readonly string[];
}

async function runSyncpack(
  context: LaneContext,
  options: SyncpackLaneOptions,
): Promise<LaneResult> {
  return runToolCommand(context, syncpackTool, {
    args: options.args ?? ["lint"],
    emptyOutputMessage: "syncpack lint failed.",
  });
}

export function syncpack(options: SyncpackLaneOptions = {}): GateLane {
  return {
    id: "syncpack",
    title: "Dependency Policy",
    categories: ["dependency"],
    triggers: categoryTrigger(["dependency"]),
    run: (context) => runSyncpack(context, options),
  };
}
