import type { GateLane } from "../core/types.js";
import { makeCommandLane } from "./command.js";

export interface BuildLaneOptions {
  readonly command?: string;
  readonly args?: readonly string[];
}

export function build(options: BuildLaneOptions = {}): GateLane {
  const command = options.command ?? "pnpm";
  const args = options.args ?? ["run", "build"];
  return makeCommandLane({
    id: "build",
    title: "Build",
    tool: {
      command,
      installHint: "Install pnpm (https://pnpm.io/installation), then rerun q9gate.",
    },
    command,
    args,
    categories: ["source", "test", "dependency", "contract"],
    exclusive: true,
  });
}
