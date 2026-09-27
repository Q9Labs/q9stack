import { GatePlanningError } from "./plan.js";
import type { GateConfig } from "./types.js";

export function defineGate(config: GateConfig): GateConfig {
  if (config.workspaceRoots.length === 0) {
    throw new GatePlanningError("workspace-roots", "At least one workspace root is required.");
  }
  if (config.lanes.length === 0) {
    throw new GatePlanningError("lanes", "At least one gate lane is required.");
  }
  return config;
}
