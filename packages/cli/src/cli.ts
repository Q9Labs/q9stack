#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import cac from "cac";

import packageJson from "../package.json" with { type: "json" };
import {
  addEntry,
  exportWhatsNew,
  parseChangelog,
  release,
  entryTypes,
  type EntryType,
} from "./changelog.js";
import {
  followDevLog,
  readDevLog,
  repoRoot,
  resetDev,
  startDev,
  statusDev,
  stopDev,
} from "./dev.js";
import { DiagError, runDiag } from "./diag.js";
import { listOutcomes, readTracker, showOutcome, type Outcome } from "./tracker.js";

type JsonOption = { json?: boolean };
type TrackerCheckOption = JsonOption & { file?: string };
type TrackerListOption = JsonOption & { state?: string; area?: string; priority?: string };
type DevStartOption = JsonOption & { name?: string };
type DevLogOption = DevStartOption & { tail?: string; follow?: boolean };
type ChangelogAddOption = JsonOption & { type?: string; title?: string; body?: string };
type ChangelogReleaseOption = JsonOption & { date?: string };
type ChangelogExportOption = JsonOption & { out?: string };

function entryType(value: string | undefined): EntryType | undefined {
  return entryTypes.find((candidate) => candidate === value);
}

function output(json: boolean | undefined, value: unknown, plain: string): void {
  process.stdout.write(
    json ? JSON.stringify(value, null, 2) + "\n" : plain + (plain.endsWith("\n") ? "" : "\n"),
  );
}

// Legacy tracker rendering predates diagnostics; keep its presentation stable in this lane.
// fallow-ignore-next-line complexity
function describeOutcome(item: Outcome): string {
  const lines = [
    item.id + " — " + item.title,
    "State: " + item.state,
    "Area: " + item.area,
    "Priority: " + (item.priority ?? "—"),
    "Size: " + (item.size ?? "—"),
    "Summary: " + item.summary,
    "Remaining work:",
    ...(item.remaining?.map((part) => "- " + part) ?? ["- None"]),
    "Code paths:",
    ...item.code.map((part) => "- " + part),
    "Evidence:",
  ];
  for (const evidence of item.evidence ?? []) {
    lines.push(
      "- " +
        evidence.kind +
        (evidence.scope ? " (" + evidence.scope + ")" : "") +
        ": " +
        (evidence.detail ?? evidence.from?.join(", ") ?? ""),
    );
    for (const field of ["artifact", "revision", "environment", "date", "result"] as const) {
      if (evidence[field]) lines.push("  " + field + ": " + evidence[field]);
    }
  }
  if (!item.evidence?.length) lines.push("- None");
  if (item.uncertainty) lines.push("Uncertainty: " + item.uncertainty);
  if (item.blocked_by) lines.push("Blocked by: " + item.blocked_by);
  return lines.join("\n");
}

async function readChangelog(root: string, createIfMissing = false): Promise<string> {
  const file = path.join(root, "CHANGELOG.md");
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (createIfMissing && error instanceof Error && "code" in error && error.code === "ENOENT")
      return "# Changelog\n\n## [Unreleased]\n";
    throw new Error(file + ": " + String(error), { cause: error });
  }
}

// Existing command registrations make this dispatcher broad; split them in a dedicated CLI refactor.
// fallow-ignore-next-line complexity
export async function runCli(argv: readonly string[] = process.argv): Promise<number> {
  const cli = cac("q9");
  const root = repoRoot(process.cwd());
  if (argv[2] === "diag") {
    if (argv[3] === "--help" || argv[3] === "-h" || argv.length === 3) {
      process.stdout.write(
        "q9 diag trace <code> [--prod | --deployment <name>] [--json] [--no-logs] [--otlp [endpoint]]\nq9 diag check [--prod | --deployment <name>] [--json]\n\nConfigure diag in q9.config.json. Default target is development. OTLP defaults to http://localhost:4318; non-loopback endpoints require diag.otlp.allowedEndpoints.\n",
      );
      return 0;
    }
    try {
      return await runDiag(root, argv.slice(3));
    } catch (error) {
      if (error instanceof DiagError) {
        if (argv.includes("--json"))
          process.stdout.write(JSON.stringify({ error: error.message }) + "\n");
        else process.stderr.write("q9: " + error.message + "\n");
        return error.exitCode;
      }
      if (argv.includes("--json"))
        process.stdout.write(
          JSON.stringify({ error: "Diagnostic output failed validation." }) + "\n",
        );
      else process.stderr.write("q9: Diagnostic output failed validation.\n");
      return 4;
    }
  }
  let devCommandTail: string[] = [];
  cli.command("diag", "Retrieve a diagnostic trace or check adapter access");
  cli
    .command("tracker check", "Validate tracker.yaml")
    .option("--file <path>", "Tracker file", { default: "tracker.yaml" })
    .option("--json", "JSON output")
    .action(async (options: TrackerCheckOption) => {
      const tracker = await readTracker(root, options.file);
      output(
        options.json,
        { valid: true, file: options.file, outcomes: tracker.outcomes.length },
        (options.file ?? "tracker.yaml") + ": valid (" + tracker.outcomes.length + " outcomes)",
      );
    });
  cli
    .command("tracker list", "List tracker outcomes")
    .option("--state <state>", "State")
    .option("--area <area>", "Area")
    .option("--priority <priority>", "Priority")
    .option("--json", "JSON output")
    .action(async (options: TrackerListOption) => {
      const items = listOutcomes(await readTracker(root), options);
      output(
        options.json,
        items,
        items
          .map((item) =>
            [item.id, item.state, item.priority ?? "—", item.size ?? "—", item.title].join("  "),
          )
          .join("\n"),
      );
    });
  cli
    .command("tracker show <id>", "Show one outcome")
    .option("--json", "JSON output")
    .action(async (id: string, options: JsonOption) => {
      const item = showOutcome(await readTracker(root), id);
      output(options.json, item, describeOutcome(item));
    });
  cli
    .command("dev start [...command]", "Start a detached dev command")
    .option("--name <name>", "Process name", { default: "dev" })
    .option("--json", "JSON output")
    .allowUnknownOptions()
    .action(async (command: string[], options: DevStartOption) => {
      const record = await startDev(
        root,
        options.name ?? "dev",
        devCommandTail.length ? devCommandTail : command,
      );
      output(
        options.json,
        { name: options.name ?? "dev", ...record },
        "Started " + (options.name ?? "dev") + " (pid " + record.pid + "); log: " + record.logPath,
      );
    });
  cli
    .command("dev status", "Show recorded dev processes")
    .option("--json", "JSON output")
    .action(async (options: JsonOption) => {
      const records = await statusDev(root);
      output(
        options.json,
        records,
        records.length
          ? records
              .map(
                (record) =>
                  record.name +
                  "  pid=" +
                  record.process.pid +
                  "  " +
                  (record.alive ? "alive" : "dead") +
                  "  uptime=" +
                  record.uptime +
                  "s" +
                  (record.ports?.length ? "  ports=" + record.ports.join(",") : ""),
              )
              .join("\n")
          : "No recorded dev processes",
      );
    });
  cli
    .command("dev logs", "Read a dev log")
    .option("--name <name>", "Process name", { default: "dev" })
    .option("--tail <lines>", "Lines to show", { default: "50" })
    .option("--follow", "Follow the log")
    .option("--json", "JSON output")
    // Existing follow/JSON combinations are unchanged by diagnostics.
    // fallow-ignore-next-line complexity
    .action(async (options: DevLogOption) => {
      const tail = Number(options.tail);
      const content = await readDevLog(root, options.name ?? "dev", tail);
      if (options.follow && options.json)
        process.stdout.write(JSON.stringify({ name: options.name ?? "dev", log: content }) + "\n");
      else output(options.json, { name: options.name ?? "dev", log: content }, content);
      if (options.follow) await followDevLog(root, options.name ?? "dev", Boolean(options.json));
    });
  cli
    .command("dev stop", "Stop a recorded dev process")
    .option("--name <name>", "Process name", { default: "dev" })
    .option("--json", "JSON output")
    .action(async (options: DevStartOption) => {
      const stopped = await stopDev(root, options.name ?? "dev");
      output(options.json, { stopped }, "Stopped " + stopped.join(", "));
    });
  cli
    .command("dev reset", "Stop all and run dev:reset:hook if present")
    .option("--json", "JSON output")
    .action(async (options: JsonOption) => {
      const result = await resetDev(root, Boolean(options.json));
      output(
        options.json,
        result,
        "Stopped " +
          result.stopped.length +
          " process(es)" +
          (result.hook ? "; ran dev:reset:hook" : ""),
      );
    });
  cli
    .command("changelog add", "Add an Unreleased entry")
    .option("--type <type>", "Entry type")
    .option("--title <title>", "Short title")
    .option("--body <body>", "Description")
    .option("--json", "JSON output")
    .action(async (options: ChangelogAddOption) => {
      const type = entryType(options.type);
      if (!type || !options.title || !options.body)
        throw new Error(
          "CHANGELOG.md: --type, --title and --body are required; type must be " +
            entryTypes.join(", "),
        );
      const file = path.join(root, "CHANGELOG.md");
      const entry = { type, title: options.title, body: options.body };
      await writeFile(file, addEntry(await readChangelog(root, true), entry));
      output(options.json, entry, "Added " + entry.type + ": " + entry.title + " to " + file);
    });
  cli
    .command("changelog release <version>", "Release Unreleased entries")
    .option("--date <date>", "YYYY-MM-DD")
    .option("--json", "JSON output")
    .action(async (version: string, options: ChangelogReleaseOption) => {
      const file = path.join(root, "CHANGELOG.md");
      const date = options.date ?? new Date().toISOString().slice(0, 10);
      await writeFile(file, release(await readChangelog(root), version, date));
      output(
        options.json,
        { version, date },
        "Released " + version + " on " + date + " in " + file,
      );
    });
  cli
    .command("changelog check", "Validate CHANGELOG.md")
    .option("--json", "JSON output")
    .action(async (options: JsonOption) => {
      const changelog = parseChangelog(await readChangelog(root));
      output(
        options.json,
        { valid: true, releases: changelog.releases.length },
        "CHANGELOG.md: valid (" + changelog.releases.length + " releases)",
      );
    });
  cli
    .command("changelog export", "Write changelog.json")
    .option("--out <path>", "Output file")
    .option("--json", "JSON output")
    .action(async (options: ChangelogExportOption) => {
      if (!options.out) throw new Error("CHANGELOG.md: --out <path> is required");
      const file = path.resolve(root, options.out);
      const result = exportWhatsNew(await readChangelog(root));
      await writeFile(file, JSON.stringify(result, null, 2) + "\n");
      output(
        options.json,
        { file, releases: result.releases.length },
        "Wrote " + file + " (" + result.releases.length + " releases)",
      );
    });
  cli.help();
  cli.version(packageJson.version);
  const parsedArgv = [...argv];
  if (
    ["tracker", "dev", "changelog"].includes(parsedArgv[2] ?? "") &&
    parsedArgv[3] &&
    !parsedArgv[3].startsWith("-")
  ) {
    parsedArgv.splice(2, 2, parsedArgv[2] + " " + parsedArgv[3]);
  }
  if (parsedArgv[2] === "dev start") {
    const separator = parsedArgv.indexOf("--", 3);
    if (separator >= 0) devCommandTail = parsedArgv.splice(separator + 1);
  }
  cli.parse(parsedArgv, { run: false });
  await cli.runMatchedCommand();
  return 0;
}

async function main(): Promise<void> {
  try {
    process.exitCode = await runCli();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (process.argv.includes("--json"))
      process.stdout.write(JSON.stringify({ error: message }) + "\n");
    else process.stderr.write("q9: " + message + "\n");
    process.exitCode = 1;
  }
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(realpathSync(entry)).href) void main();
