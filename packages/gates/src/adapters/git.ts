import { stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { canonicalRepoRelativePath } from "../core/repo-path.js";
import type { GateExec, GateScope } from "../core/types.js";

function outputLines(output: string): readonly string[] {
  return output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function successfulOutput(
  exec: GateExec,
  command: string,
  args: readonly string[],
  cwd: string,
): Promise<string> {
  const result = await exec(command, args, { cwd });
  if (result.failed) {
    throw new Error(
      `Command failed while reading Git state: ${result.command}\n${result.stderr || result.stdout}`,
    );
  }
  return result.stdout.trim();
}

export async function resolveDefaultBase(exec: GateExec, repoRoot: string): Promise<string> {
  const base = await optionalDefaultBase(exec, repoRoot);
  if (base !== undefined) {
    return base;
  }
  throw new Error("Could not resolve a base ref. Pass --base <ref> or use --full.");
}

export async function optionalDefaultBase(
  exec: GateExec,
  repoRoot: string,
): Promise<string | undefined> {
  const refs = ["origin/HEAD", "origin/main", "origin/master", "main", "master"];
  for (const ref of refs) {
    // oxlint-disable-next-line no-await-in-loop -- Ref priority is significant and probing stops at the first valid base.
    const verified = await exec("git", ["rev-parse", "--verify", "--quiet", ref], {
      cwd: repoRoot,
    });
    if (!verified.failed) {
      return ref;
    }
  }
  return undefined;
}

export async function changedFiles(
  exec: GateExec,
  repoRoot: string,
  scope: GateScope,
  base?: string,
): Promise<readonly string[]> {
  if (scope === "full") {
    const output = await successfulOutput(
      exec,
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard"],
      repoRoot,
    );
    return outputLines(output);
  }
  if (scope === "staged") {
    const staged = await successfulOutput(
      exec,
      "git",
      ["diff", "--cached", "--name-only", "--diff-filter=ACMRD"],
      repoRoot,
    );
    if (base === undefined) {
      return outputLines(staged);
    }
    const branch = await successfulOutput(
      exec,
      "git",
      ["diff", "--name-only", "--diff-filter=ACMRD", `${base}...HEAD`],
      repoRoot,
    );
    return [...new Set([...outputLines(branch), ...outputLines(staged)])];
  }
  if (base === undefined) {
    throw new Error("Branch scope requires a base ref.");
  }
  const output = await successfulOutput(
    exec,
    "git",
    ["diff", "--name-only", "--diff-filter=ACMRD", `${base}...HEAD`],
    repoRoot,
  );
  return outputLines(output);
}

function normalizeExplicitPath(input: string): string {
  const normalized = canonicalRepoRelativePath(input);
  if (normalized === undefined) {
    throw new Error(`Explicit file path must be a canonical repo-relative path: "${input}".`);
  }
  return normalized;
}

function isMissingPath(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && ["ENOENT", "ENOTDIR"].includes(String(error.code))
  );
}

async function existsInWorktree(repoRoot: string, file: string): Promise<boolean> {
  const root = resolve(repoRoot);
  const path = resolve(root, ...file.split("/"));
  const fromRoot = relative(root, path);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    return false;
  }
  try {
    return (await stat(path)).isFile();
  } catch (error: unknown) {
    if (isMissingPath(error)) {
      return false;
    }
    throw new Error(`Could not validate explicit file "${file}": ${String(error)}`, {
      cause: error,
    });
  }
}

export async function validateExplicitFiles(
  exec: GateExec,
  repoRoot: string,
  files: readonly string[],
  base?: string,
  requireBase = true,
): Promise<readonly string[]> {
  if (files.length === 0) {
    throw new Error("An explicit file list must contain at least one path.");
  }

  const normalizedFiles = [...new Set(files.map(normalizeExplicitPath))];
  let baseTreePromise: Promise<string | null> | undefined;
  const baseTree = async (): Promise<string | null> => {
    if (base === undefined) {
      return null;
    }
    const resolvedBase = base;
    baseTreePromise ??= (async () => {
      const mergeBase = await exec("git", ["merge-base", resolvedBase, "HEAD"], {
        cwd: repoRoot,
      });
      if (mergeBase.failed) {
        throw new Error(
          `Could not resolve diff base "${resolvedBase}" while validating explicit files.`,
        );
      }
      const tree = await exec(
        "git",
        ["rev-parse", "--verify", "--quiet", `${mergeBase.stdout.trim()}^{tree}`],
        { cwd: repoRoot },
      );
      if (tree.failed) {
        throw new Error(
          `Could not resolve diff base "${resolvedBase}" while validating explicit files.`,
        );
      }
      return tree.stdout.trim();
    })();
    return baseTreePromise;
  };
  if (base !== undefined && requireBase) {
    await baseTree();
  }

  const exists = await Promise.all(
    normalizedFiles.map(async (file) => {
      if (await existsInWorktree(repoRoot, file)) {
        return true;
      }
      const tree = await baseTree();
      if (tree === null) {
        return false;
      }
      const result = await exec("git", ["cat-file", "-t", `${tree}:${file}`], {
        cwd: repoRoot,
      });
      return !result.failed && result.stdout.trim() === "blob";
    }),
  );
  const missing = normalizedFiles.filter((_, index) => !exists[index]);
  if (missing.length > 0) {
    const source = base === undefined ? "the repository" : `the repository or diff base "${base}"`;
    throw new Error(
      `Explicit file(s) ${missing.map((file) => `"${file}"`).join(", ")} do not exist as files in ${source}.`,
    );
  }
  return normalizedFiles;
}

export async function gitRef(exec: GateExec, repoRoot: string): Promise<string> {
  return successfulOutput(exec, "git", ["rev-parse", "--short", "HEAD"], repoRoot);
}

export async function gitStatus(exec: GateExec, repoRoot: string): Promise<readonly string[]> {
  const output = await successfulOutput(
    exec,
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    repoRoot,
  );
  return outputLines(output);
}
