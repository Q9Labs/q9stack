import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { cac } from "cac";
import prompts from "prompts";

import { scaffoldProject, type ScaffoldProjectOptions } from "./adapters/scaffold.js";
import type { LicenseKind } from "./core/license.js";
import type { TemplateVariant } from "./core/plan.js";

interface CliOptions {
  readonly convex?: boolean;
  readonly postgres?: boolean;
  readonly dir?: string;
  readonly license?: string;
  readonly product?: string;
  readonly noInstall?: boolean;
  readonly noGit?: boolean;
  readonly install?: boolean;
  readonly git?: boolean;
  readonly linkLocal?: string;
  readonly pm?: string;
}

class CliInputError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CliInputError";
  }
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

function requireSlug(value: string): string {
  const slug = slugify(value);
  if (slug.length === 0 || slug === "." || slug === "..") {
    throw new CliInputError(`Invalid app name: ${value}`);
  }

  return slug;
}

function parseLicense(value: string | undefined): LicenseKind {
  const license = value ?? "proprietary";
  if (license === "mit" || license === "proprietary") {
    return license;
  }

  throw new CliInputError(`Unsupported license: ${license}. Use mit or proprietary.`);
}

function selectVariant(options: CliOptions): TemplateVariant | undefined {
  if (options.convex === true && options.postgres === true) {
    throw new CliInputError("Choose only one of --convex or --postgres.");
  }

  if (options.convex === true) {
    return "with-convex";
  }

  if (options.postgres === true) {
    return "without-convex";
  }

  return undefined;
}

async function promptAppName(): Promise<string> {
  const answer = await prompts({
    message: "What is the app name?",
    name: "value",
    type: "text",
  });
  if (typeof answer.value !== "string" || answer.value.trim().length === 0) {
    throw new CliInputError("An app name is required.");
  }

  return answer.value.trim();
}

async function promptVariant(): Promise<TemplateVariant> {
  const answer = await prompts({
    choices: [
      { title: "Convex", value: "with-convex" },
      { title: "Postgres", value: "without-convex" },
    ],
    message: "Choose a data variant",
    name: "value",
    type: "select",
  });
  if (answer.value === "with-convex") {
    return "with-convex";
  }

  if (answer.value === "without-convex") {
    return "without-convex";
  }

  throw new CliInputError("A data variant is required.");
}

function templateRoot(): string {
  return fileURLToPath(new URL("../templates", import.meta.url));
}

function printNextSteps(targetDirectory: string): void {
  process.stdout.write(
    `\nCreated ${targetDirectory}\n\nNext steps:\n  cd ${JSON.stringify(targetDirectory)}\n  pnpm dev\n  pnpm gate:full\n  cd infra/stacks/dev && tofu init\n`,
  );
}

function requireSupportedPackageManager(packageManager: string | undefined): void {
  if ((packageManager ?? "pnpm") !== "pnpm") {
    throw new CliInputError("Only pnpm is supported by create-q9stack.");
  }
}

export function buildScaffoldOptions(
  appName: string,
  appSlug: string,
  variant: TemplateVariant,
  options: CliOptions,
): ScaffoldProjectOptions {
  const productValue = options.product?.trim();
  const product = productValue === undefined || productValue.length === 0 ? appSlug : productValue;
  const parentDirectory = options.dir ?? process.cwd();
  const linkLocal = options.linkLocal;

  return {
    appName,
    appSlug,
    license: parseLicense(options.license),
    noGit: options.noGit === true || options.git === false,
    noInstall: options.noInstall === true || options.install === false,
    product,
    targetDirectory: resolve(parentDirectory, appSlug),
    templateRoot: templateRoot(),
    variant,
    year: String(new Date().getFullYear()),
    ...(linkLocal === undefined ? {} : { linkLocal: resolve(linkLocal) }),
  };
}

async function runCreateCommand(name: string | undefined, options: CliOptions): Promise<void> {
  const appName = name ?? (await promptAppName());
  const appSlug = requireSlug(appName);
  const variant = selectVariant(options) ?? (await promptVariant());
  requireSupportedPackageManager(options.pm);

  const scaffoldOptions = buildScaffoldOptions(appName, appSlug, variant, options);
  await scaffoldProject(scaffoldOptions);
  printNextSteps(scaffoldOptions.targetDirectory);
}

export async function runCli(argv: readonly string[]): Promise<void> {
  const cli = cac("create-q9stack");
  let completion: Promise<void> | undefined;

  function startCreateCommand(name: string | undefined, options: CliOptions): Promise<void> {
    completion = runCreateCommand(name, options);
    return completion;
  }

  cli
    .command("[name]", "Create a q9stack application")
    .option("--convex", "Use the Convex template")
    .option("--postgres", "Use the Postgres template")
    .option("--dir <parent>", "Parent directory", { default: process.cwd() })
    .option("--license <license>", "License: mit or proprietary", { default: "proprietary" })
    .option("--product <value>", "Product data-theme value")
    .option("--no-install", "Skip pnpm install")
    .option("--no-git", "Skip git initialization")
    .option("--link-local <path>", "Link @q9labsai packages to a local q9stack checkout")
    .option("--pm <pm>", "Package manager (pnpm only)", { default: "pnpm" })
    .action(startCreateCommand);

  cli.help();
  cli.version("0.3.0");
  cli.parse(["node", "create-q9stack", ...argv]);
  if (
    argv.includes("--help") ||
    argv.includes("-h") ||
    argv.includes("--version") ||
    argv.includes("-v")
  ) {
    return;
  }

  if (completion === undefined) {
    throw new CliInputError("A command is required.");
  }

  await completion;
}

export const main = runCli;
