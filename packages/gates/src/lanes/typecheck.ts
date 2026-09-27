import type { GateLane } from "../core/types.js";
import { makeCommandLane } from "./command.js";

export interface TypecheckLaneOptions {
  readonly command?: string;
  readonly args?: readonly string[];
}

export function typecheck(options: TypecheckLaneOptions = {}): GateLane {
  const command = options.command ?? "pnpm";
  const args = options.args ?? ["run", "typecheck"];
  return makeCommandLane({
    id: "typecheck",
    title: "Typecheck",
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
