import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import {
  scaffoldProject,
  ScaffoldProjectError,
  type ScaffoldProjectOptions,
} from "../src/adapters/scaffold.js";

const fixtureRoot = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures/templates");

function scaffoldOptions(targetDirectory: string): ScaffoldProjectOptions {
  return {
    appName: "Fixture App",
    appSlug: "fixture-app",
    license: "proprietary",
    noGit: true,
    noInstall: true,
    product: "support",
    targetDirectory,
    templateRoot: fixtureRoot,
    variant: "with-convex",
    year: "2026",
  };
}

describe("scaffoldProject", () => {
  test("writes a plan while skipping git and install steps", async () => {
    const parentDirectory = await mkdtemp(resolve(tmpdir(), "create-q9stack-scaffold-"));
    const targetDirectory = resolve(parentDirectory, "fixture-app");

    try {
      const result = await scaffoldProject(scaffoldOptions(targetDirectory));

      expect(result.targetDirectory).toBe(targetDirectory);
      expect(result.plan.files.has("fixture-app.txt")).toBe(true);
    } finally {
      await rm(parentDirectory, { force: true, recursive: true });
    }
  });

  test("rejects an existing target directory before writing", async () => {
    const parentDirectory = await mkdtemp(resolve(tmpdir(), "create-q9stack-scaffold-"));

    try {
      await expect(scaffoldProject(scaffoldOptions(parentDirectory))).rejects.toEqual(
        new ScaffoldProjectError(`Target directory already exists: ${parentDirectory}`),
      );
    } finally {
      await rm(parentDirectory, { force: true, recursive: true });
    }
  });
});
