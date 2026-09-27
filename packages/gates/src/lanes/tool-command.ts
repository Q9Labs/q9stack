import { probeTool, type ToolRequirement } from "../adapters/tool.js";
import type { LaneContext, LaneResult } from "../core/types.js";
import { commandFinding } from "./command.js";

type ToolArgs = readonly string[] | (() => readonly string[] | Promise<readonly string[]>);

export interface ToolCommandOptions {
  readonly args: ToolArgs;
  readonly emptyOutputMessage: string;
  readonly displayName?: string;
  readonly skip?: (args: readonly string[]) => boolean;
  /** Treat a non-zero exit as success when its output matches (for example: every supplied file is ignore-listed). */
  readonly passWhen?: (output: string) => boolean;
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
  try {
    const result = await context.exec(tool.command, args, { cwd: context.repoRoot });
    if (result.failed || result.exitCode !== 0) {
      const output = result.stderr.trim() || result.stdout.trim();
      if (options.passWhen?.(output) === true) {
        return { status: "passed" };
      }
      return {
        status: "failed",
        findings: [
          commandFinding(
            tool.command,
            output.length === 0 ? options.emptyOutputMessage : `${displayName} failed: ${output}`,
          ),
        ],
      };
    }
    return { status: "passed" };
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      status: "failed",
      findings: [commandFinding(tool.command, `${displayName} could not be executed: ${detail}`)],
    };
  }
}
