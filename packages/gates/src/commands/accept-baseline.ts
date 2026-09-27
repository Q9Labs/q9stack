import { acceptBaselineMessage } from "../adapters/baseline-store.js";
import { writeLine } from "../adapters/terminal.js";
import type { GateConfig } from "../core/types.js";

export async function acceptBaselineCommand(
  repoRoot: string,
  config: GateConfig,
  laneId: string,
  message: string,
): Promise<number> {
  const lane = config.lanes.find((candidate) => candidate.id === laneId);
  if (lane === undefined) {
    throw new Error(`Unknown lane: ${laneId}`);
  }
  if (lane.baseline === undefined) {
    throw new Error(`Lane ${laneId} does not declare a baseline.`);
  }
  const path = await acceptBaselineMessage(repoRoot, lane.baseline, message);
  writeLine(`Accepted baseline for ${laneId}: ${message} (${path})`);
  return 0;
}
