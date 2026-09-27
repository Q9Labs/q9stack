import { probeTool, type ToolRequirement } from "../adapters/tool.js";
import type { LaneFinding } from "../core/report.js";
import type { LaneContext, LaneResult } from "../core/types.js";

export interface OutputFindingOptions {
  readonly fallbackFile: string;
  readonly rule: string;
}

export type BaselineLoadResult<Value> =
  | { readonly kind: "ready"; readonly value: Value }
  | { readonly kind: "failed"; readonly result: LaneResult };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function findingFromLine(line: string, options: OutputFindingOptions): LaneFinding {
  const match = /^(?<file>[^:]+):(?<line>\d+)(?::[^:]+)?\s+(?<message>.+)$/u.exec(line);
  if (match?.groups === undefined) {
    return { file: options.fallbackFile, rule: options.rule, message: line };
  }
  const lineNumber = Number.parseInt(match.groups["line"] ?? "", 10);
  const file = match.groups["file"] ?? options.fallbackFile;
  const message = match.groups["message"] ?? line;
  if (Number.isNaN(lineNumber)) {
    return { file, rule: options.rule, message };
  }
  return { file, line: lineNumber, rule: options.rule, message };
}

export function outputFindings(
  output: string,
  options: OutputFindingOptions,
): readonly LaneFinding[] {
  return output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => findingFromLine(line, options));
}

async function loadBaseline<Value>(
  path: string,
  read: () => Promise<Value>,
): Promise<BaselineLoadResult<Value>> {
  try {
    return { kind: "ready", value: await read() };
  } catch (error: unknown) {
    return {
      kind: "failed",
      result: {
        status: "failed",
        findings: [{ file: path, rule: "baseline", message: errorMessage(error) }],
      },
    };
  }
}

export async function prepareBaselineLane<Value>(
  context: LaneContext,
  path: string,
  read: () => Promise<Value>,
  requirement: ToolRequirement,
): Promise<BaselineLoadResult<Value>> {
  const baseline = await loadBaseline(path, read);
  if (baseline.kind === "failed") {
    return baseline;
  }
  const availability = await probeTool(context.exec, requirement, context.repoRoot);
  if (!availability.available) {
    return { kind: "failed", result: { status: "failed", findings: [availability.finding] } };
  }
  return baseline;
}
