import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { z } from "zod";

import type { LaneFinding } from "../core/report.js";
import type { CommandResult, GateLane, LaneContext, LaneResult } from "../core/types.js";
import { prepareBaselineLane } from "./lane-report.js";
import { categoryTrigger } from "./trigger.js";

export interface OsvOptions {
  readonly baselinePath?: string;
}

interface OsvFinding {
  readonly ecosystem: string;
  readonly id: string;
  readonly package: string;
  readonly severity: string;
  readonly source: string;
  readonly summary: string;
  readonly version: string;
}

const baselineEntrySchema = z.object({
  ecosystem: z.string(),
  id: z.string().min(1),
  package: z.string(),
  severity: z.string().optional(),
  source: z.string(),
  summary: z.string().optional(),
  version: z.string(),
});

const baselineSchema = z.object({ entries: z.array(baselineEntrySchema) });

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

function normalizeSource(source: string, repoRoot: string): string {
  const normalized = source.replaceAll("\\", "/");
  if (!isAbsolute(source)) {
    return normalized;
  }
  return relative(repoRoot, source).replaceAll("\\", "/");
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

function collectFindings(report: OsvReport, repoRoot: string): readonly OsvFinding[] {
  const findings = new Map<string, OsvFinding>();
  const reportFindings = report.results.flatMap((result) => {
    const source = normalizeSource(result.source?.path ?? "unknown", repoRoot);
    return result.packages.flatMap((packageResult) => packageFindings(packageResult, source));
  });
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
): Promise<z.infer<typeof baselineSchema>> {
  const path = resolve(repoRoot, baselinePath);
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

  const keys = new Set<string>();
  for (const entry of validated.data.entries) {
    const key = findingKey({
      ecosystem: entry.ecosystem,
      id: entry.id,
      package: entry.package,
      severity: entry.severity ?? "UNKNOWN",
      source: normalizeSource(entry.source, repoRoot),
      summary: entry.summary ?? "",
      version: entry.version,
    });
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

async function runOsv(context: LaneContext, options: OsvOptions): Promise<LaneResult> {
  const baselinePath = options.baselinePath ?? "osv-baseline.json";
  const baselineResult = await prepareBaselineLane(
    context,
    baselinePath,
    () => readBaseline(context.repoRoot, baselinePath),
    {
      command: "osv-scanner",
      installHint: "Install the official OSV-Scanner CLI, then rerun the OSV gate.",
    },
  );
  if (baselineResult.kind === "failed") {
    return baselineResult.result;
  }
  const baseline = baselineResult.value;

  const result = await context.exec(
    "osv-scanner",
    [
      "scan",
      "source",
      "-r",
      "--experimental-exclude",
      "scratchpad",
      "--experimental-exclude",
      ".worktrees",
      "--format",
      "json",
      ".",
    ],
    { cwd: context.repoRoot },
  );

  const parsed = parseReport(result);
  if (parsed.kind === "failed") {
    return parsed.result;
  }

  const findings = collectFindings(parsed.report, context.repoRoot);
  if (result.failed && findings.length === 0) {
    return {
      status: "failed",
      findings: [
        {
          file: "osv-scanner",
          rule: "execution",
          message: result.stderr.trim() || "OSV-Scanner failed without vulnerability records.",
        },
      ],
    };
  }

  const baselineKeys = new Set(
    baseline.entries.map((entry) =>
      findingKey({
        ecosystem: entry.ecosystem,
        id: entry.id,
        package: entry.package,
        severity: entry.severity ?? "UNKNOWN",
        source: normalizeSource(entry.source, context.repoRoot),
        summary: entry.summary ?? "",
        version: entry.version,
      }),
    ),
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
    baseline: { path: options.baselinePath ?? "osv-baseline.json", format: "json" },
    run: (context) => runOsv(context, options),
  };
}
