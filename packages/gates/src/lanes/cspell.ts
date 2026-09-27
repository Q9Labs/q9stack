import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { LaneFinding } from "../core/report.js";
import type { GateLane, LaneContext, LaneResult } from "../core/types.js";
import { prepareBaselineLane } from "./lane-report.js";
import { categoryTrigger } from "./trigger.js";

export interface CSpellOptions {
  readonly baselinePath?: string;
  readonly paths?: readonly string[];
}

const defaultPaths = [
  "AGENTS.md",
  "README.md",
  "package.json",
  "src",
  "apps",
  "packages",
  "infra",
  "scripts",
  ".github",
  "docs",
] as const;

function normalizeLines(input: string): readonly string[] {
  return [
    ...new Set(
      input
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ].toSorted();
}

function issueFinding(line: string): LaneFinding {
  const match = /^(?<file>[^:]+):(?<line>\d+):(?<column>\d+):(?<text>.*)$/u.exec(line);
  if (match?.groups === undefined) {
    return { file: "cspell", rule: "spelling", message: line };
  }
  const lineNumber = Number.parseInt(match.groups["line"] ?? "", 10);
  const column = match.groups["column"] ?? "";
  return {
    file: match.groups["file"] ?? "cspell",
    ...(Number.isNaN(lineNumber) ? {} : { line: lineNumber }),
    rule: "spelling",
    message: `${match.groups["text"] ?? line}${column.length === 0 ? "" : ` (column ${column})`}`,
  };
}

async function readBaseline(repoRoot: string, path: string): Promise<readonly string[]> {
  try {
    return normalizeLines(await readFile(resolve(repoRoot, path), "utf8")).filter(
      (line) => !line.startsWith("#"),
    );
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not read CSpell baseline at ${path}: ${detail}. Create it with an empty file or add reviewed issue lines.`,
      { cause: error },
    );
  }
}

async function listFiles(
  context: LaneContext,
  flags: readonly string[],
  paths: readonly string[],
): Promise<readonly string[]> {
  const result = await context.exec("git", ["ls-files", ...flags, "--", ...paths], {
    cwd: context.repoRoot,
  });
  if (result.failed) {
    throw new Error(`Could not list files for CSpell: ${result.stderr || result.stdout}`);
  }
  return normalizeLines(result.stdout);
}

// Tracked + untracked (non-ignored) files, minus files deleted in the worktree but still indexed.
async function fileList(context: LaneContext, paths: readonly string[]): Promise<string> {
  const [present, deleted] = await Promise.all([
    listFiles(context, ["--cached", "--others", "--exclude-standard"], paths),
    listFiles(context, ["--deleted"], paths),
  ]);
  const missing = new Set(deleted);
  const files = present.filter((file) => !missing.has(file));
  return (files.length === 0 ? context.changedFiles : files).join("\n");
}

async function runCSpell(context: LaneContext, options: CSpellOptions): Promise<LaneResult> {
  const baselinePath = options.baselinePath ?? "cspell-baseline.txt";
  const baselineResult = await prepareBaselineLane(
    context,
    baselinePath,
    () => readBaseline(context.repoRoot, baselinePath),
    {
      command: "cspell",
      installHint: "Install CSpell with `pnpm add -D cspell`, then rerun the spelling gate.",
    },
  );
  if (baselineResult.kind === "failed") {
    return baselineResult.result;
  }
  const baseline = baselineResult.value;

  let input: string;
  try {
    input = await fileList(context, options.paths ?? defaultPaths);
  } catch (error: unknown) {
    return {
      status: "failed",
      findings: [
        {
          file: "git",
          rule: "file-list",
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }

  const result = await context.exec(
    "cspell",
    [
      "lint",
      "--file-list",
      "stdin",
      "--gitignore",
      "--no-progress",
      "--no-summary",
      "--no-color",
      "--no-exit-code",
      "--issue-template",
      "$filename:$row:$col:$text",
    ],
    { cwd: context.repoRoot, input },
  );
  const issues = normalizeLines(result.stdout);
  if (result.failed && issues.length === 0) {
    return {
      status: "failed",
      findings: [
        {
          file: "cspell",
          rule: "execution",
          message: result.stderr.trim() || "CSpell failed without issue output.",
        },
      ],
    };
  }

  const baselineSet = new Set(baseline);
  const newIssues = issues.filter((issue) => !baselineSet.has(issue));
  return {
    status: newIssues.length === 0 ? "passed" : "failed",
    baseline: { before: baseline.length, after: issues.length },
    metrics: { spellingIssues: issues.length },
    ...(newIssues.length === 0 ? {} : { findings: newIssues.map((issue) => issueFinding(issue)) }),
  };
}

export function cspell(options: CSpellOptions = {}): GateLane {
  const categories = [
    "source",
    "test",
    "docs",
    "dependency",
    "gateDefinition",
    "infra",
    "contract",
    "workflow",
    "shell",
    "sql",
    "env",
    "ui",
  ] as const;
  return {
    id: "cspell",
    title: "CSpell spelling ratchet",
    categories,
    triggers: categoryTrigger(categories),
    baseline: { path: options.baselinePath ?? "cspell-baseline.txt", format: "text" },
    run: (context) => runCSpell(context, options),
  };
}
