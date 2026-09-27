import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import glob from "fast-glob";
import { minVersion, validRange } from "semver";
import { z } from "zod";

import type { LaneFinding } from "../core/report.js";
import type { GateLane, LaneContext, LaneResult } from "../core/types.js";
import { categoryTrigger } from "./trigger.js";

const packageDocument = z
  .object({
    name: z.string().optional(),
    dependencies: z.record(z.string(), z.string()).optional(),
    devDependencies: z.record(z.string(), z.string()).optional(),
    peerDependencies: z.record(z.string(), z.string()).optional(),
    optionalDependencies: z.record(z.string(), z.string()).optional(),
  })
  .passthrough();

interface WorkspacePackage {
  readonly path: string;
  readonly name: string;
  readonly dependencies: ReadonlyMap<string, string>;
  readonly peerDependencies: ReadonlyMap<string, string>;
}

function finding(file: string, rule: string, message: string): LaneFinding {
  return { file, rule, message };
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function yamlValue(line: string): string {
  const comment = line.indexOf(" #");
  return unquote(comment >= 0 ? line.slice(0, comment) : line);
}

function catalogRanges(source: string): ReadonlyMap<string, string> {
  const catalog = new Map<string, string>();
  let catalogIndent: number | undefined;
  for (const line of source.split(/\r?\n/u)) {
    const section = line.match(/^(\s*)catalog:\s*$/u);
    if (section !== null) {
      catalogIndent = section[1]?.length ?? 0;
      continue;
    }
    if (
      catalogIndent === undefined ||
      line.trim().length === 0 ||
      line.trimStart().startsWith("#")
    ) {
      continue;
    }
    const indentation = line.length - line.trimStart().length;
    if (indentation <= catalogIndent) {
      catalogIndent = undefined;
      continue;
    }
    const entry = line.match(/^\s+([^:#][^:]*):\s*(.+?)\s*$/u);
    if (entry?.[1] === undefined || entry[2] === undefined) {
      continue;
    }
    catalog.set(unquote(entry[1]), yamlValue(entry[2]));
  }
  return catalog;
}

function workspacePatterns(source: string): readonly string[] {
  const patterns: string[] = [];
  let packagesIndent: number | undefined;
  for (const line of source.split(/\r?\n/u)) {
    const section = line.match(/^(\s*)packages:\s*$/u);
    if (section !== null) {
      packagesIndent = section[1]?.length ?? 0;
      continue;
    }
    if (
      packagesIndent === undefined ||
      line.trim().length === 0 ||
      line.trimStart().startsWith("#")
    ) {
      continue;
    }
    const indentation = line.length - line.trimStart().length;
    if (indentation <= packagesIndent) {
      packagesIndent = undefined;
      continue;
    }
    const entry = line.match(/^\s+-\s+(.+?)\s*$/u);
    if (entry?.[1] !== undefined) {
      patterns.push(yamlValue(entry[1]));
    }
  }
  return patterns;
}

function dependencyEntries(document: z.infer<typeof packageDocument>): ReadonlyMap<string, string> {
  const dependencies = new Map<string, string>();
  for (const section of [
    document.dependencies,
    document.devDependencies,
    document.optionalDependencies,
  ]) {
    for (const [name, range] of Object.entries(section ?? {})) {
      dependencies.set(name, range);
    }
  }
  return dependencies;
}

function peerDependencyEntries(
  document: z.infer<typeof packageDocument>,
): ReadonlyMap<string, string> {
  return new Map(Object.entries(document.peerDependencies ?? {}));
}

function manifestPattern(workspacePattern: string): string {
  if (workspacePattern.startsWith("!")) {
    return `!${workspacePattern.slice(1).replace(/\/$/u, "")}/package.json`;
  }
  return `${workspacePattern.replace(/\/$/u, "")}/package.json`;
}

async function workspacePackages(
  repoRoot: string,
  patterns: readonly string[],
): Promise<readonly WorkspacePackage[]> {
  const manifests = await glob(["package.json", ...patterns.map(manifestPattern)], {
    cwd: repoRoot,
    dot: true,
    onlyFiles: true,
    unique: true,
    ignore: ["**/node_modules/**", "**/.git/**", "**/.worktrees/**"],
  });
  return Promise.all(manifests.toSorted().map((path) => readWorkspacePackage(repoRoot, path)));
}

async function readWorkspacePackage(repoRoot: string, path: string): Promise<WorkspacePackage> {
  const source = await readFile(resolve(repoRoot, path), "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse ${path}: ${detail}`, { cause: error });
  }
  const document = packageDocument.safeParse(parsed);
  if (!document.success) {
    throw new Error(`Package manifest ${path} is invalid: ${document.error.message}`);
  }
  return {
    path,
    name: document.data.name ?? path,
    dependencies: dependencyEntries(document.data),
    peerDependencies: peerDependencyEntries(document.data),
  };
}

function addMajor(
  majors: Map<string, Map<number, Set<string>>>,
  dependency: string,
  range: string,
  packagePath: string,
): void {
  if (
    range.startsWith("catalog:") ||
    range.startsWith("workspace:") ||
    range.startsWith("file:") ||
    range.startsWith("link:")
  ) {
    return;
  }
  if (validRange(range) === null) {
    return;
  }
  const version = minVersion(range);
  if (version === null) {
    return;
  }
  const byMajor = majors.get(dependency) ?? new Map<number, Set<string>>();
  const packagePaths = byMajor.get(version.major) ?? new Set<string>();
  packagePaths.add(packagePath);
  byMajor.set(version.major, packagePaths);
  majors.set(dependency, byMajor);
}

interface CatalogLoad {
  readonly kind: "loaded";
  readonly source: string;
  readonly catalog: ReadonlyMap<string, string>;
}

interface LoadFailure {
  readonly kind: "failure";
  readonly finding: LaneFinding;
}

type CatalogLoadResult = CatalogLoad | LoadFailure;
type PackageLoadResult =
  | { readonly kind: "loaded"; readonly packages: readonly WorkspacePackage[] }
  | LoadFailure;

interface DriftAnalysis {
  readonly findings: readonly LaneFinding[];
  readonly versionMismatches: number;
  readonly duplicateMajors: number;
}

interface PackageAnalysis {
  readonly findings: readonly LaneFinding[];
  readonly versionMismatches: number;
}

async function loadCatalog(repoRoot: string): Promise<CatalogLoadResult> {
  try {
    const source = await readFile(resolve(repoRoot, "pnpm-workspace.yaml"), "utf8");
    return { kind: "loaded", source, catalog: catalogRanges(source) };
  } catch (error: unknown) {
    return {
      kind: "failure",
      finding: finding(
        "pnpm-workspace.yaml",
        "catalog-load",
        error instanceof Error ? error.message : String(error),
      ),
    };
  }
}

async function loadPackages(repoRoot: string, source: string): Promise<PackageLoadResult> {
  try {
    const packages = await workspacePackages(repoRoot, workspacePatterns(source));
    return { kind: "loaded", packages };
  } catch (error: unknown) {
    return {
      kind: "failure",
      finding: finding(
        "package.json",
        "manifest-load",
        error instanceof Error ? error.message : String(error),
      ),
    };
  }
}

function inspectPackage(
  catalog: ReadonlyMap<string, string>,
  workspacePackage: WorkspacePackage,
  majors: Map<string, Map<number, Set<string>>>,
): PackageAnalysis {
  const findings: LaneFinding[] = [];
  let versionMismatches = 0;
  for (const [dependency, range] of workspacePackage.dependencies) {
    const expected = catalog.get(dependency);
    const effectiveRange = range === "catalog:" && expected !== undefined ? expected : range;
    addMajor(majors, dependency, effectiveRange, workspacePackage.path);
    if (expected === undefined && range === "catalog:") {
      versionMismatches += 1;
      findings.push(
        finding(
          workspacePackage.path,
          "catalog-missing",
          `${dependency} uses catalog: but has no catalog entry.`,
        ),
      );
      continue;
    }
    if (isCatalogMismatch(range, expected)) {
      versionMismatches += 1;
      findings.push(
        finding(
          workspacePackage.path,
          "catalog-mismatch",
          `${dependency} uses ${range}, but the catalog declares ${expected}.`,
        ),
      );
    }
  }
  for (const [dependency, range] of workspacePackage.peerDependencies) {
    const expected = catalog.get(dependency);
    const effectiveRange = range === "catalog:" && expected !== undefined ? expected : range;
    addMajor(majors, dependency, effectiveRange, workspacePackage.path);
  }
  return { findings, versionMismatches };
}

function isCatalogMismatch(range: string, expected: string | undefined): expected is string {
  return (
    expected !== undefined &&
    range !== "catalog:" &&
    range !== expected &&
    !range.startsWith("catalog:") &&
    !range.startsWith("workspace:") &&
    // link: dependencies are deliberate local overrides (e.g. create-q9stack --link-local).
    !range.startsWith("link:")
  );
}

function duplicateMajorFindings(
  majors: ReadonlyMap<string, ReadonlyMap<number, ReadonlySet<string>>>,
): { readonly findings: readonly LaneFinding[]; readonly count: number } {
  const findings: LaneFinding[] = [];
  let count = 0;
  for (const [dependency, byMajor] of majors) {
    if (byMajor.size <= 1) {
      continue;
    }
    count += 1;
    const details = [...byMajor.entries()]
      .map(([major, paths]) => `${major}: ${[...paths].join(", ")}`)
      .join("; ");
    findings.push(
      finding(
        "pnpm-workspace.yaml",
        "duplicate-major",
        `${dependency} has multiple major ranges: ${details}.`,
      ),
    );
  }
  return { findings, count };
}

function analyzeVersionDrift(
  catalog: ReadonlyMap<string, string>,
  packages: readonly WorkspacePackage[],
): DriftAnalysis {
  const majors = new Map<string, Map<number, Set<string>>>();
  const packageAnalyses = packages.map((workspacePackage) =>
    inspectPackage(catalog, workspacePackage, majors),
  );
  const duplicateMajors = duplicateMajorFindings(majors);
  return {
    findings: [
      ...packageAnalyses.flatMap((analysis) => analysis.findings),
      ...duplicateMajors.findings,
    ],
    versionMismatches: packageAnalyses.reduce(
      (total, analysis) => total + analysis.versionMismatches,
      0,
    ),
    duplicateMajors: duplicateMajors.count,
  };
}

function failedResult(loadFailure: LoadFailure): LaneResult {
  return { status: "failed", findings: [loadFailure.finding], metrics: { filesChecked: 0 } };
}

async function runVersionDrift(context: LaneContext): Promise<LaneResult> {
  const catalogResult = await loadCatalog(context.repoRoot);
  if (catalogResult.kind === "failure") {
    return failedResult(catalogResult);
  }
  const packagesResult = await loadPackages(context.repoRoot, catalogResult.source);
  if (packagesResult.kind === "failure") {
    return failedResult(packagesResult);
  }
  const analysis = analyzeVersionDrift(catalogResult.catalog, packagesResult.packages);
  const result: LaneResult = {
    status: analysis.findings.length === 0 ? "passed" : "failed",
    metrics: {
      versionMismatches: analysis.versionMismatches,
      duplicateMajors: analysis.duplicateMajors,
      filesChecked: packagesResult.packages.length,
    },
  };
  return analysis.findings.length > 0 ? { ...result, findings: analysis.findings } : result;
}

export function versionDrift(): GateLane {
  return {
    id: "version-drift",
    title: "Dependency version drift",
    categories: ["dependency"],
    triggers: categoryTrigger(["dependency"]),
    run: runVersionDrift,
  };
}
