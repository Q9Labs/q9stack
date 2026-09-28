import { createHash } from "node:crypto";
import { existsSync, readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

import { z } from "zod";

import { probeTool, type ToolRequirement } from "../adapters/tool.js";
import type { LaneFinding } from "../core/report.js";
import type { GateLane, LaneContext, LaneResult } from "../core/types.js";
import { commandFinding, resolveProjectPackage } from "./command.js";
import { prepareBaselineLane } from "./lane-report.js";
import { categoryTrigger } from "./trigger.js";

export interface SemgrepLaneOptions {
  readonly baselinePath?: string;
  readonly packs?: readonly string[];
}

interface SemgrepBaselineEntry {
  readonly file: string;
  readonly fingerprint: string;
  readonly rule: string;
}

interface SemgrepFinding {
  readonly fingerprint: string | undefined;
  readonly finding: LaneFinding;
  readonly rule: string;
}

const semgrepTool: ToolRequirement = {
  command: "semgrep",
  installHint:
    "Install Semgrep CLI from https://semgrep.dev/docs/getting-started, then rerun q9gate.",
};

function isConfigFile(path: string): boolean {
  return path.endsWith(".yml") || path.endsWith(".yaml");
}

function directoryConfigs(path: string): readonly string[] {
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    return [path];
  }
  return readdirSync(path)
    .filter((entry) => isConfigFile(entry))
    .toSorted()
    .map((entry) => join(path, entry));
}

function resolveConfig(repoRoot: string, specifier: string): readonly string[] {
  if (!specifier.startsWith(".") && !isAbsolute(specifier)) {
    const packagePath = resolveProjectPackage(repoRoot, specifier);
    return packagePath === undefined ? [specifier] : [packagePath];
  }
  const projectPath = isAbsolute(specifier) ? specifier : resolve(repoRoot, specifier);
  return directoryConfigs(projectPath);
}

function configArgs(repoRoot: string, packs: readonly string[]): readonly string[] {
  return packs.flatMap((pack) =>
    resolveConfig(repoRoot, pack).flatMap((config) => ["--config", config]),
  );
}

function unresolvedPackagePacks(repoRoot: string, packs: readonly string[]): readonly string[] {
  return packs.filter(
    (pack) =>
      !pack.startsWith(".") &&
      !isAbsolute(pack) &&
      resolveProjectPackage(repoRoot, pack) === undefined,
  );
}

function changedSemgrepFiles(context: LaneContext): readonly string[] {
  return context.changedFiles.filter((file) =>
    [".cjs", ".js", ".jsx", ".mjs", ".py", ".ts", ".tsx"].some((extension) =>
      file.endsWith(extension),
    ),
  );
}

const semgrepOutputSchema = z.object({
  results: z.array(
    z.object({
      check_id: z.string(),
      path: z.string(),
      start: z.object({ line: z.number().int().positive() }),
      extra: z.object({
        fingerprint: z.string().optional(),
        lines: z.string().optional(),
        message: z.string(),
      }),
    }),
  ),
  errors: z.array(
    z
      .object({
        message: z.string(),
        path: z
          .union([
            z.string(),
            z.object({ path: z.string().optional(), src: z.string().optional() }).passthrough(),
          ])
          .nullable()
          .optional(),
        spans: z.array(z.object({ file: z.string().optional() }).passthrough()).optional(),
        type: z.union([z.string(), z.array(z.json())]).optional(),
      })
      .passthrough(),
  ),
});

const semgrepBaselineSchema = z.object({
  entries: z.array(
    z.object({
      file: z.string(),
      fingerprint: z.string().min(1),
      rule: z.string().min(1),
    }),
  ),
});

type SemgrepError = z.infer<typeof semgrepOutputSchema>["errors"][number];

// Semgrep prefixes rule ids with the config path; keep the authored `q9.…` id.
function ruleId(checkId: string): string {
  const index = checkId.indexOf("q9.");
  return index === -1 ? checkId : checkId.slice(index);
}

function normalizedPath(path: string, repoRoot: string): string {
  const normalized = path.replaceAll("\\", "/");
  const root = resolve(repoRoot).replaceAll("\\", "/");
  if (isAbsolute(path)) {
    return relative(repoRoot, path).replaceAll("\\", "/");
  }
  if (normalized.startsWith(`${root}/`)) {
    return normalized.slice(root.length + 1);
  }
  return normalized.startsWith("./") ? normalized.slice(2) : normalized;
}

function normalizedSnippet(snippet: string): string {
  return snippet.replace(/\s+/gu, " ").trim();
}

function fingerprint(
  rule: string,
  file: string,
  semgrepFingerprint: string | undefined,
  lines: string | undefined,
): string | undefined {
  const ownFingerprint = semgrepFingerprint?.trim();
  const snippet = lines === undefined ? "" : normalizedSnippet(lines);
  const identity =
    ownFingerprint === undefined || ownFingerprint.length === 0
      ? snippet.length === 0
        ? undefined
        : `snippet:${snippet}`
      : `semgrep:${ownFingerprint}`;
  if (identity === undefined) {
    return undefined;
  }
  return createHash("sha256").update(`${rule}\0${file}\0${identity}`).digest("hex");
}

function parseFinding(
  result: z.infer<typeof semgrepOutputSchema>["results"][number],
  repoRoot: string,
): SemgrepFinding {
  const file = normalizedPath(result.path, repoRoot);
  const rule = ruleId(result.check_id);
  return {
    fingerprint: fingerprint(rule, file, result.extra.fingerprint, result.extra.lines),
    rule,
    finding: {
      file,
      line: result.start.line,
      rule,
      message: result.extra.message.replace(/\s+/gu, " ").trim(),
    },
  };
}

function isSourceParseError(error: SemgrepError): boolean {
  const type =
    error.type === undefined
      ? ""
      : typeof error.type === "string"
        ? error.type.toLowerCase()
        : JSON.stringify(error.type).toLowerCase();
  if (
    /(?:rule.?parse|invalid.?rule)/u.test(type) ||
    /\brule\s+parse\s+error\b/iu.test(error.message)
  ) {
    return false;
  }
  const isParseError =
    /(?:partial.?parsing|parse|parser|syntax|lexical)/u.test(type) ||
    /\b(?:parse|syntax|lexical)\s+error\b/iu.test(error.message);
  const path = errorPath(error);
  return isParseError && path !== undefined && !/\.ya?ml$/iu.test(path);
}

function errorPath(error: SemgrepError): string | undefined {
  if (typeof error.path === "string") {
    return error.path;
  }
  if (error.path !== undefined && error.path !== null) {
    const path = error.path.path ?? error.path.src;
    if (path !== undefined) {
      return path;
    }
  }
  const spanFile = error.spans?.find((span) => span.file !== undefined)?.file;
  if (spanFile !== undefined) {
    return spanFile;
  }
  return /(?<file>(?:[A-Za-z]:)?[A-Za-z0-9_./\\-]+\.[A-Za-z0-9]+):\d+(?::\d+)?/u.exec(error.message)
    ?.groups?.["file"];
}

function parseWarnings(errors: readonly SemgrepError[], repoRoot: string): readonly LaneFinding[] {
  const warningsByFile = new Map<string, Set<string>>();
  for (const error of errors) {
    const path = errorPath(error);
    if (!isSourceParseError(error) || path === undefined) {
      continue;
    }
    const file = normalizedPath(path, repoRoot);
    const messages = warningsByFile.get(file) ?? new Set<string>();
    messages.add(error.message.replace(/\s+/gu, " ").trim());
    warningsByFile.set(file, messages);
  }
  return [...warningsByFile].map(([file, messages]) => ({
    file,
    rule: "semgrep-parse-warning",
    message: `Semgrep skipped ${file} after a parse error: ${[...messages].join("; ")}`,
  }));
}

async function readBaseline(
  repoRoot: string,
  baselinePath: string,
): Promise<z.infer<typeof semgrepBaselineSchema>> {
  const path = resolve(repoRoot, baselinePath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not load Semgrep baseline at ${baselinePath}: ${detail}. Create it with {"entries": []}.`,
      { cause: error },
    );
  }

  const validated = semgrepBaselineSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`Semgrep baseline ${baselinePath} is invalid: ${validated.error.message}.`);
  }
  return {
    entries: validated.data.entries.map((entry) => ({
      file: normalizedPath(entry.file, repoRoot),
      rule: ruleId(entry.rule),
      fingerprint: entry.fingerprint,
    })),
  };
}

function baselineKey(entry: SemgrepBaselineEntry): string {
  return JSON.stringify([entry.file, entry.rule, entry.fingerprint]);
}

function unbaselinedFindings(
  findings: readonly SemgrepFinding[],
  baseline: readonly SemgrepBaselineEntry[],
): readonly SemgrepFinding[] {
  const accepted = new Map<string, number>();
  for (const entry of baseline) {
    const key = baselineKey(entry);
    accepted.set(key, (accepted.get(key) ?? 0) + 1);
  }
  const newFindings: SemgrepFinding[] = [];
  for (const result of findings) {
    if (result.fingerprint === undefined) {
      newFindings.push(result);
      continue;
    }
    const key = baselineKey({
      file: result.finding.file,
      rule: result.rule,
      fingerprint: result.fingerprint,
    });
    const count = accepted.get(key) ?? 0;
    if (count === 0) {
      newFindings.push(result);
      continue;
    }
    accepted.set(key, count - 1);
  }
  return newFindings;
}

function parseSemgrepOutput(stdout: string, repoRoot: string) {
  const input: unknown = JSON.parse(stdout);
  const parsed = semgrepOutputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      `Semgrep JSON output did not match the expected shape: ${parsed.error.message}`,
    );
  }
  return {
    findings: parsed.data.results.map((result) => parseFinding(result, repoRoot)),
    errors: parsed.data.errors,
  };
}

function semgrepArgs(context: LaneContext, packs: readonly string[]): readonly string[] {
  const args = [
    "scan",
    ...configArgs(context.repoRoot, packs),
    "--metrics=off",
    "--json",
    "--quiet",
  ];
  // Explicit targets bypass `.semgrepignore`; `--include` filters keep changed-file scans
  // consistent with the full scan.
  const files = context.scope === "full" ? [] : changedSemgrepFiles(context);
  args.push(...files.map((file) => `--include=${file}`), ".");
  return args;
}

function findingsResult(
  parsed: ReturnType<typeof parseSemgrepOutput>,
  baseline: z.infer<typeof semgrepBaselineSchema> | undefined,
  repoRoot: string,
): LaneResult {
  const parseErrorWarnings = parseWarnings(parsed.errors, repoRoot);
  const executionErrors = parsed.errors.filter((error) => !isSourceParseError(error));
  const unbaselined =
    baseline === undefined
      ? parsed.findings
      : unbaselinedFindings(parsed.findings, baseline.entries);
  const findings = [
    ...unbaselined.map((finding) => finding.finding),
    ...executionErrors.map((error) => commandFinding("semgrep", error.message, "semgrep-error")),
    ...parseErrorWarnings,
  ];
  return {
    status: executionErrors.length > 0 || unbaselined.length > 0 ? "failed" : "passed",
    ...(findings.length === 0 ? {} : { findings }),
    ...(baseline === undefined
      ? {}
      : { baseline: { before: baseline.entries.length, after: parsed.findings.length } }),
  };
}

async function scanSemgrep(
  context: LaneContext,
  command: string,
  packs: readonly string[],
  baseline: z.infer<typeof semgrepBaselineSchema> | undefined,
): Promise<LaneResult> {
  const result = await context.exec(command, semgrepArgs(context, packs), {
    cwd: context.repoRoot,
  });
  if (result.stdout.trim().length === 0) {
    const output = result.stderr.trim();
    return {
      status: "failed",
      findings: [
        commandFinding(
          "semgrep",
          output.length === 0 ? "semgrep scan produced no output." : `semgrep failed: ${output}`,
        ),
      ],
    };
  }
  return findingsResult(
    parseSemgrepOutput(result.stdout, context.repoRoot),
    baseline,
    context.repoRoot,
  );
}

async function runSemgrep(
  context: LaneContext,
  packs: readonly string[],
  baselinePath: string | undefined,
): Promise<LaneResult> {
  const unresolved = unresolvedPackagePacks(context.repoRoot, packs);
  if (unresolved.length > 0) {
    return {
      status: "failed",
      findings: unresolved.map((pack) =>
        commandFinding(
          pack,
          `Semgrep pack ${pack} could not be resolved. Install the package that exports it.`,
          "missing-semgrep-pack",
        ),
      ),
    };
  }

  let baseline: z.infer<typeof semgrepBaselineSchema> | undefined;
  let command: string;
  if (baselinePath !== undefined) {
    const prepared = await prepareBaselineLane(
      context,
      baselinePath,
      () => readBaseline(context.repoRoot, baselinePath),
      semgrepTool,
    );
    if (prepared.kind === "failed") {
      return prepared.result;
    }
    baseline = prepared.value;
    command = semgrepTool.command;
  } else {
    const availability = await probeTool(context.exec, semgrepTool, context.repoRoot);
    if (!availability.available) {
      return { status: "failed", findings: [availability.finding] };
    }
    command = availability.command;
  }

  try {
    return await scanSemgrep(context, command, packs, baseline);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      status: "failed",
      findings: [commandFinding("semgrep", `semgrep could not be executed: ${detail}`)],
    };
  }
}

export function semgrep(options: SemgrepLaneOptions = {}): GateLane {
  const packs = options.packs ?? [".semgrep"];
  return {
    id: "semgrep",
    title: "Semgrep",
    categories: ["source", "ui"],
    triggers: categoryTrigger(["source", "ui"]),
    ...(options.baselinePath === undefined
      ? {}
      : { baseline: { path: options.baselinePath, format: "json" as const } }),
    run: (context) => runSemgrep(context, packs, options.baselinePath),
  };
}
