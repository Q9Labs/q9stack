import type { LaneFinding } from "../core/report.js";
import type { GateExec } from "../core/types.js";

export interface ToolRequirement {
  readonly command: string;
  readonly installHint: string;
}

export type ToolAvailability =
  | { readonly available: true; readonly version: string }
  | { readonly available: false; readonly finding: LaneFinding };

export async function probeTool(
  exec: GateExec,
  requirement: ToolRequirement,
  cwd: string,
): Promise<ToolAvailability> {
  try {
    const result = await exec(requirement.command, ["--version"], { cwd });
    if (!result.failed) {
      return { available: true, version: result.stdout.trim() };
    }
    return {
      available: false,
      finding: {
        file: requirement.command,
        rule: "missing-tool",
        message: `${requirement.command} is unavailable. ${requirement.installHint}`,
      },
    };
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      available: false,
      finding: {
        file: requirement.command,
        rule: "missing-tool",
        message: `${requirement.command} is unavailable: ${detail}. ${requirement.installHint}`,
      },
    };
  }
}
