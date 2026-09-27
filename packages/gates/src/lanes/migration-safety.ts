import { readFile } from "node:fs/promises";
import { join } from "node:path";

import glob from "fast-glob";

import { scanMigration } from "../core/migration-safety.js";
import type { LaneFinding } from "../core/report.js";
import type { GateLane, LaneContext, LaneResult } from "../core/types.js";
import { categoryTrigger } from "./trigger.js";

export interface MigrationSafetyOptions {
  readonly dir: string;
}

function finding(file: string, line: number, rule: string, statement: string): LaneFinding {
  return {
    file,
    line,
    rule,
    message: `Unsafe migration statement requires a preceding -- expand-contract: annotation: ${statement}`,
  };
}

function filesInScope(files: readonly string[], directory: string): readonly string[] {
  const normalized = directory.replaceAll("\\", "/").replace(/\/$/u, "");
  return files.filter((file) => file === normalized || file.startsWith(`${normalized}/`));
}

interface MigrationFileResult {
  readonly checked: boolean;
  readonly findings: readonly LaneFinding[];
}

async function scanFile(repoRoot: string, file: string): Promise<MigrationFileResult> {
  try {
    const source = await readFile(join(repoRoot, file), "utf8");
    return {
      checked: true,
      findings: scanMigration(source).map((violation) =>
        finding(file, violation.line, violation.rule, violation.statement),
      ),
    };
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    return { checked: false, findings: [{ file, rule: "read-failed", message: detail }] };
  }
}

async function runMigrationSafety(
  context: LaneContext,
  options: MigrationSafetyOptions,
): Promise<LaneResult> {
  const pattern = join(options.dir, "**", "*.sql").replaceAll("\\", "/");
  const allFiles = await glob(pattern, { cwd: context.repoRoot, onlyFiles: true, unique: true });
  const selected =
    context.scope === "full" ? allFiles : filesInScope(context.changedFiles, options.dir);
  const files = [...new Set(selected)].toSorted();
  const scans = await Promise.all(files.map((file) => scanFile(context.repoRoot, file)));
  const findings = scans.flatMap((scan) => scan.findings);
  const filesChecked = scans.filter((scan) => scan.checked).length;
  const result: LaneResult = {
    status: findings.length === 0 ? "passed" : "failed",
    metrics: {
      unsafeMigrations: findings.filter((item) => item.rule !== "read-failed").length,
      filesChecked,
    },
  };
  return findings.length > 0 ? { ...result, findings } : result;
}

export function migrationSafety(options: MigrationSafetyOptions): GateLane {
  return {
    id: "migration-safety",
    title: "Migration safety",
    categories: ["sql"],
    triggers: categoryTrigger(["sql"]),
    run: (context) => runMigrationSafety(context, options),
  };
}
