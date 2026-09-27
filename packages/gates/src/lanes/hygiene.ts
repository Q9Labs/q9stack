import { access, readFile, readdir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { z } from "zod";

import type { LaneFinding } from "../core/report.js";
import type { GateLane, LaneContext, LaneResult } from "../core/types.js";
import { alwaysTrigger } from "./trigger.js";

export interface HygieneOptions {
  readonly commitScriptPath?: string;
  readonly configPath?: string;
}

interface PackageJsonData {
  readonly scripts: ReadonlyMap<string, string>;
  readonly workspaces: readonly string[];
}

const scriptsSchema = z.object({}).catchall(z.string());
const packageSchema = z.object({
  scripts: scriptsSchema.optional(),
  workspaces: z
    .union([z.array(z.string()), z.object({ packages: z.array(z.string()) })])
    .optional(),
});

const noOpPattern = /^(?:echo(?:\s+.*)?|true|exit\s+0)$/iu;
const placeholderPattern =
  /\b(?:No linter configured yet|No tests configured yet|TODO: document|generated contract stub)\b/iu;
const forbiddenLanePattern = /^(?:deploy|dev|release|ship)(?:$|[:.-])/iu;
const mutationPattern =
  /(?:--(?:write|fix)\b|\bgit\s+(?:add|commit|push|reset|checkout)\b|\b(?:wrangler|convex)\s+deploy\b|\b(?:terraform|tofu)\s+apply\b|\bfastlane\b)/iu;
const pnpmBuiltIns = new Set([
  "add",
  "create",
  "dlx",
  "exec",
  "install",
  "patch",
  "remove",
  "run",
  "update",
  "why",
]);

function packageData(parsed: unknown, path: string): PackageJsonData {
  const validated = packageSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`Package manifest ${path} is invalid: ${validated.error.message}`);
  }
  const scripts = new Map<string, string>();
  for (const [name, command] of Object.entries(validated.data.scripts ?? {})) {
    scripts.set(name, command);
  }
  const workspaces = validated.data.workspaces;
  return {
    scripts,
    workspaces:
      workspaces === undefined ? [] : Array.isArray(workspaces) ? workspaces : workspaces.packages,
  };
}

async function readPackage(path: string): Promise<PackageJsonData> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error: unknown) {
    throw new Error(
      `Could not read package manifest ${path}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error: unknown) {
    throw new Error(
      `Package manifest ${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  return packageData(parsed, path);
}

async function optionalText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function workspacePatterns(
  root: PackageJsonData,
  pnpmWorkspace: string | undefined,
): readonly string[] {
  if (pnpmWorkspace !== undefined) {
    return pnpmWorkspace
      .split(/\r?\n/u)
      .map((line) => /^\s*-\s*["']?([^"'\s#]+)["']?\s*(?:#.*)?$/u.exec(line)?.[1])
      .filter((pattern): pattern is string => pattern !== undefined);
  }
  return root.workspaces;
}

async function packagePaths(
  repoRoot: string,
  patterns: readonly string[],
): Promise<readonly string[]> {
  const patternPaths = await Promise.all(
    patterns.map((pattern) => packagePathsForPattern(repoRoot, pattern)),
  );
  return [...new Set([resolve(repoRoot, "package.json"), ...patternPaths.flat()])];
}

async function packagePathsForPattern(
  repoRoot: string,
  pattern: string,
): Promise<readonly string[]> {
  if (pattern.endsWith("/*")) {
    return packagePathsForDirectory(resolve(repoRoot, pattern.slice(0, -2)));
  }
  const candidate = resolve(repoRoot, pattern, "package.json");
  return (await existingPackagePath(candidate)) === undefined ? [] : [candidate];
}

async function packagePathsForDirectory(directory: string): Promise<readonly string[]> {
  let entries: readonly string[];
  try {
    entries = await readdir(directory);
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  const paths = await Promise.all(
    entries.map((entry) => packagePathForDirectoryEntry(directory, entry)),
  );
  return paths.filter((path): path is string => path !== undefined);
}

async function packagePathForDirectoryEntry(
  directory: string,
  entry: string,
): Promise<string | undefined> {
  const candidate = join(directory, entry);
  try {
    const metadata = await stat(candidate);
    if (!metadata.isDirectory()) {
      return undefined;
    }
    return existingPackagePath(join(candidate, "package.json"));
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function existingPackagePath(path: string): Promise<string | undefined> {
  try {
    await access(path);
    return path;
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function scriptFindings(
  path: string,
  scripts: ReadonlyMap<string, string>,
): readonly LaneFinding[] {
  const findings: LaneFinding[] = [];
  for (const [name, command] of scripts) {
    const label = `${path} script "${name}"`;
    if (noOpPattern.test(command)) {
      findings.push({
        file: path,
        rule: "placeholder-script",
        message: `${label} is a no-op: ${command}`,
      });
    }
    if (placeholderPattern.test(command)) {
      findings.push({
        file: path,
        rule: "placeholder-script",
        message: `${label} contains placeholder text.`,
      });
    }
    if (command.includes("--passWithNoTests")) {
      findings.push({
        file: path,
        rule: "placeholder-script",
        message: `${label} uses --passWithNoTests.`,
      });
    }
    if (/<NONEXISTENT>/iu.test(command)) {
      findings.push({
        file: path,
        rule: "placeholder-script",
        message: `${label} references <NONEXISTENT>.`,
      });
    }
  }
  return findings;
}

function scriptAliases(text: string): readonly string[] {
  const aliases = new Set<string>();
  for (const match of text.matchAll(/\blanes\.(typecheck|test|build)\s*\(/gu)) {
    const alias = match[1];
    if (alias !== undefined) {
      aliases.add(alias);
    }
  }
  const runPattern =
    /\b(?:pnpm\s+(?:(?:-[A-Za-z]+|--[A-Za-z-]+)\s+\S+\s+)*run|npm\s+run|yarn)\s+([A-Za-z0-9][A-Za-z0-9:_-]*)/gu;
  for (const match of text.matchAll(runPattern)) {
    const alias = match[1];
    if (alias !== undefined) {
      aliases.add(alias);
    }
  }
  const directPattern =
    /\bpnpm\s+(?:(?:-[A-Za-z]+|--[A-Za-z-]+)\s+\S+\s+)*([A-Za-z0-9][A-Za-z0-9:_-]*)/gu;
  for (const match of text.matchAll(directPattern)) {
    const alias = match[1];
    if (alias !== undefined && !pnpmBuiltIns.has(alias)) {
      aliases.add(alias);
    }
  }
  return [...aliases];
}

function gateCommandFindings(path: string, text: string): readonly LaneFinding[] {
  const findings: LaneFinding[] = [];
  for (const alias of scriptAliases(text)) {
    if (forbiddenLanePattern.test(alias)) {
      findings.push({
        file: path,
        rule: "forbidden-lane",
        message: `Gate command references forbidden live lane "${alias}".`,
      });
    }
  }
  if (/\b(?:wrangler|convex)\s+deploy\b|\b(?:terraform|tofu)\s+apply\b|\bfastlane\b/iu.test(text)) {
    findings.push({
      file: path,
      rule: "forbidden-lane",
      message: "Gate commands must not deploy or release live services.",
    });
  }
  if (mutationPattern.test(text)) {
    findings.push({
      file: path,
      rule: "tree-mutation",
      message: "Gate commands must not write, fix, stage, commit, push, reset, or deploy.",
    });
  }
  const lanePattern = /\b(?:id\s*:\s*|lanes\.)["']?([A-Za-z0-9][A-Za-z0-9:_-]*)/gu;
  for (const match of text.matchAll(lanePattern)) {
    const lane = match[1];
    if (lane !== undefined && forbiddenLanePattern.test(lane)) {
      findings.push({
        file: path,
        rule: "forbidden-lane",
        message: `Gate configuration declares forbidden live lane "${lane}".`,
      });
    }
  }
  return findings;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function failedResult(file: string, rule: string, error: unknown): LaneResult {
  return {
    status: "failed",
    findings: [{ file, rule, message: errorMessage(error) }],
  };
}

type HygieneLoad<T> =
  | { readonly kind: "loaded"; readonly value: T }
  | { readonly kind: "failed"; readonly result: LaneResult };

interface RootPackage {
  readonly path: string;
  readonly data: PackageJsonData;
}

async function loadRootPackage(repoRoot: string): Promise<HygieneLoad<RootPackage>> {
  const rootPath = resolve(repoRoot, "package.json");
  try {
    return { kind: "loaded", value: { path: rootPath, data: await readPackage(rootPath) } };
  } catch (error: unknown) {
    return { kind: "failed", result: failedResult("package.json", "manifest", error) };
  }
}

async function loadWorkspaceFile(repoRoot: string): Promise<HygieneLoad<string | undefined>> {
  try {
    return {
      kind: "loaded",
      value: await optionalText(resolve(repoRoot, "pnpm-workspace.yaml")),
    };
  } catch (error: unknown) {
    return {
      kind: "failed",
      result: failedResult("pnpm-workspace.yaml", "workspace", error),
    };
  }
}

async function loadManifestPaths(
  repoRoot: string,
  root: PackageJsonData,
  workspaceFile: string | undefined,
): Promise<HygieneLoad<readonly string[]>> {
  try {
    return {
      kind: "loaded",
      value: await packagePaths(repoRoot, workspacePatterns(root, workspaceFile)),
    };
  } catch (error: unknown) {
    return {
      kind: "failed",
      result: failedResult("pnpm-workspace.yaml", "workspace", error),
    };
  }
}

async function manifestFindings(
  repoRoot: string,
  root: RootPackage,
  manifests: readonly string[],
): Promise<readonly LaneFinding[]> {
  const findings = await Promise.all(
    manifests.map(async (manifest) => {
      try {
        const packageValue = manifest === root.path ? root.data : await readPackage(manifest);
        return scriptFindings(relative(repoRoot, manifest), packageValue.scripts);
      } catch (error: unknown) {
        return [
          {
            file: relative(repoRoot, manifest),
            rule: "manifest",
            message: errorMessage(error),
          },
        ];
      }
    }),
  );
  return findings.flat();
}

function missingScriptFindings(
  path: string,
  text: string,
  root: PackageJsonData,
): readonly LaneFinding[] {
  return scriptAliases(text)
    .filter((alias) => !root.scripts.has(alias))
    .map((alias) => ({
      file: path,
      rule: "missing-script",
      message: `Gate command references missing package script "${alias}".`,
    }));
}

async function gateFileFindings(
  repoRoot: string,
  root: PackageJsonData,
  files: readonly (readonly [string, string])[],
): Promise<readonly LaneFinding[]> {
  const findings = await Promise.all(
    files.map(async ([path, label]) => {
      let text: string | undefined;
      try {
        text = await optionalText(resolve(repoRoot, path));
      } catch (error: unknown) {
        return [
          {
            file: path,
            rule: label,
            message: errorMessage(error),
          },
        ];
      }
      if (text === undefined) {
        return [];
      }
      return [...gateCommandFindings(path, text), ...missingScriptFindings(path, text, root)];
    }),
  );
  return findings.flat();
}

async function runHygiene(context: LaneContext, options: HygieneOptions): Promise<LaneResult> {
  const rootLoad = await loadRootPackage(context.repoRoot);
  if (rootLoad.kind === "failed") {
    return rootLoad.result;
  }
  const workspaceLoad = await loadWorkspaceFile(context.repoRoot);
  if (workspaceLoad.kind === "failed") {
    return workspaceLoad.result;
  }
  const manifestsLoad = await loadManifestPaths(
    context.repoRoot,
    rootLoad.value.data,
    workspaceLoad.value,
  );
  if (manifestsLoad.kind === "failed") {
    return manifestsLoad.result;
  }

  const filesToInspect = [
    [options.commitScriptPath ?? "scripts/gates/commit.sh", "commit"],
    [options.configPath ?? "gate.config.ts", "config"],
  ] as const;
  const findings = [
    ...(await manifestFindings(context.repoRoot, rootLoad.value, manifestsLoad.value)),
    ...(await gateFileFindings(context.repoRoot, rootLoad.value.data, filesToInspect)),
  ];

  return {
    status: findings.length === 0 ? "passed" : "failed",
    metrics: { filesChecked: manifestsLoad.value.length },
    ...(findings.length === 0 ? {} : { findings }),
  };
}

export function hygiene(options: HygieneOptions = {}): GateLane {
  return {
    id: "hygiene",
    title: "Gate and script hygiene",
    triggers: alwaysTrigger,
    run: (context) => runHygiene(context, options),
  };
}
