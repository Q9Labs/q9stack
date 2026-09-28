import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { acceptBaselineCommand } from "../../src/commands/accept-baseline.js";
import type { CommandResult, GateConfig, GateExec, LaneContext } from "../../src/core/types.js";
import { osv } from "../../src/lanes/osv.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

function result(command: string, stdout: string): CommandResult {
  return { command, exitCode: 0, stdout, stderr: "", failed: false };
}

function laneContext(repoRoot: string, exec: GateExec): LaneContext {
  return {
    repoRoot,
    exec,
    changedFiles: [],
    allChangedFiles: [],
    classification: {
      changedFiles: [],
      categories: [],
      unclassifiedFiles: [],
      docsOnly: false,
      fullRequired: false,
    },
    scope: "full",
    target: undefined,
  };
}

describe("accept-baseline for OSV", () => {
  it("appends current findings with per-entry approval and preserves existing entries", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "q9-osv-baseline-"));
    temporaryRoots.push(repoRoot);
    const existingEntries = [
      {
        ecosystem: "npm",
        id: "GHSA-existing-1",
        package: "unsafe",
        source: "pnpm-lock.yaml",
        version: "1.0.0",
        previousApproval: { acceptedAt: "2026-01-01T00:00:00.000Z", message: "old approval" },
      },
      {
        ecosystem: "npm",
        id: "GHSA-existing-2",
        package: "unsafe",
        source: "pnpm-lock.yaml",
        version: "1.0.0",
        note: "keep this entry as-is",
      },
    ];
    const initialBaseline = {
      format: "osv-native-v1",
      metadata: { owner: "security" },
      entries: existingEntries,
    };
    await writeFile(
      join(repoRoot, "osv-baseline.json"),
      `${JSON.stringify(initialBaseline, null, 2)}\n`,
      "utf8",
    );

    const report = {
      results: [
        {
          source: { path: "pnpm-lock.yaml" },
          packages: [
            {
              package: { ecosystem: "npm", name: "unsafe", version: "1.0.0" },
              vulnerabilities: [
                { id: "GHSA-existing-1" },
                { id: "GHSA-existing-2" },
                { id: "GHSA-new", summary: "New issue" },
              ],
            },
          ],
        },
      ],
    };
    const exec: GateExec = async (command, args = []) =>
      args[0] === "--version"
        ? result(`${command} --version`, "2.3.8\n")
        : result(`${command} ${args.join(" ")}`, JSON.stringify(report));
    const config: GateConfig = { workspaceRoots: [], lanes: [osv()] };

    await expect(
      acceptBaselineCommand(repoRoot, config, "osv", "Reviewed current OSV findings", exec),
    ).resolves.toBe(0);

    const baselineSchema = z
      .object({
        format: z.string().optional(),
        metadata: z.object({ owner: z.string() }).optional(),
        entries: z.array(
          z.object({ id: z.string(), acceptedAt: z.string().optional() }).passthrough(),
        ),
      })
      .passthrough();
    const parsedBaseline: unknown = JSON.parse(
      await readFile(join(repoRoot, "osv-baseline.json"), "utf8"),
    );
    const baseline = baselineSchema.parse(parsedBaseline);
    expect(baseline.format).toBe("osv-native-v1");
    expect(baseline.metadata).toEqual({ owner: "security" });
    expect(baseline.entries).toHaveLength(3);
    expect(baseline.entries.slice(0, 2)).toEqual(existingEntries);
    expect(baseline.entries[2]).toMatchObject({
      id: "GHSA-new",
      message: "Reviewed current OSV findings",
      source: "pnpm-lock.yaml",
    });
    expect(baseline.entries[2]?.acceptedAt).toBeTypeOf("string");
    expect(Number.isNaN(Date.parse(String(baseline.entries[2]?.acceptedAt)))).toBe(false);
    await expect(osv().run(laneContext(repoRoot, exec))).resolves.toMatchObject({
      status: "passed",
    });
  });
});
