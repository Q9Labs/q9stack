import { describe, expect, it } from "vitest";

import type { Classification } from "../../src/core/types.js";
import type { CommandResult, LaneContext } from "../../src/core/types.js";
import { lanes, type SyncpackLaneOptions } from "../../src/index.js";
import { actionlint } from "../../src/lanes/actionlint.js";
import { build } from "../../src/lanes/build.js";
import { depcruise } from "../../src/lanes/depcruise.js";
import { format } from "../../src/lanes/format.js";
import { gitleaks } from "../../src/lanes/gitleaks.js";
import { lint } from "../../src/lanes/lint.js";
import { semgrep } from "../../src/lanes/semgrep.js";
import { shellcheck } from "../../src/lanes/shellcheck.js";
import { test as testLane } from "../../src/lanes/test.js";
import { typecheck } from "../../src/lanes/typecheck.js";

interface Call {
  readonly command: string;
  readonly args: readonly string[];
}

const emptyClassification: Classification = {
  changedFiles: [],
  categories: [],
  unclassifiedFiles: [],
  docsOnly: false,
  fullRequired: false,
};

function result(command: string, exitCode = 0): CommandResult {
  return {
    command,
    exitCode,
    stdout: "",
    stderr: "",
    failed: exitCode !== 0,
  };
}

function context(
  changedFiles: readonly string[],
  calls: Call[],
  scope: "branch" | "full" = "branch",
  failTool?: string,
): LaneContext {
  return {
    classification: emptyClassification,
    changedFiles,
    allChangedFiles: changedFiles,
    scope,
    repoRoot: "/tmp/q9gate-fixture",
    target: undefined,
    exec: async (command, args = []) => {
      calls.push({ command, args });
      if (command === failTool && args[0] === "--version") {
        return result(command, 127);
      }
      return result(command);
    },
  };
}

function semgrepContext(
  changedFiles: readonly string[],
  calls: Call[],
  output: { results: readonly unknown[]; errors: readonly unknown[] },
): LaneContext {
  const base = context(changedFiles, calls);
  return {
    ...base,
    exec: async (command, args = [], options) => {
      const outcome = await base.exec(command, args, options);
      return command === "semgrep" && args[0] === "scan"
        ? { ...outcome, stdout: JSON.stringify(output) }
        : outcome;
    },
  };
}

describe("command-backed lanes", () => {
  it("runs the exclusive workspace lanes through pnpm", async () => {
    const runs = await Promise.all(
      [typecheck(), testLane(), build()].map(async (lane) => {
        const calls: Call[] = [];
        const laneResult = await lane.run(context(["packages/gates/src/index.ts"], calls));
        return { calls, laneResult };
      }),
    );
    for (const { calls, laneResult } of runs) {
      expect(laneResult.status).toBe("passed");
      expect(calls[0]?.command).toBe("pnpm");
      expect(calls[0]?.args).toEqual(["--version"]);
      expect(calls[1]?.command).toBe("pnpm");
      expect(calls[1]?.args[0]).toBe("run");
    }
    expect(typecheck().exclusive).toBe(true);
    expect(testLane().exclusive).toBe(true);
    expect(build().exclusive).toBe(true);
  });

  it("adds only changed files to lint and format commands", async () => {
    const lintCalls: Call[] = [];
    const lintResult = await lint().run(
      context(["src/a.ts", "README.md", "src/b.json"], lintCalls),
    );
    expect(lintResult.status).toBe("passed");
    expect(lintCalls[1]).toEqual({ command: "oxlint", args: ["src/a.ts"] });

    const formatCalls: Call[] = [];
    const formatResult = await format().run(
      context(["src/a.ts", "README.md", "notes.bin"], formatCalls),
    );
    expect(formatResult.status).toBe("passed");
    expect(formatCalls[1]).toEqual({
      command: "oxfmt",
      args: ["--check", "src/a.ts", "README.md"],
    });
  });

  it("uses the resolved Semgrep config and changed-file scope", async () => {
    const calls: Call[] = [];
    const laneResult = await semgrep({ packs: [".semgrep/project.yml"] }).run(
      semgrepContext(["packages/gates/src/index.ts"], calls, { results: [], errors: [] }),
    );

    expect(laneResult.status).toBe("passed");
    expect(calls[1]?.command).toBe("semgrep");
    expect(calls[1]?.args[0]).toBe("scan");
    expect(calls[1]?.args).toContain("--json");
    expect(calls[1]?.args).toContain("--metrics=off");
    expect(calls[1]?.args).toContain("--include=packages/gates/src/index.ts");
    expect(calls[1]?.args.at(-1)).toBe(".");
  });

  it("turns Semgrep JSON results into file findings with authored rule ids", async () => {
    const calls: Call[] = [];
    const laneResult = await semgrep({ packs: [".semgrep/project.yml"] }).run(
      semgrepContext(["src/a.ts"], calls, {
        results: [
          {
            check_id: "packages.config-semgrep.rules.q9.typescript.no-type-assertions",
            path: "src/a.ts",
            start: { line: 4 },
            extra: { message: "Type assertions are banned\n  (as const is fine)." },
          },
        ],
        errors: [{ message: "Timeout in src/slow.ts" }],
      }),
    );

    expect(laneResult.status).toBe("failed");
    expect(laneResult.findings).toEqual([
      {
        file: "src/a.ts",
        line: 4,
        rule: "q9.typescript.no-type-assertions",
        message: "Type assertions are banned (as const is fine).",
      },
      { file: "semgrep", rule: "semgrep-error", message: "Timeout in src/slow.ts" },
    ]);
  });

  it("passes depcruise config and gitleaks baseline", async () => {
    const depcruiseCalls: Call[] = [];
    await depcruise({ config: "config/dependency-cruiser.cjs" }).run(
      context(["src/a.ts"], depcruiseCalls),
    );
    expect(depcruiseCalls[1]).toEqual({
      command: "depcruise",
      args: ["--config", "config/dependency-cruiser.cjs", "--output-type", "json", "."],
    });

    const gitleaksCalls: Call[] = [];
    await gitleaks({ baseline: "gates/baselines/gitleaks.json" }).run(
      context(["src/a.ts"], gitleaksCalls),
    );
    expect(gitleaksCalls[1]?.args).toContain("--baseline-path");
    expect(gitleaksCalls[1]?.args).toContain("gates/baselines/gitleaks.json");
  });

  it("preserves the directory scan and supports gitleaks git-history options", async () => {
    const directoryCalls: Call[] = [];
    await gitleaks().run(context(["src/a.ts"], directoryCalls));
    expect(directoryCalls[1]).toEqual({
      command: "gitleaks",
      args: ["detect", "--source", ".", "--redact", "--verbose"],
    });

    const gitCalls: Call[] = [];
    await gitleaks({
      mode: "git",
      logOpts: "HEAD",
      baselinePath: "scripts/gates/gitleaks-baseline.json",
    }).run(context(["src/a.ts"], gitCalls));
    expect(gitCalls[1]).toEqual({
      command: "gitleaks",
      args: [
        "git",
        "--log-opts",
        "HEAD",
        "--baseline-path",
        "scripts/gates/gitleaks-baseline.json",
        "--redact",
        "--verbose",
        ".",
      ],
    });
  });

  it("checks changed shell and workflow files", async () => {
    const shellCalls: Call[] = [];
    await shellcheck().run(context(["scripts/check.sh", ".github/workflows/ci.yml"], shellCalls));
    expect(shellCalls[1]).toEqual({
      command: "shellcheck",
      args: ["--color=never", "scripts/check.sh"],
    });

    const actionCalls: Call[] = [];
    await actionlint().run(context(["scripts/check.sh", ".github/workflows/ci.yml"], actionCalls));
    expect(actionCalls[1]).toEqual({
      command: "actionlint",
      args: [".github/workflows/ci.yml"],
    });
  });

  it("passes lint when every supplied file is ignore-listed", async () => {
    const calls: Call[] = [];
    const laneContext: LaneContext = {
      classification: emptyClassification,
      changedFiles: ["templates/base/apps/web/src/env.ts"],
      allChangedFiles: ["templates/base/apps/web/src/env.ts"],
      scope: "branch",
      repoRoot: "/tmp/q9gate-fixture",
      target: undefined,
      exec: async (command, args = []) => {
        calls.push({ command, args });
        if (args[0] === "--version") {
          return result(command);
        }
        return {
          command,
          exitCode: 1,
          stdout: "",
          stderr: "No files found to lint. Please check your paths and ignore patterns.",
          failed: true,
        };
      },
    };

    const laneResult = await lint().run(laneContext);
    expect(laneResult.status).toBe("passed");
  });

  it("runs syncpack lint and returns an install hint for missing tools", async () => {
    const syncpackCalls: Call[] = [];
    const syncpackResult = await lanes.syncpack().run(context(["package.json"], syncpackCalls));
    expect(syncpackResult.status).toBe("passed");
    expect(syncpackCalls[1]).toEqual({ command: "syncpack", args: ["lint"] });

    const configuredSyncpackCalls: Call[] = [];
    const syncpackOptions: SyncpackLaneOptions = {
      args: [
        "lint",
        "--source",
        "package.json",
        "--source",
        "apps/*/package.json",
        "--source",
        "packages/*/package.json",
        "--specifier-types",
        "missing,unsupported",
      ],
    };
    await lanes.syncpack(syncpackOptions).run(context(["package.json"], configuredSyncpackCalls));
    expect(configuredSyncpackCalls[1]).toEqual({
      command: "syncpack",
      args: [
        "lint",
        "--source",
        "package.json",
        "--source",
        "apps/*/package.json",
        "--source",
        "packages/*/package.json",
        "--specifier-types",
        "missing,unsupported",
      ],
    });

    const missingCalls: Call[] = [];
    const missingResult = await gitleaks().run(
      context(["src/a.ts"], missingCalls, "branch", "gitleaks"),
    );
    expect(missingResult.status).toBe("failed");
    expect(missingResult.findings?.[0]?.rule).toBe("missing-tool");
    expect(missingResult.findings?.[0]?.message).toContain("Install Gitleaks");
  });
});
