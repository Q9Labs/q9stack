import { existsSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import { z } from "zod";

import { probeTool, type ToolRequirement } from "../adapters/tool.js";
import type { LaneFinding } from "../core/report.js";
import type { GateLane, LaneContext, LaneResult } from "../core/types.js";
import { commandFinding, resolveProjectPackage } from "./command.js";
import { categoryTrigger } from "./trigger.js";

export interface SemgrepLaneOptions {
  readonly packs?: readonly string[];
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
      extra: z.object({ message: z.string() }),
    }),
  ),
  errors: z.array(z.object({ message: z.string() })),
});

// Semgrep prefixes rule ids with the config path; keep the authored `q9.…` id.
function ruleId(checkId: string): string {
  const index = checkId.indexOf("q9.");
  return index === -1 ? checkId : checkId.slice(index);
}

function parseSemgrepOutput(stdout: string): readonly LaneFinding[] {
  const parsed = semgrepOutputSchema.safeParse(JSON.parse(stdout));
  if (!parsed.success) {
    throw new Error(
      `Semgrep JSON output did not match the expected shape: ${parsed.error.message}`,
    );
  }
  const findings = parsed.data.results.map((result) => ({
    file: result.path,
    line: result.start.line,
    rule: ruleId(result.check_id),
    message: result.extra.message.replace(/\s+/gu, " ").trim(),
  }));
  const errors = parsed.data.errors.map((error) =>
    commandFinding("semgrep", error.message, "semgrep-error"),
  );
  return [...findings, ...errors];
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

async function runSemgrep(context: LaneContext, packs: readonly string[]): Promise<LaneResult> {
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
  const availability = await probeTool(context.exec, semgrepTool, context.repoRoot);
  if (!availability.available) {
    return { status: "failed", findings: [availability.finding] };
  }
  try {
    const result = await context.exec("semgrep", semgrepArgs(context, packs), {
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
    const findings = parseSemgrepOutput(result.stdout);
    if (findings.length > 0) {
      return { status: "failed", findings };
    }
    return { status: "passed" };
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
    run: (context) => runSemgrep(context, packs),
  };
}
