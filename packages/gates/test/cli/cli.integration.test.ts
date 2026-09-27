import { readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runCli } from "../../src/cli.js";
import { validateGateReport } from "../../src/core/report.js";
import { createFixtureRepo } from "./fixture.js";

describe("q9gate CLI", { concurrent: false }, () => {
  const originalCwd = process.cwd();
  const temporaryRoots: string[] = [];
  let logs: string[];

  beforeEach(() => {
    logs = [];
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
    vi.restoreAllMocks();
    await Promise.all(
      temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  async function fixture(): Promise<string> {
    const root = await createFixtureRepo();
    temporaryRoots.push(root);
    process.chdir(root);
    return root;
  }

  it("explains lane reasons for a file", async () => {
    await fixture();
    const exitCode = await runCli(["node", "q9gate", "why", "src/index.ts"]);
    expect(exitCode).toBe(0);
    expect(logs.join("\n")).toContain("fixture-custom");
    expect(logs.join("\n")).toContain("fixture files changed");
  });

  it("checks project hygiene through doctor", async () => {
    await fixture();

    await expect(runCli(["node", "q9gate", "doctor"])).resolves.toBe(0);
    expect(logs.join("\n")).toContain("q9gate doctor passed");
  });

  it("runs a full gate and always writes a schema-v1 report", async () => {
    const root = await fixture();
    const exitCode = await runCli(["node", "q9gate", "run", "--full"]);
    expect(exitCode).toBe(0);
    const parsed: unknown = JSON.parse(await readFile(join(root, "gate.report.json"), "utf8"));
    const report = validateGateReport(parsed);
    expect(report.schemaVersion).toBe(1);
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
