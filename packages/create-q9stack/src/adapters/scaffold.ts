import { spawn } from "node:child_process";
import { access, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { createScaffoldPlan, type ScaffoldPlan, type ScaffoldPlanOptions } from "../core/plan.js";
import { readTemplateDirectory, writeFileMap } from "./filesystem.js";

export interface ScaffoldProjectOptions extends ScaffoldPlanOptions {
  readonly templateRoot: string;
  readonly targetDirectory: string;
  readonly noGit?: boolean;
  readonly noInstall?: boolean;
}

export interface ScaffoldProjectResult {
  readonly targetDirectory: string;
  readonly plan: ScaffoldPlan;
}

export class ScaffoldProjectError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ScaffoldProjectError";
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new ScaffoldProjectError(`Unable to inspect ${path}: ${message}`);
  }
}

function runProcess(command: string, args: readonly string[], cwd: string): Promise<void> {
  return new Promise((resolveProcess, rejectProcess) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.once("error", (error) => {
      rejectProcess(new ScaffoldProjectError(`Unable to run ${command}: ${error.message}`));
    });
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolveProcess();
        return;
      }

      const reason = signal === null ? `exit code ${code ?? "unknown"}` : `signal ${signal}`;
      rejectProcess(new ScaffoldProjectError(`${command} failed with ${reason}`));
    });
  });
}

async function loadScaffoldPlan(options: ScaffoldProjectOptions): Promise<ScaffoldPlan> {
  const baseDirectory = resolve(options.templateRoot, "base");
  const variantDirectory = resolve(options.templateRoot, options.variant);
  const [base, overlay] = await Promise.all([
    readTemplateDirectory(baseDirectory),
    readTemplateDirectory(variantDirectory),
  ]);
  return createScaffoldPlan(base, overlay, options);
}

async function initializeGit(targetDirectory: string): Promise<void> {
  await runProcess("git", ["init"], targetDirectory);
  await runProcess("git", ["add", "--all"], targetDirectory);
  await runProcess("git", ["commit", "-m", "chore: initialize q9stack app"], targetDirectory);
}

async function runScaffoldCommands(
  targetDirectory: string,
  options: ScaffoldProjectOptions,
): Promise<void> {
  if (options.noGit !== true) {
    await initializeGit(targetDirectory);
  }

  if (options.noInstall !== true) {
    await runProcess("pnpm", ["install"], targetDirectory);
    // Token substitution changes import and package-key sort order for real
    // app slugs, so a byte-formatted template can scaffold into unformatted
    // files. Re-format with the project's own toolchain once it exists.
    await runProcess("pnpm", ["exec", "oxfmt"], targetDirectory);
    await runProcess("pnpm", ["run", "i18n:extract"], targetDirectory);
    if (options.noGit !== true) {
      // Fold the lockfile and other install artifacts into the initial commit
      // so generated-drift lanes start from a clean tree. Hooks stay off: the
      // gate binary is only installed by this very step.
      await runProcess("git", ["add", "--all"], targetDirectory);
      await runProcess("git", ["commit", "--amend", "--no-edit", "--no-verify"], targetDirectory);
    }
  }
}

async function removeFailedScaffold(targetDirectory: string, error: unknown): Promise<never> {
  try {
    await rm(targetDirectory, { force: true, recursive: true });
  } catch (cleanupError) {
    const message = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
    throw new ScaffoldProjectError(
      `${error instanceof Error ? error.message : String(error)}; cleanup failed: ${message}`,
    );
  }

  throw error;
}

export async function scaffoldProject(
  options: ScaffoldProjectOptions,
): Promise<ScaffoldProjectResult> {
  const targetDirectory = resolve(options.targetDirectory);
  if (await pathExists(targetDirectory)) {
    throw new ScaffoldProjectError(`Target directory already exists: ${targetDirectory}`);
  }

  const plan = await loadScaffoldPlan(options);

  try {
    await writeFileMap(targetDirectory, plan.files);
    await runScaffoldCommands(targetDirectory, options);
  } catch (error) {
    return removeFailedScaffold(targetDirectory, error);
  }

  return { targetDirectory, plan };
}
