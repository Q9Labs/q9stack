import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { pathExists } from "./filesystem.js";

const projectFiles = [
  "gate.config.ts",
  ".semgrep/project.yml",
  "gates/baselines/README.md",
  "gates/test-presence-exclusions.json",
  "osv-baseline.json",
  "cspell-baseline.txt",
] as const;

async function templateRoot(): Promise<string> {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [resolve(here, "../templates"), resolve(here, "../../templates")];
  const matches = await Promise.all(
    candidates.map(async (candidate) => ({
      candidate,
      exists: await pathExists(resolve(candidate, "gate.config.ts")),
    })),
  );
  const match = matches.find((candidate) => candidate.exists);
  if (match !== undefined) {
    return match.candidate;
  }
  throw new Error("Could not locate the @q9labsai/gates templates directory.");
}

export interface InitResult {
  readonly written: readonly string[];
  readonly lefthookSnippet?: string;
}

export async function installTemplates(repoRoot: string, force: boolean): Promise<InitResult> {
  const sourceRoot = await templateRoot();
  const existing = force
    ? []
    : await Promise.all(
        projectFiles.map(async (relative) => ({
          relative,
          exists: await pathExists(resolve(repoRoot, relative)),
        })),
      );
  const conflicts = existing.filter((entry) => entry.exists).map((entry) => entry.relative);
  if (conflicts.length > 0) {
    throw new Error(
      `Refusing to overwrite existing files: ${conflicts.join(", ")}. Re-run with --force.`,
    );
  }

  await Promise.all(
    projectFiles.map(async (relative) => {
      const destination = resolve(repoRoot, relative);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(resolve(sourceRoot, relative), destination);
    }),
  );
  const written: string[] = [...projectFiles];

  const lefthookPath = resolve(repoRoot, "lefthook.yml");
  if (await pathExists(lefthookPath)) {
    const lefthookSnippet = await readFile(resolve(sourceRoot, "lefthook.yml"), "utf8");
    return { written, lefthookSnippet };
  }
  await copyFile(resolve(sourceRoot, "lefthook.yml"), lefthookPath);
  written.push("lefthook.yml");
  return { written };
}
