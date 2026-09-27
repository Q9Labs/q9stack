import type { GateLane } from "../core/types.js";
import { makeCommandLane } from "./command.js";

export interface TestLaneOptions {
  readonly command?: string;
  readonly args?: readonly string[];
}

export function test(options: TestLaneOptions = {}): GateLane {
  const command = options.command ?? "pnpm";
  const args = options.args ?? ["run", "test"];
  return makeCommandLane({
    id: "test",
    title: "Tests",
    tool: {
      command,
      installHint: "Install pnpm (https://pnpm.io/installation), then rerun q9gate.",
    },
    command,
    args,
    categories: ["source", "test", "contract"],
    exclusive: true,
  });
}
