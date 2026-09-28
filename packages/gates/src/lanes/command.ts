import { createRequire } from "node:module";
import { join } from "node:path";

import { probeTool, type DoctorLane, type ToolRequirement } from "../adapters/tool.js";
import type { LaneFinding } from "../core/report.js";
import type { GateCategory, LaneContext, LaneResult } from "../core/types.js";
import { categoryTrigger } from "./trigger.js";

export interface CommandLaneOptions {
  readonly id: string;
  readonly title: string;
  readonly tool: ToolRequirement;
  readonly categories: readonly GateCategory[];
  readonly command?: string;
  readonly args?: readonly string[];
  readonly exclusive?: boolean;
}

export function commandFinding(
  command: string,
  message: string,
  rule = "command-failed",
): LaneFinding {
  return {
    file: command,
    rule,
    message,
  };
}

function resultMessage(command: string, stdout: string, stderr: string): string {
  const output = stderr.trim() || stdout.trim();
  return output.length === 0
    ? `${command} exited with a non-zero status.`
    : `${command} failed: ${output}`;
}

async function executeRequiredCommand(
  context: LaneContext,
  tool: ToolRequirement,
  command: string,
  args: readonly string[] = [],
): Promise<LaneResult> {
  const availability = await probeTool(context.exec, tool, context.repoRoot);
  if (!availability.available) {
    return { status: "failed", findings: [availability.finding] };
  }
  const executable = command === tool.command ? availability.command : command;

  try {
    const result = await context.exec(executable, args, { cwd: context.repoRoot });
    if (result.failed || result.exitCode !== 0) {
      return {
        status: "failed",
        findings: [
          commandFinding(executable, resultMessage(executable, result.stdout, result.stderr)),
        ],
      };
    }
    return { status: "passed" };
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      status: "failed",
      findings: [commandFinding(executable, `${executable} could not be executed: ${detail}`)],
    };
  }
}

export function makeCommandLane(options: CommandLaneOptions): DoctorLane {
  const command = options.command ?? options.tool.command;
  const tool = { ...options.tool, command };
  return {
    id: options.id,
    title: options.title,
    categories: options.categories,
    triggers: categoryTrigger(options.categories),
    ...(options.exclusive === undefined ? {} : { exclusive: options.exclusive }),
    doctorTools: [tool],
    ...(command === "pnpm" && options.args?.[0] === "run" && options.args[1] !== undefined
      ? { packageScript: options.args[1] }
      : {}),
    run: (context) => executeRequiredCommand(context, tool, command, options.args),
  };
}

export function resolveProjectPackage(repoRoot: string, specifier: string): string | undefined {
  try {
    const require = createRequire(join(repoRoot, "package.json"));
    return require.resolve(specifier);
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error.code === "MODULE_NOT_FOUND" || error.code === "ERR_PACKAGE_PATH_NOT_EXPORTED")
    ) {
      return undefined;
    }
    throw error;
  }
}

export function hasProjectPackage(repoRoot: string, specifier: string): boolean {
  return resolveProjectPackage(repoRoot, specifier) !== undefined;
}
