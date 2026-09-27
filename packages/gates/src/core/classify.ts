import { basename, extname, matchesGlob } from "node:path";

import {
  gateCategories,
  type Classification,
  type ClassifiedCategory,
  type ClassifierConfig,
  type GateCategory,
} from "./types.js";

const defaults: Required<ClassifierConfig> = {
  source: [".ts", ".tsx", ".mjs", ".cjs", ".js", ".jsx"],
  test: ["*.test.*", "*.spec.*", "**/__tests__/**"],
  docs: ["scratchpad/", "*.md", "*.mdx", "*.txt"],
  dependency: ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"],
  gateDefinition: [
    "gate.config.ts",
    "lefthook.yml",
    "turbo.json",
    ".github/workflows/",
    "scripts/gates/",
  ],
  infra: ["infra/"],
  contract: ["packages/contracts/", "convex/schema.ts"],
  workflow: [".github/workflows/"],
  shell: ["*.sh"],
  sql: ["**/migrations/**/*.sql"],
  env: [".env.example", "wrangler.json", "wrangler.jsonc", "wrangler.toml", "**/outputs.tf"],
  ui: ["apps/**/*.tsx"],
};

export class ClassificationError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`Invalid changed path "${path}": ${message}`);
    this.name = "ClassificationError";
    this.path = path;
  }
}

function normalizePath(input: string): string {
  const normalized = input.replaceAll("\\", "/");
  if (normalized.length === 0) {
    throw new ClassificationError(input, "the path is empty");
  }
  if (normalized.startsWith("/") || /^[A-Za-z]:\//u.test(normalized)) {
    throw new ClassificationError(input, "absolute paths are not allowed");
  }
  if (
    normalized.includes("//") ||
    normalized.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new ClassificationError(
      input,
      "the path must be canonical and cannot traverse directories",
    );
  }
  return normalized;
}

function uniquePatterns(category: GateCategory, configured: ClassifierConfig): readonly string[] {
  const additions = configured[category] ?? [];
  return [...new Set([...defaults[category], ...additions])];
}

function matchesPattern(file: string, pattern: string): boolean {
  if (
    !pattern.includes("/") &&
    !pattern.includes("*") &&
    (file === pattern || basename(file) === pattern)
  ) {
    return true;
  }
  if (pattern.startsWith(".") && !pattern.slice(1).includes(".") && !pattern.includes("/")) {
    return extname(file) === pattern;
  }
  if (pattern.endsWith("/")) {
    return file.startsWith(pattern) || file.includes(`/${pattern}`);
  }
  if (!pattern.includes("/")) {
    return matchesGlob(basename(file), pattern);
  }
  return matchesGlob(file, pattern);
}

function classifyCategory(
  category: GateCategory,
  files: readonly string[],
  configured: ClassifierConfig,
): ClassifiedCategory {
  const patterns = uniquePatterns(category, configured);
  return {
    category,
    files: files.filter((file) => patterns.some((pattern) => matchesPattern(file, pattern))),
  };
}

export function filesForCategory(
  classification: Classification,
  category: GateCategory,
): readonly string[] {
  return classification.categories.find((entry) => entry.category === category)?.files ?? [];
}

export function hasCategory(classification: Classification, category: GateCategory): boolean {
  return filesForCategory(classification, category).length > 0;
}

export function classify(
  changedFiles: readonly string[],
  classifiers: ClassifierConfig = {},
): Classification {
  const files = [...new Set(changedFiles.map(normalizePath))].toSorted();
  const categories = gateCategories.map((category) =>
    classifyCategory(category, files, classifiers),
  );
  const classifiedFiles = new Set(categories.flatMap((entry) => entry.files));
  const unclassifiedFiles = files.filter((file) => !classifiedFiles.has(file));
  const gateDefinitionFiles =
    categories.find((entry) => entry.category === "gateDefinition")?.files ?? [];
  const docsFiles = new Set(categories.find((entry) => entry.category === "docs")?.files ?? []);
  const docsOnly = files.length > 0 && files.every((file) => docsFiles.has(file));

  if (gateDefinitionFiles.length > 0) {
    const path = gateDefinitionFiles[0];
    if (path !== undefined) {
      return {
        changedFiles: files,
        categories,
        unclassifiedFiles,
        docsOnly,
        fullRequired: true,
        fullReason: `${path} changes gate behavior`,
      };
    }
  }

  const unclassified = unclassifiedFiles[0];
  if (unclassified !== undefined) {
    return {
      changedFiles: files,
      categories,
      unclassifiedFiles,
      docsOnly,
      fullRequired: true,
      fullReason: `${unclassified} is not classified`,
    };
  }

  return {
    changedFiles: files,
    categories,
    unclassifiedFiles,
    docsOnly,
    fullRequired: false,
  };
}
