import pc from "picocolors";

import type { GateReport, LaneReport } from "../core/report.js";
import type { GatePlan } from "../core/types.js";

export function writeLine(message: string): void {
  process.stdout.write(`${message}\n`);
}

export function writeErrorLine(message: string): void {
  process.stderr.write(`${message}\n`);
}

function status(value: LaneReport["status"]): string {
  if (value === "passed") {
    return pc.green("passed");
  }
  if (value === "failed") {
    return pc.red("failed");
  }
  return pc.dim("skipped");
}

export function printPlan(plan: GatePlan): void {
  writeLine(pc.bold("Gate plan"));
  for (const entry of plan.lanes) {
    const marker = entry.selected ? pc.cyan("run ") : pc.dim("skip");
    writeLine(`${marker}  ${entry.lane.id.padEnd(20)} ${entry.reason}`);
  }
}

export function printLaneResult(lane: LaneReport): void {
  writeLine(
    `${status(lane.status).padEnd(10)} ${lane.id.padEnd(20)} ${Math.round(lane.durationMs)} ms`,
  );
  for (const finding of lane.findings ?? []) {
    const location = finding.line === undefined ? finding.file : `${finding.file}:${finding.line}`;
    writeLine(pc.dim(`  ${location} [${finding.rule}] ${finding.message}`));
  }
}

export function printSummary(report: GateReport): void {
  const { passed, failed, skipped } = report.summary;
  const message = `${passed} passed, ${failed} failed, ${skipped} skipped in ${Math.round(report.durationMs)} ms`;
  writeLine(failed > 0 ? pc.red(message) : pc.green(message));
}
