import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { validateGateReport, type GateReport } from "../core/report.js";

export async function writeGateReport(
  repoRoot: string,
  report: GateReport,
  file = "gate.report.json",
): Promise<string> {
  const validated = validateGateReport(report);
  const path = resolve(repoRoot, file);
  await writeFile(path, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
  return path;
}
