import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import { z } from "zod";

import { pathExists } from "../adapters/filesystem.js";
import { probeTool, type ToolRequirement } from "../adapters/tool.js";
import type { LaneFinding } from "../core/report.js";
import type { CommandResult, GateExec, GateLane, LaneContext, LaneResult } from "../core/types.js";
import { prepareBaselineLane } from "./lane-report.js";
import { categoryTrigger } from "./trigger.js";

export interface OsvOptions {
  readonly baselinePath?: string;
  readonly exclude?: readonly string[];
}

const DEFAULT_EXCLUDES = ["scratchpad", ".worktrees"];
const osvTool: ToolRequirement = {
  command: "osv-scanner",
  installHint: "Install the official OSV-Scanner CLI, then rerun the OSV gate.",
};

interface OsvFinding {
  readonly ecosystem: string;
  readonly id: string;
  readonly package: string;
  readonly severity: string;
  readonly source: string;
  readonly summary: string;
  readonly version: string;
}

const baselineEntrySchema = z
  .object({
    ecosystem: z.string(),
    id: z.string().min(1),
    package: z.string(),
    severity: z.string().optional(),
    source: z.string(),
    summary: z.string().optional(),
    version: z.string(),
    acceptedAt: z.string().optional(),
    message: z.string().optional(),
  })
  .passthrough();

const baselineSchema = z.object({ entries: z.array(baselineEntrySchema) }).passthrough();

const vulnerabilitySchema = z.object({
  database_specific: z.object({ severity: z.string().optional() }).optional(),
  id: z.string().min(1),
  summary: z.string().optional(),
});

const packageSchema = z.object({
  package: z
    .object({
      ecosystem: z.string().optional(),
      name: z.string().optional(),
      version: z.string().optional(),
    })
    .optional(),
  vulnerabilities: z.array(vulnerabilitySchema).default([]),
});

const resultSchema = z.object({
  packages: z.array(packageSchema).default([]),
  source: z.object({ path: z.string().optional() }).optional(),
});

const reportSchema = z.object({ results: z.array(resultSchema) });

type OsvReport = z.infer<typeof reportSchema>;
type OsvPackage = z.infer<typeof packageSchema>;
type OsvVulnerability = z.infer<typeof vulnerabilitySchema>;

function findingKey(finding: OsvFinding): string {
  return [finding.source, finding.ecosystem, finding.package, finding.version, finding.id].join(
    "|",
  );
}

async function baselineEntryKey(
  entry: z.infer<typeof baselineEntrySchema>,
  repoRoot: string,
): Promise<string> {
  return findingKey({
    ecosystem: entry.ecosystem,
    id: entry.id,
    package: entry.package,
    severity: entry.severity ?? "UNKNOWN",
    source: await normalizeSource(entry.source, repoRoot),
    summary: entry.summary ?? "",
    version: entry.version,
  });
}

async function normalizeSource(source: string, repoRoot: string): Promise<string> {
  const normalized = source.replaceAll("\\", "/");
  if (!isAbsolute(source)) {
    return normalized;
  }
  const [canonicalRoot, canonicalSource] = await Promise.all([
    realpath(repoRoot),
    realpath(source),
  ]);
  return relative(canonicalRoot, canonicalSource).replaceAll("\\", "/");
}

function packageFindings(packageResult: OsvPackage, source: string): readonly OsvFinding[] {
  const packageInfo = packageResult.package;
  return packageResult.vulnerabilities.map((vulnerability) =>
    vulnerabilityFinding(packageInfo, vulnerability, source),
  );
}

function vulnerabilityFinding(
  packageInfo: OsvPackage["package"],
  vulnerability: OsvVulnerability,
  source: string,
): OsvFinding {
  return {
    ecosystem: packageInfo?.ecosystem ?? "unknown",
    id: vulnerability.id,
    package: packageInfo?.name ?? "unknown",
    severity: vulnerability.database_specific?.severity ?? "UNKNOWN",
    source,
    summary: vulnerability.summary ?? "",
    version: packageInfo?.version ?? "unknown",
  };
}

async function collectFindings(
  report: OsvReport,
  repoRoot: string,
): Promise<readonly OsvFinding[]> {
  const findings = new Map<string, OsvFinding>();
  const reportFindings = (
    await Promise.all(
      report.results.map(async (result) => {
        const source = await normalizeSource(result.source?.path ?? "unknown", repoRoot);
        return result.packages.flatMap((packageResult) => packageFindings(packageResult, source));
      }),
    )
  ).flat();
  for (const finding of reportFindings) {
    findings.set(findingKey(finding), finding);
  }
  return [...findings.values()].toSorted((left, right) =>
    findingKey(left).localeCompare(findingKey(right)),
  );
}

function findingMessage(finding: OsvFinding): string {
  return `${finding.id} ${finding.package}@${finding.version} (${finding.ecosystem})${
    finding.summary.length === 0 ? "" : `: ${finding.summary}`
  }`;
}

function laneFindings(findings: readonly OsvFinding[]): readonly LaneFinding[] {
  return findings.map((finding) => ({
    file: finding.source,
    rule: "osv",
    message: findingMessage(finding),
  }));
}

async function readBaseline(
  repoRoot: string,
  baselinePath: string,
  allowMissing = false,
): Promise<z.infer<typeof baselineSchema>> {
  const path = resolve(repoRoot, baselinePath);
  if (allowMissing && !(await pathExists(path))) {
    return { entries: [] };
  }
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not read OSV baseline at ${baselinePath}: ${detail}. Create it with {"entries": []}.`,
      { cause: error },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`OSV baseline ${baselinePath} is not valid JSON: ${detail}.`, { cause: error });
  }
  const validated = baselineSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`OSV baseline ${baselinePath} is invalid: ${validated.error.message}.`);
  }

  const entryKeys = await Promise.all(
    validated.data.entries.map((entry) => baselineEntryKey(entry, repoRoot)),
  );
  const keys = new Set<string>();
  for (const key of entryKeys) {
    if (keys.has(key)) {
      throw new Error(`OSV baseline ${baselinePath} contains duplicate entry ${key}.`);
    }
    keys.add(key);
  }
  return validated.data;
}

type ReportParseResult =
  | { readonly kind: "parsed"; readonly report: OsvReport }
  | { readonly kind: "failed"; readonly result: LaneResult };

type OsvScanResult =
  | { readonly kind: "ready"; readonly findings: readonly OsvFinding[] }
  | { readonly kind: "failed"; readonly result: LaneResult };

function parseReport(result: CommandResult): ReportParseResult {
  try {
    const input: unknown = JSON.parse(result.stdout);
    const validated = reportSchema.safeParse(input);
    if (!validated.success) {
      throw new Error(validated.error.message);
    }
    return { kind: "parsed", report: validated.data };
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      kind: "failed",
      result: {
        status: "failed",
        findings: [
          {
            file: "osv-scanner",
            rule: "report",
            message: `OSV-Scanner produced an unreadable report: ${detail}${
              result.stderr.trim().length === 0 ? "" : ` (${result.stderr.trim()})`
            }`,
          },
        ],
      },
    };
  }
}

function scanArgs(options: OsvOptions): readonly string[] {
  const excludeArgs = (options.exclude ?? DEFAULT_EXCLUDES).flatMap((directory) => [
    "--experimental-exclude",
    directory,
  ]);
  return ["scan", "source", "-r", ...excludeArgs, "--format", "json", "."];
}

async function scanOsv(
  repoRoot: string,
  exec: GateExec,
  options: OsvOptions,
  command = osvTool.command,
): Promise<OsvScanResult> {
  const result = await exec(command, scanArgs(options), { cwd: repoRoot });
  const parsed = parseReport(result);
  if (parsed.kind === "failed") {
    return parsed;
  }

  const findings = await collectFindings(parsed.report, repoRoot);
  if (result.failed && findings.length === 0) {
    return {
      kind: "failed",
      result: {
        status: "failed",
        findings: [
          {
            file: osvTool.command,
            rule: "execution",
            message: result.stderr.trim() || "OSV-Scanner failed without vulnerability records.",
          },
        ],
      },
    };
  }
  return { kind: "ready", findings };
}

async function acceptOsvBaseline(
  repoRoot: string,
  baselinePath: string,
  message: string,
  exec: GateExec,
  options: OsvOptions,
): Promise<string> {
  const availability = await probeTool(exec, osvTool, repoRoot);
  if (!availability.available) {
    throw new Error(availability.finding.message);
  }

  const scan = await scanOsv(repoRoot, exec, options, availability.command);
  if (scan.kind === "failed") {
    const detail = scan.result.findings?.map((finding) => finding.message).join("\n");
    if (detail === undefined || detail.length === 0) {
      throw new Error("OSV-Scanner failed.");
    }
    throw new Error(detail);
  }

  const baseline = await readBaseline(repoRoot, baselinePath, true);
  const acceptedKeys = new Set(
    await Promise.all(baseline.entries.map((entry) => baselineEntryKey(entry, repoRoot))),
  );
  const newFindings = scan.findings.filter((finding) => !acceptedKeys.has(findingKey(finding)));
  const path = resolve(repoRoot, baselinePath);
  if (newFindings.length === 0 && (await pathExists(path))) {
    return path;
  }

  const acceptedAt = new Date().toISOString();
  const updated = {
    ...baseline,
    entries: [
      ...baseline.entries,
      ...newFindings.map((finding) => Object.assign({}, finding, { acceptedAt, message })),
    ],
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  return path;
}

async function runOsv(context: LaneContext, options: OsvOptions): Promise<LaneResult> {
  const baselinePath = options.baselinePath ?? "osv-baseline.json";
  const baselineResult = await prepareBaselineLane(
    context,
    baselinePath,
    () => readBaseline(context.repoRoot, baselinePath),
    osvTool,
  );
  if (baselineResult.kind === "failed") {
    return baselineResult.result;
  }
  const baseline = baselineResult.value;

  const scan = await scanOsv(context.repoRoot, context.exec, options);
  if (scan.kind === "failed") {
    return scan.result;
  }
  const findings = scan.findings;

  const baselineKeys = new Set(
    await Promise.all(baseline.entries.map((entry) => baselineEntryKey(entry, context.repoRoot))),
  );
  const unbaselined = findings.filter((finding) => !baselineKeys.has(findingKey(finding)));
  return {
    status: unbaselined.length === 0 ? "passed" : "failed",
    baseline: { before: baseline.entries.length, after: findings.length },
    metrics: { vulnerabilities: findings.length },
    ...(unbaselined.length === 0 ? {} : { findings: laneFindings(unbaselined) }),
  };
}

export function osv(options: OsvOptions = {}): GateLane {
  return {
    id: "osv",
    title: "OSV vulnerability scan",
    categories: ["dependency"],
    triggers: categoryTrigger(["dependency"]),
    baseline: {
      path: options.baselinePath ?? "osv-baseline.json",
      format: "json",
      accept: (repoRoot, message, exec) =>
        acceptOsvBaseline(
          repoRoot,
          options.baselinePath ?? "osv-baseline.json",
          message,
          exec,
          options,
        ),
    },
    run: (context) => runOsv(context, options),
  };
}
