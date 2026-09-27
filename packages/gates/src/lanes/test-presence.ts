import { access, readFile } from "node:fs/promises";
import { extname, join, basename, dirname } from "node:path";

import { z } from "zod";

import type { LaneFinding } from "../core/report.js";
import type { GateLane, LaneContext, LaneResult } from "../core/types.js";
import { categoryTrigger } from "./trigger.js";

export interface TestPresenceOptions {
  readonly sourceRoots?: readonly string[];
  readonly exclusionsPath?: string;
}

const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const testNamePattern = /(?:^|[./-])(?:test|spec)\.[cm]?[jt]sx?$/u;
const ignoredPathPatterns = [
  /(^|\/)__tests__(\/|$)/u,
  /(^|\/)__mocks__(\/|$)/u,
  /(^|\/)node_modules(\/|$)/u,
  /(^|\/)\.turbo(\/|$)/u,
  /(^|\/)coverage(\/|$)/u,
  /(^|\/)dist(\/|$)/u,
  /(^|\/)build(\/|$)/u,
  /(^|\/)assets(\/|$)/u,
  /(^|\/)public(\/|$)/u,
  /(^|\/)docs(\/|$)/u,
  /(^|\/)scratchpad(\/|$)/u,
  /(^|\/)scripts(\/|$)/u,
  /(^|\/)migrations(\/|$)/u,
  /(^|\/)_generated(\/|$)/u,
  /(^|\/)routeTree\.gen\.ts$/u,
] as const;
const ignoredBasenames = new Set(["__root", "index", "types", "vite-env"]);
const importPatterns = [
  /\bfrom\s+["']([^"']+)["']/gu,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/gu,
] as const;

const exclusionSchema = z.object({
  exclusions: z.object({}).catchall(z.string()).optional(),
});

interface ExclusionPolicy {
  readonly excluded: ReadonlySet<string>;
  readonly findings: readonly LaneFinding[];
}

function normalized(value: string): string {
  return value.replaceAll("\\", "/");
}

function isMeaningfulSource(file: string): boolean {
  const normalizedFile = normalized(file);
  const extension = extname(normalizedFile);
  const sourceName = basename(normalizedFile, extension);
  return (
    sourceExtensions.has(extension) &&
    !normalizedFile.endsWith(".d.ts") &&
    !testNamePattern.test(normalizedFile) &&
    !ignoredPathPatterns.some((pattern) => pattern.test(normalizedFile)) &&
    !ignoredBasenames.has(sourceName) &&
    !/\.config\.[cm]?[jt]s$/u.test(normalizedFile) &&
    !/\.types\.[cm]?[jt]s$/u.test(normalizedFile) &&
    !/\.(styles?|css|svg)\.[cm]?[jt]sx?$/u.test(normalizedFile)
  );
}

function sourceCandidates(file: string): readonly string[] {
  const extension = extname(file);
  const withoutExtension = file.slice(0, -extension.length);
  const directory = dirname(file);
  const sourceName = basename(withoutExtension);
  return [
    `${withoutExtension}.test${extension}`,
    `${withoutExtension}.spec${extension}`,
    `${withoutExtension}.test.ts`,
    `${withoutExtension}.test.tsx`,
    `${withoutExtension}.test.js`,
    `${withoutExtension}.test.mjs`,
    join(directory, "__tests__", `${sourceName}.test${extension}`),
    join(directory, "__tests__", `${sourceName}.test.ts`),
    join(directory, "__tests__", `${sourceName}.test.tsx`),
  ].map(normalized);
}

function resolveImportTargets(
  directory: string,
  specifier: string,
  allFiles: ReadonlySet<string>,
): readonly string[] {
  const base = normalized(join(directory, specifier));
  const candidates: string[] = [];
  const extension = extname(base);
  if (sourceExtensions.has(extension)) {
    candidates.push(base);
  }
  const extensionlessBase = [".js", ".jsx", ".mjs", ".cjs"].includes(extension)
    ? base.slice(0, -extension.length)
    : base;
  for (const sourceExtension of sourceExtensions) {
    candidates.push(
      `${extensionlessBase}${sourceExtension}`,
      `${extensionlessBase}/index${sourceExtension}`,
    );
  }
  return candidates.filter((candidate) => allFiles.has(candidate));
}

function importedSpecifiers(content: string): readonly string[] {
  return importPatterns.flatMap((pattern) =>
    [...content.matchAll(pattern)]
      .map((match) => match[1])
      .filter((specifier): specifier is string => specifier !== undefined)
      .filter((specifier) => specifier.startsWith(".")),
  );
}

type TestFileRead =
  | { readonly kind: "loaded"; readonly file: string; readonly content: string }
  | { readonly kind: "failed"; readonly file: string; readonly message: string };

async function readTestFile(repoRoot: string, file: string): Promise<TestFileRead> {
  try {
    return { kind: "loaded", file, content: await readFile(join(repoRoot, file), "utf8") };
  } catch (error: unknown) {
    return {
      kind: "failed",
      file,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testedFiles(
  repoRoot: string,
  files: readonly string[],
  allFiles: ReadonlySet<string>,
): Promise<{ readonly tested: ReadonlySet<string>; readonly error?: string }> {
  const tested = new Set<string>();
  const testFiles = await Promise.all(
    files.filter((file) => testNamePattern.test(file)).map((file) => readTestFile(repoRoot, file)),
  );
  for (const testFile of testFiles) {
    if (testFile.kind === "failed") {
      return {
        tested,
        error: `Could not read test file ${testFile.file}: ${testFile.message}`,
      };
    }
    const directory = dirname(testFile.file);
    for (const specifier of importedSpecifiers(testFile.content)) {
      for (const target of resolveImportTargets(directory, specifier, allFiles)) {
        tested.add(target);
      }
    }
  }
  return { tested };
}

async function existingFiles(
  repoRoot: string,
  files: readonly string[],
): Promise<readonly string[]> {
  const result = await Promise.all(
    files.map(async (file): Promise<string | undefined> => {
      try {
        await access(join(repoRoot, file));
        return file;
      } catch (error: unknown) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
          return undefined;
        }
        throw error;
      }
    }),
  );
  return result.filter((file): file is string => file !== undefined);
}

async function hasNearbyTest(
  repoRoot: string,
  file: string,
  allFiles: ReadonlySet<string>,
  tested: ReadonlySet<string>,
): Promise<boolean> {
  if (tested.has(file)) {
    return true;
  }
  for (const candidate of sourceCandidates(file)) {
    if (allFiles.has(candidate)) {
      return true;
    }
    try {
      // oxlint-disable-next-line no-await-in-loop -- Candidate order preserves the first matching test path and error behavior.
      await access(join(repoRoot, candidate));
      return true;
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        continue;
      }
      throw error;
    }
  }
  return false;
}

async function missingSources(
  repoRoot: string,
  files: readonly string[],
  policy: ExclusionPolicy,
  allFiles: ReadonlySet<string>,
  tested: ReadonlySet<string>,
): Promise<readonly string[]> {
  const sources = files.filter((file) => isMeaningfulSource(file) && !policy.excluded.has(file));
  const results = await Promise.all(
    sources.map(async (file) =>
      (await hasNearbyTest(repoRoot, file, allFiles, tested)) ? undefined : file,
    ),
  );
  return results.filter((file): file is string => file !== undefined);
}

async function loadExclusions(repoRoot: string, path: string): Promise<ExclusionPolicy> {
  let text: string;
  try {
    text = await readFile(join(repoRoot, path), "utf8");
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { excluded: new Set(), findings: [] };
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error: unknown) {
    return {
      excluded: new Set(),
      findings: [
        {
          file: path,
          rule: "invalid-exclusion",
          message: `Test presence exclusions are not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
  const validated = exclusionSchema.safeParse(parsed);
  if (!validated.success) {
    return {
      excluded: new Set(),
      findings: [
        {
          file: path,
          rule: "invalid-exclusion",
          message: `Test presence exclusions are invalid: ${validated.error.message}`,
        },
      ],
    };
  }

  const exclusions = validated.data.exclusions ?? {};
  const findings: LaneFinding[] = [];
  const excluded = new Set<string>();
  for (const [file, reason] of Object.entries(exclusions)) {
    if (reason.trim().length < 16) {
      findings.push({
        file,
        rule: "invalid-exclusion",
        message: "An exclusion needs a meaningful reason of at least 16 characters.",
      });
      continue;
    }
    excluded.add(normalized(file));
  }
  return { excluded, findings };
}

async function runTestPresence(
  context: LaneContext,
  options: TestPresenceOptions,
): Promise<LaneResult> {
  const sourceRoots = options.sourceRoots ?? ["src"];
  const list = await context.exec("git", ["ls-files", ...sourceRoots], {
    cwd: context.repoRoot,
  });
  if (list.failed) {
    return {
      status: "failed",
      findings: [
        {
          file: "git",
          rule: "file-list",
          message: list.stderr || list.stdout || "Could not list source files.",
        },
      ],
    };
  }

  let files: readonly string[];
  try {
    files = await existingFiles(context.repoRoot, [
      ...new Set(
        list.stdout
          .split(/\r?\n/u)
          .map((line) => normalized(line.trim()))
          .filter(Boolean),
      ),
    ]);
  } catch (error: unknown) {
    return {
      status: "failed",
      findings: [
        {
          file: "test-presence",
          rule: "file-list",
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }

  let policy: ExclusionPolicy;
  try {
    policy = await loadExclusions(
      context.repoRoot,
      options.exclusionsPath ?? "gates/test-presence-exclusions.json",
    );
  } catch (error: unknown) {
    return {
      status: "failed",
      findings: [
        {
          file: options.exclusionsPath ?? "gates/test-presence-exclusions.json",
          rule: "exclusions",
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }

  const allFiles = new Set(files);
  const tested = await testedFiles(context.repoRoot, files, allFiles);
  if (tested.error !== undefined) {
    return {
      status: "failed",
      findings: [{ file: "test-presence", rule: "read", message: tested.error }],
    };
  }

  const missing = await missingSources(context.repoRoot, files, policy, allFiles, tested.tested);
  const missingFindings = missing.map((file) => ({
    file,
    rule: "missing-test",
    message:
      "Add a nearby .test/.spec file, import this source from a test, or add a reviewed exclusion.",
  }));
  const findings = [...policy.findings, ...missingFindings];
  return {
    status: findings.length === 0 ? "passed" : "failed",
    metrics: {
      filesChecked: files.filter((file) => isMeaningfulSource(file)).length,
      missingTests: missing.length,
    },
    ...(findings.length === 0 ? {} : { findings }),
  };
}

export function testPresence(options: TestPresenceOptions = {}): GateLane {
  const categories = ["source", "test"] as const;
  return {
    id: "test-presence",
    title: "Test presence",
    categories,
    triggers: categoryTrigger(categories),
    run: (context) => runTestPresence(context, options),
  };
}
