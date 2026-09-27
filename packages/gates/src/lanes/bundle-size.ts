import { readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { gzipSync } from "node:zlib";

import glob from "fast-glob";

import type { LaneFinding } from "../core/report.js";
import type { GateLane, LaneContext, LaneResult } from "../core/types.js";
import { categoryTrigger } from "./trigger.js";

export interface BundleSizeOptions {
  /**
   * Budget per target. A target is a package directory (its dist/build/lib/.output
   * is measured), a file, or a glob pattern selecting the deploy artifact directly.
   */
  readonly budgets: Readonly<Record<string, string | number>>;
}

const unitMultipliers: Readonly<Record<string, number>> = {
  B: 1,
  KB: 1_000,
  MB: 1_000_000,
  GB: 1_000_000_000,
  KIB: 1_024,
  MIB: 1_048_576,
  GIB: 1_073_741_824,
};

function finding(file: string, rule: string, message: string): LaneFinding {
  return { file, rule, message };
}

function parseBudget(value: string | number): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Bundle budget ${String(value)} is not a non-negative number.`);
    }
    return value;
  }
  const match = value.trim().match(/^([0-9]+(?:\.[0-9]+)?)\s*(B|KB|kB|KiB|MB|MiB|GB|GiB)?$/u);
  if (match?.[1] === undefined) {
    throw new Error(`Invalid bundle budget "${value}". Use values such as "250 kB".`);
  }
  const unit = (match[2] ?? "B").toUpperCase();
  const multiplier = unitMultipliers[unit];
  if (multiplier === undefined) {
    throw new Error(`Invalid bundle budget unit in "${value}".`);
  }
  return Number(match[1]) * multiplier;
}

const outputIgnore = ["**/*.map", "**/node_modules/**"];

async function outputFiles(repoRoot: string, target: string): Promise<readonly string[]> {
  if (glob.isDynamicPattern(target)) {
    const matches = await glob(target, {
      cwd: repoRoot,
      onlyFiles: true,
      unique: true,
      ignore: outputIgnore,
    });
    return matches.toSorted();
  }
  try {
    const targetStat = await stat(join(repoRoot, target));
    if (targetStat.isFile()) {
      return [target];
    }
  } catch (error: unknown) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }
  const normalized = target.replaceAll("\\", "/").replace(/\/$/u, "");
  const targetName = basename(normalized);
  const patterns = [
    `${normalized}/dist/**/*`,
    `${normalized}/build/**/*`,
    `${normalized}/lib/**/*`,
    `${normalized}/.output/**/*`,
  ];
  if (["dist", "build", "lib", ".output"].includes(targetName)) {
    patterns.unshift(`${normalized}/**/*`);
  }
  const matches = await glob(patterns, {
    cwd: repoRoot,
    onlyFiles: true,
    unique: true,
    ignore: outputIgnore,
  });
  return matches.toSorted();
}

interface SizeResult {
  readonly bytes: number;
  readonly gzipBytes: number;
  readonly bytesOverBudget: number;
  readonly findings: readonly LaneFinding[];
}

async function measureFile(repoRoot: string, file: string): Promise<SizeResult> {
  try {
    const content = await readFile(join(repoRoot, file));
    return {
      bytes: content.byteLength,
      gzipBytes: gzipSync(content).byteLength,
      bytesOverBudget: 0,
      findings: [],
    };
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      bytes: 0,
      gzipBytes: 0,
      bytesOverBudget: 0,
      findings: [finding(file, "read-failed", detail)],
    };
  }
}

async function measureTarget(
  repoRoot: string,
  target: string,
  configuredBudget: string | number,
): Promise<SizeResult> {
  let budget: number;
  try {
    budget = parseBudget(configuredBudget);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      bytes: 0,
      gzipBytes: 0,
      bytesOverBudget: 0,
      findings: [finding(target, "invalid-budget", detail)],
    };
  }
  const files = await outputFiles(repoRoot, target);
  if (files.length === 0) {
    return {
      bytes: 0,
      gzipBytes: 0,
      bytesOverBudget: 0,
      findings: [finding(target, "missing-output", `No built output was found for ${target}.`)],
    };
  }
  const fileResults = await Promise.all(files.map((file) => measureFile(repoRoot, file)));
  const bytes = fileResults.reduce((total, result) => total + result.bytes, 0);
  const gzipBytes = fileResults.reduce((total, result) => total + result.gzipBytes, 0);
  const bytesOverBudget = Math.max(0, gzipBytes - budget);
  const findings = fileResults.flatMap((result) => result.findings);
  if (bytesOverBudget === 0) {
    return { bytes, gzipBytes, bytesOverBudget, findings };
  }
  return {
    bytes,
    gzipBytes,
    bytesOverBudget,
    findings: [
      ...findings,
      finding(
        target,
        "bundle-budget",
        `Gzip output is ${gzipBytes} bytes, over the ${budget}-byte budget by ${bytesOverBudget} bytes.`,
      ),
    ],
  };
}

async function runBundleSize(
  context: LaneContext,
  options: BundleSizeOptions,
): Promise<LaneResult> {
  const targetResults = await Promise.all(
    Object.entries(options.budgets).map(([target, budget]) =>
      measureTarget(context.repoRoot, target, budget),
    ),
  );
  const findings = targetResults.flatMap((result) => result.findings);
  const bytes = targetResults.reduce((total, result) => total + result.bytes, 0);
  const gzipBytes = targetResults.reduce((total, result) => total + result.gzipBytes, 0);
  const bytesOverBudget = targetResults.reduce(
    (total, result) => total + result.bytesOverBudget,
    0,
  );
  const result: LaneResult = {
    status: findings.length === 0 ? "passed" : "failed",
    metrics: { bytes, gzipBytes, bytesOverBudget },
  };
  return findings.length > 0 ? { ...result, findings } : result;
}

export function bundleSize(options: BundleSizeOptions): GateLane {
  return {
    id: "bundle-size",
    title: "Bundle size",
    categories: ["source", "ui", "dependency"],
    triggers: categoryTrigger(["source", "ui", "dependency"]),
    run: (context) => runBundleSize(context, options),
  };
}
