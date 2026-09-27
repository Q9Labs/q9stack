#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

import cac from "cac";

import { loadGateConfig } from "./adapters/config-loader.js";
import { executeCommand } from "./adapters/process.js";
import { writeErrorLine } from "./adapters/terminal.js";
import { acceptBaselineCommand } from "./commands/accept-baseline.js";
import { doctorCommand } from "./commands/doctor.js";
import { initCommand } from "./commands/init.js";
import { runCommand } from "./commands/run.js";
import { whyCommand } from "./commands/why.js";
import { GatePlanningError } from "./core/plan.js";

interface ConfigOption {
  readonly config?: string;
}

interface RunCliOptions extends ConfigOption {
  readonly staged?: boolean;
  readonly base?: string;
  readonly full?: boolean;
  readonly lane?: string | readonly string[];
  readonly concurrency?: string;
  readonly json?: boolean;
  readonly paranoid?: boolean;
}

interface InitCliOptions {
  readonly force?: boolean;
}

interface AcceptCliOptions extends ConfigOption {
  readonly message?: string;
}

function laneIds(value: RunCliOptions["lane"]): readonly string[] {
  if (value === undefined) {
    return [];
  }
  return typeof value === "string" ? [value] : value;
}

function concurrency(value: string | undefined): number | `${number}%` | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value.endsWith("%")) {
    if (!/^\d+%$/u.test(value)) {
      throw new Error(`Invalid concurrency value: ${value}`);
    }
    return `${Number.parseInt(value.slice(0, -1), 10)}%`;
  }
  const parsed = Number.parseInt(value, 10);
  if (!/^\d+$/u.test(value) || parsed < 1) {
    throw new Error(`Invalid concurrency value: ${value}`);
  }
  return parsed;
}

export async function runCli(argv: readonly string[] = process.argv): Promise<number> {
  const cli = cac("q9gate");
  let exitCode = 0;

  cli
    .command("run", "Plan and run the contextual gate")
    .option("--staged", "Use staged files (the default)")
    .option("--base <ref>", "Use changes since a Git base ref")
    .option("--full", "Run every configured lane")
    .option("--lane <id>", "Run a lane explicitly; may be repeated")
    .option("--concurrency <number-or-percent>", "Override worker concurrency")
    .option("--json", "Also print gate.report.json")
    .option("--paranoid", "Fail a lane that mutates the worktree")
    .option("--config <path>", "Gate config path", { default: "gate.config.ts" })
    .action(async (options: RunCliOptions) => {
      const repoRoot = process.cwd();
      const config = await loadGateConfig(repoRoot, options.config);
      const requestedConcurrency = concurrency(options.concurrency);
      exitCode = await runCommand({
        repoRoot,
        config,
        exec: executeCommand,
        staged: options.staged ?? false,
        full: options.full ?? false,
        lanes: laneIds(options.lane),
        json: options.json ?? false,
        paranoid: options.paranoid ?? false,
        ...(options.base === undefined ? {} : { base: options.base }),
        ...(requestedConcurrency === undefined ? {} : { concurrency: requestedConcurrency }),
      });
    });

  cli
    .command("init", "Write project-owned gate configuration and baseline seeds")
    .option("--force", "Overwrite existing generated files")
    .action(async (options: InitCliOptions) => {
      exitCode = await initCommand(process.cwd(), options.force ?? false);
    });

  cli
    .command("doctor", "Check gate wiring, tools, and baselines")
    .option("--config <path>", "Gate config path", { default: "gate.config.ts" })
    .action(async (options: ConfigOption) => {
      const repoRoot = process.cwd();
      const config = await loadGateConfig(repoRoot, options.config);
      exitCode = await doctorCommand(repoRoot, config, executeCommand);
    });

  cli
    .command("why <file>", "Explain which lanes a file triggers")
    .option("--config <path>", "Gate config path", { default: "gate.config.ts" })
    .action(async (file: string, options: ConfigOption) => {
      const config = await loadGateConfig(process.cwd(), options.config);
      exitCode = whyCommand(config, file);
    });

  cli
    .command("accept-baseline <lane>", "Record why a lane baseline was accepted")
    .option("--message <why>", "Required acceptance reason")
    .option("--config <path>", "Gate config path", { default: "gate.config.ts" })
    .action(async (lane: string, options: AcceptCliOptions) => {
      if (options.message === undefined || options.message.trim().length === 0) {
        throw new Error("accept-baseline requires --message <why>.");
      }
      const repoRoot = process.cwd();
      const config = await loadGateConfig(repoRoot, options.config);
      exitCode = await acceptBaselineCommand(repoRoot, config, lane, options.message.trim());
    });

  cli.help();
  cli.version("0.1.0");
  cli.parse([...argv], { run: false });
  await cli.runMatchedCommand();
  return exitCode;
}

async function main(): Promise<void> {
  try {
    process.exitCode = await runCli();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const prefix = error instanceof GatePlanningError ? "Gate plan error" : "q9gate failed";
    writeErrorLine(`${prefix}: ${message}`);
    process.exitCode = error instanceof GatePlanningError ? 2 : 1;
  }
}

// Bin shims reach this file through node_modules symlinks while import.meta.url is the real path.
const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(realpathSync(entry)).href) {
  void main();
}
