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
  throw new Error("Could not resolve a base ref. Pass --base <ref> or use --full.");
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
    const output = await successfulOutput(
      exec,
      "git",
      ["diff", "--cached", "--name-only", "--diff-filter=ACMRD"],
      repoRoot,
    );
    return outputLines(output);
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
