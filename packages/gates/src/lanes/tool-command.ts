import { probeTool, type ToolRequirement } from "../adapters/tool.js";
import type { CommandResult, LaneContext, LaneResult } from "../core/types.js";
import { commandFinding } from "./command.js";

type ToolArgs = readonly string[] | (() => readonly string[] | Promise<readonly string[]>);

export interface ToolCommandOptions {
  readonly args: ToolArgs;
  readonly emptyOutputMessage: string;
  readonly displayName?: string;
  readonly skip?: (args: readonly string[]) => boolean;
  /** Treat a non-zero exit as success when its output matches (for example: every supplied file is ignore-listed). */
  readonly passWhen?: (output: string) => boolean;
  readonly onSuccess?: (result: CommandResult, command: string) => LaneResult | Promise<LaneResult>;
  readonly executionFailureMessage?: (detail: string) => string;
}

function failedCommandResult(
  result: CommandResult,
  command: string,
  displayName: string,
  options: ToolCommandOptions,
): LaneResult {
  const output = result.stderr.trim() || result.stdout.trim();
  if (options.passWhen?.(output) === true) {
    return { status: "passed" };
  }
  return {
    status: "failed",
    findings: [
      commandFinding(
        command,
        output.length === 0 ? options.emptyOutputMessage : `${displayName} failed: ${output}`,
      ),
    ],
  };
}

function executionFailureResult(
  error: unknown,
  command: string,
  displayName: string,
  options: ToolCommandOptions,
): LaneResult {
  const detail = error instanceof Error ? error.message : String(error);
  return {
    status: "failed",
    findings: [
      commandFinding(
        command,
        options.executionFailureMessage?.(detail) ??
          `${displayName} could not be executed: ${detail}`,
      ),
    ],
  };
}

async function executeAvailableCommand(
  context: LaneContext,
  command: string,
  args: readonly string[],
  displayName: string,
  options: ToolCommandOptions,
): Promise<LaneResult> {
  try {
    const result = await context.exec(command, args, { cwd: context.repoRoot });
    if (result.failed || result.exitCode !== 0) {
      return failedCommandResult(result, command, displayName, options);
    }
    return options.onSuccess === undefined
      ? { status: "passed" }
      : await options.onSuccess(result, command);
  } catch (error: unknown) {
    return executionFailureResult(error, command, displayName, options);
  }
}

export async function runToolCommand(
  context: LaneContext,
  tool: ToolRequirement,
  options: ToolCommandOptions,
): Promise<LaneResult> {
  const availability = await probeTool(context.exec, tool, context.repoRoot);
  if (!availability.available) {
    return { status: "failed", findings: [availability.finding] };
  }
  const args = typeof options.args === "function" ? await options.args() : options.args;
  if (options.skip?.(args) === true) {
    return { status: "passed" };
  }
  const displayName = options.displayName ?? tool.command;
  return executeAvailableCommand(context, availability.command, args, displayName, options);
}
