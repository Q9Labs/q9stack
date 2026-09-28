import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import type { LaneFinding } from "../core/report.js";
import type { GateExec, GateLane } from "../core/types.js";

export interface ToolRequirement {
  readonly command: string;
  readonly candidates?: readonly string[];
  readonly installHint: string;
}

export interface DoctorLane extends GateLane {
  readonly doctorTools: readonly ToolRequirement[];
  readonly packageScript?: string;
}

export type ToolAvailability =
  | { readonly available: true; readonly command: string; readonly version: string }
  | { readonly available: false; readonly finding: LaneFinding };

async function executableCandidate(candidate: string, cwd: string): Promise<string | undefined> {
  if (!isAbsolute(candidate) && !candidate.includes("/") && !candidate.includes("\\")) {
    return candidate;
  }
  const command = resolve(cwd, candidate);
  try {
    await access(command, constants.X_OK);
    return command;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      "code" in error &&
      ["ENOENT", "ENOTDIR", "EACCES", "EPERM"].includes(String(error.code))
    ) {
      return undefined;
    }
    throw error;
  }
}

export async function probeTool(
  exec: GateExec,
  requirement: ToolRequirement,
  cwd: string,
): Promise<ToolAvailability> {
  let detail: string | undefined;
  const candidates = [...(requirement.candidates ?? []), requirement.command];
  for (const candidate of candidates) {
    const command = await executableCandidate(candidate, cwd);
    if (command === undefined) {
      detail = `${candidate} is not executable`;
      continue;
    }
    try {
      const result = await exec(command, ["--version"], { cwd });
      if (!result.failed) {
        return { available: true, command, version: result.stdout.trim() };
      }
      detail =
        result.stderr.trim() || result.stdout.trim() || `exited with status ${result.exitCode}`;
    } catch (error: unknown) {
      detail = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    available: false,
    finding: {
      file: requirement.command,
      rule: "missing-tool",
      message: `${requirement.command} is unavailable${detail === undefined ? "" : `: ${detail}`}. ${requirement.installHint}`,
    },
  };
}
