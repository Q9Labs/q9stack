import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import packageJson from "../../package.json" with { type: "json" };
import { executeCommand } from "../../src/adapters/process.js";
import { runCli } from "../../src/cli.js";
import { validateGateReport } from "../../src/core/report.js";
import { createFixtureRepo } from "./fixture.js";

describe("q9gate CLI", { concurrent: false }, () => {
  const originalCwd = process.cwd();
  const originalGateFiles = process.env["GATE_FILES"];
  const temporaryRoots: string[] = [];
  let logs: string[];

  beforeEach(() => {
    logs = [];
    vi.spyOn(console, "info").mockImplementation((...values: unknown[]) => {
      logs.push(values.join(" "));
    });
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      logs.push(chunk.toString().trimEnd());
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
      logs.push(chunk.toString().trimEnd());
      return true;
    });
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (originalGateFiles === undefined) {
      delete process.env["GATE_FILES"];
    } else {
      process.env["GATE_FILES"] = originalGateFiles;
    }
    vi.restoreAllMocks();
    await Promise.all(
      temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  async function fixture(includeTargetContext = false): Promise<string> {
    const root = await createFixtureRepo(includeTargetContext);
    temporaryRoots.push(root);
    process.chdir(root);
    return root;
  }

  it("reports the version from its package manifest", async () => {
    await runCli(["node", "q9gate", "--version"]);
    expect(logs.join("\n")).toContain(`q9gate/${packageJson.version}`);
  });

  it("explains lane reasons for a file", async () => {
    await fixture();
    const exitCode = await runCli(["node", "q9gate", "why", "src/index.ts"]);
    expect(exitCode).toBe(0);
    expect(logs.join("\n")).toContain("fixture-custom");
    expect(logs.join("\n")).toContain("src/index.ts changed");
  });

  it("checks project hygiene through doctor", async () => {
    await fixture();

    await expect(runCli(["node", "q9gate", "doctor"])).resolves.toBe(0);
    expect(logs.join("\n")).toContain("q9gate doctor passed");
  });

  it("runs a full gate and always writes a schema-v1 report", async () => {
    const root = await fixture();
    const base = await executeCommand("git", ["update-ref", "refs/remotes/origin/main", "HEAD"], {
      cwd: root,
    });
    expect(base.failed).toBe(false);

    const exitCode = await runCli(["node", "q9gate", "run", "--full"]);
    expect(exitCode).toBe(0);
    const parsed: unknown = JSON.parse(await readFile(join(root, "gate.report.json"), "utf8"));
    const report = validateGateReport(parsed);
    expect(report.schemaVersion).toBe(1);
    expect(report.base).toBe("origin/main");
    expect(report.summary).toEqual({ passed: 2, failed: 0, skipped: 0 });
  });

  it("accepts repeated explicit lane options", async () => {
    const root = await fixture();
    const exitCode = await runCli([
      "node",
      "q9gate",
      "run",
      "--full",
      "--lane",
      "hygiene",
      "--lane",
      "fixture-custom",
    ]);

    expect(exitCode).toBe(0);
    const parsed: unknown = JSON.parse(await readFile(join(root, "gate.report.json"), "utf8"));
    const report = validateGateReport(parsed);
    expect(report.summary).toEqual({ passed: 2, failed: 0, skipped: 0 });
  });

  it("uses --files in place of the Git diff and prefers it to GATE_FILES", async () => {
    const root = await fixture();
    process.env["GATE_FILES"] = "docs/guide.md";
    await writeFile(join(root, "src/other.ts"), "export const fixture = false;\n", "utf8");
    const staged = await executeCommand("git", ["add", "src/other.ts"], { cwd: root });
    expect(staged.failed).toBe(false);

    const exitCode = await runCli(["node", "q9gate", "run", "--files", "src/index.ts"]);

    expect(exitCode).toBe(0);
    const parsed: unknown = JSON.parse(await readFile(join(root, "gate.report.json"), "utf8"));
    const report = validateGateReport(parsed);
    expect(report.lanes.find((lane) => lane.id === "fixture-custom")?.reason).toBe(
      "src/index.ts changed",
    );
  });

  it("unions committed branch changes with staged files and respects a target", async () => {
    const root = await fixture();
    const branch = await executeCommand("git", ["switch", "-c", "feature"], { cwd: root });
    expect(branch.failed).toBe(false);
    await writeFile(join(root, "docs/guide.md"), "# Committed change\n");
    expect((await executeCommand("git", ["add", "docs/guide.md"], { cwd: root })).failed).toBe(
      false,
    );
    expect(
      (await executeCommand("git", ["commit", "-m", "docs: update guide"], { cwd: root })).failed,
    ).toBe(false);
    await writeFile(join(root, "src/other.ts"), "export const fixture = false;\n");
    expect((await executeCommand("git", ["add", "src/other.ts"], { cwd: root })).failed).toBe(
      false,
    );

    expect(await runCli(["node", "q9gate", "run"])).toBe(0);
    const all: unknown = JSON.parse(await readFile(join(root, "gate.report.json"), "utf8"));
    expect(validateGateReport(all).lanes.find((lane) => lane.id === "fixture-custom")?.reason).toBe(
      "docs/guide.md, src/other.ts changed",
    );

    expect(await runCli(["node", "q9gate", "run", "--target", "web"])).toBe(0);
    const targeted: unknown = JSON.parse(await readFile(join(root, "gate.report.json"), "utf8"));
    expect(
      validateGateReport(targeted).lanes.find((lane) => lane.id === "fixture-custom")?.reason,
    ).toBe("src/other.ts changed");
  });

  it("reads comma- and newline-separated GATE_FILES values", async () => {
    const root = await fixture();
    process.env["GATE_FILES"] = "src/index.ts,\ndocs/guide.md";

    const exitCode = await runCli(["node", "q9gate", "run"]);

    expect(exitCode).toBe(0);
    const parsed: unknown = JSON.parse(await readFile(join(root, "gate.report.json"), "utf8"));
    const report = validateGateReport(parsed);
    expect(report.lanes.find((lane) => lane.id === "fixture-custom")?.reason).toBe(
      "docs/guide.md, src/index.ts changed",
    );
  });

  it("validates explicit paths and accepts a file present only in the diff base", async () => {
    const root = await fixture();
    await expect(runCli(["node", "q9gate", "run", "--files", "../outside.ts"])).rejects.toThrow(
      "canonical repo-relative path",
    );
    await expect(runCli(["node", "q9gate", "run", "--files", "/etc/passwd"])).rejects.toThrow(
      "canonical repo-relative path",
    );
    await expect(runCli(["node", "q9gate", "run", "--files", "src/missing.ts"])).rejects.toThrow(
      "do not exist as files",
    );

    await rm(join(root, "src/index.ts"));
    const exitCode = await runCli([
      "node",
      "q9gate",
      "run",
      "--base",
      "HEAD",
      "--files",
      "src/index.ts",
    ]);

    expect(exitCode).toBe(0);
    const parsed: unknown = JSON.parse(await readFile(join(root, "gate.report.json"), "utf8"));
    const report = validateGateReport(parsed);
    expect(report.lanes.find((lane) => lane.id === "fixture-custom")?.reason).toBe(
      "src/index.ts changed",
    );
  });

  it("narrows explicit files and workspace roots to a configured target", async () => {
    const root = await fixture();
    const exitCode = await runCli([
      "node",
      "q9gate",
      "run",
      "--full",
      "--files",
      "src/index.ts",
      "--files",
      "docs/guide.md",
      "--target",
      "docs",
    ]);

    expect(exitCode).toBe(0);
    const parsed: unknown = JSON.parse(await readFile(join(root, "gate.report.json"), "utf8"));
    const report = validateGateReport(parsed);
    expect(report.lanes.find((lane) => lane.id === "fixture-custom")?.metrics?.filesChecked).toBe(
      1,
    );
  });

  it("exposes the target and unfiltered changed files to custom triggers and runners", async () => {
    const root = await fixture(true);
    const exitCode = await runCli([
      "node",
      "q9gate",
      "run",
      "--files",
      "src/index.ts",
      "--files",
      "docs/guide.md",
      "--target",
      "web",
    ]);

    expect(exitCode).toBe(0);
    const parsed: unknown = JSON.parse(await readFile(join(root, "gate.report.json"), "utf8"));
    const report = validateGateReport(parsed);
    expect(report.lanes.find((lane) => lane.id === "target-context")).toMatchObject({
      status: "passed",
      reason: "target context exposed",
    });
  });

  it("forces a full gate when an out-of-target gate definition changes", async () => {
    const root = await fixture();
    const exitCode = await runCli([
      "node",
      "q9gate",
      "run",
      "--files",
      "gate.config.ts",
      "--target",
      "web",
    ]);

    expect(exitCode).toBe(0);
    const parsed: unknown = JSON.parse(await readFile(join(root, "gate.report.json"), "utf8"));
    const report = validateGateReport(parsed);
    expect(report.lanes.find((lane) => lane.id === "fixture-custom")?.reason).toBe(
      "gate.config.ts changes gate behavior",
    );
  });

  it("validates deleted explicit files against the merge base of a diverged branch", async () => {
    const root = await fixture();
    const branchResult = await executeCommand("git", ["branch", "--show-current"], {
      cwd: root,
    });
    expect(branchResult.failed).toBe(false);
    const baseBranch = branchResult.stdout.trim();
    async function git(args: readonly string[]): Promise<void> {
      const result = await executeCommand("git", args, { cwd: root });
      expect(result.failed, result.stderr || result.stdout).toBe(false);
    }

    await git(["checkout", "-b", "feature"]);
    await rm(join(root, "src/index.ts"));
    await git(["add", "src/index.ts"]);
    await git(["commit", "-m", "test: delete selected file on feature"]);
    await git(["checkout", baseBranch]);
    await rm(join(root, "src/index.ts"));
    await git(["add", "src/index.ts"]);
    await git(["commit", "-m", "test: delete selected file on base"]);
    await git(["checkout", "feature"]);

    const exitCode = await runCli([
      "node",
      "q9gate",
      "run",
      "--base",
      baseBranch,
      "--files",
      "src/index.ts",
    ]);

    expect(exitCode).toBe(0);
    const parsed: unknown = JSON.parse(await readFile(join(root, "gate.report.json"), "utf8"));
    const report = validateGateReport(parsed);
    expect(report.lanes.find((lane) => lane.id === "fixture-custom")?.reason).toBe(
      "src/index.ts changed",
    );
  });

  it("rejects an unknown target", async () => {
    await fixture();
    await expect(runCli(["node", "q9gate", "run", "--target", "unknown"])).rejects.toThrow(
      'Unknown target "unknown"',
    );
  });

  it("initializes project files and refuses an overwrite without force", async () => {
    const root = await fixture();
    await rm(join(root, "gate.config.ts"));
    const exitCode = await runCli(["node", "q9gate", "init"]);
    expect(exitCode).toBe(0);
    await expect(stat(join(root, ".semgrep", "project.yml"))).resolves.toBeDefined();
    await expect(runCli(["node", "q9gate", "init"])).rejects.toThrow(
      "Refusing to overwrite existing files",
    );
    await expect(runCli(["node", "q9gate", "init", "--force"])).resolves.toBe(0);
  });

  it("records a required baseline acceptance message", async () => {
    const root = await fixture();
    const exitCode = await runCli([
      "node",
      "q9gate",
      "accept-baseline",
      "fixture-custom",
      "--message",
      "Reviewed fixture debt",
    ]);
    expect(exitCode).toBe(0);
    const baseline = await readFile(
      join(root, "gates", "baselines", "fixture-custom.json"),
      "utf8",
    );
    expect(baseline).toContain("Reviewed fixture debt");
  });
});
