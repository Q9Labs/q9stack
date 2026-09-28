import { acceptBaselineMessage } from "../adapters/baseline-store.js";
import { writeLine } from "../adapters/terminal.js";
import type { GateConfig, GateExec } from "../core/types.js";

export async function acceptBaselineCommand(
  repoRoot: string,
  config: GateConfig,
  laneId: string,
  message: string,
  exec: GateExec,
): Promise<number> {
  const lane = config.lanes.find((candidate) => candidate.id === laneId);
  if (lane === undefined) {
    throw new Error(`Unknown lane: ${laneId}`);
  }
  if (lane.baseline === undefined) {
    throw new Error(`Lane ${laneId} does not declare a baseline.`);
  }
  const path =
    lane.baseline.accept === undefined
      ? await acceptBaselineMessage(repoRoot, lane.baseline, message)
      : await lane.baseline.accept(repoRoot, message, exec);
  writeLine(`Accepted baseline for ${laneId}: ${message} (${path})`);
  return 0;
}
