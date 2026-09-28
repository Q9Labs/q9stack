import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, test, vi } from "vitest";

import packageJson from "../package.json" with { type: "json" };
import { buildScaffoldOptions, runCli } from "../src/cli.js";

describe("create-q9stack CLI", () => {
  test("reports the version from its package manifest", async () => {
    const output: string[] = [];
    const info = vi.spyOn(console, "info").mockImplementation((...values: unknown[]) => {
      output.push(values.join(" "));
    });

    try {
      await runCli(["--version"]);
      expect(output.join("")).toContain(`create-q9stack/${packageJson.version}`);
    } finally {
      info.mockRestore();
    }
  });

  test("builds scaffold options from CLI values", () => {
    const options = buildScaffoldOptions("Demo App", "demo-app", "with-convex", {
      dir: "/tmp/create-q9stack",
      license: "mit",
      linkLocal: "/tmp/q9stack",
      noGit: true,
      noInstall: true,
      product: "  ",
    });

    expect(options).toMatchObject({
      appName: "Demo App",
      appSlug: "demo-app",
      license: "mit",
      linkLocal: "/tmp/q9stack",
      noGit: true,
      noInstall: true,
      product: "demo-app",
      targetDirectory: "/tmp/create-q9stack/demo-app",
      variant: "with-convex",
    });
  });

  test("parses command options and creates a project", async () => {
    const parentDirectory = await mkdtemp(resolve(tmpdir(), "create-q9stack-cli-"));

    try {
      await runCli([
        "Demo App",
        "--convex",
        "--dir",
        parentDirectory,
        "--license",
        "mit",
        "--no-git",
        "--no-install",
        "--product",
        "billing",
      ]);

      const readme = await readFile(resolve(parentDirectory, "demo-app/README.md"), "utf8");
      const license = await readFile(resolve(parentDirectory, "demo-app/LICENSE"), "utf8");
      expect(license).toContain("MIT License");
      expect(readme).toContain("`billing` UI theme");
    } finally {
      await rm(parentDirectory, { force: true, recursive: true });
    }
  });
});
