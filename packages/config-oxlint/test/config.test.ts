import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

type CommandResult = {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
};

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function runOxlint(arguments_: readonly string[]): CommandResult | undefined {
  try {
    const result = spawnSync("oxlint", arguments_, {
      cwd: packageDirectory,
      encoding: "utf8",
    });

    if (result.error !== undefined) {
      return undefined;
    }

    return {
      status: result.status ?? 1,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error) {
    throw new Error("Could not start oxlint.", { cause: error });
  }
}

const oxlintVersion = runOxlint(["--version"]);
const tsgolintVersion = (() => {
  try {
    const result = spawnSync("tsgolint", ["-h"], {
      cwd: packageDirectory,
      encoding: "utf8",
    });

    return result.error === undefined && result.status === 0;
  } catch (error) {
    throw new Error("Could not probe tsgolint.", { cause: error });
  }
})();

if (oxlintVersion === undefined) {
  console.warn("@q9labsai/config-oxlint tests skipped: oxlint is not installed in this worktree.");
} else if (!tsgolintVersion) {
  console.warn(
    "@q9labsai/config-oxlint type-aware fixture tests skipped: tsgolint is not installed; running non-type-aware coverage.",
  );
}

const testWithOxlint = oxlintVersion === undefined ? it.skip : it;
const testWithTypeAware = oxlintVersion === undefined || !tsgolintVersion ? it.skip : it;

describe("shareable Oxlint config", () => {
  testWithTypeAware("accepts the clean fixture", () => {
    const result = runOxlint(["-c", "oxlint.json", "fixtures/clean.ts"]);

    expect(result).toBeDefined();
    expect(result?.status).toBe(0);
  });

  testWithTypeAware("reports explicit any", () => {
    const result = runOxlint(["-c", "oxlint.json", "fixtures/explicit-any.ts"]);

    expect(result).toBeDefined();
    expect(result?.status).not.toBe(0);
    expect(`${result?.stdout}\n${result?.stderr}`).toContain("no-explicit-any");
  });

  testWithTypeAware("reports floating promises", () => {
    const result = runOxlint(["-c", "oxlint.json", "fixtures/floating-promise.ts"]);

    expect(result).toBeDefined();
    expect(result?.status).not.toBe(0);
    expect(`${result?.stdout}\n${result?.stderr}`).toContain("no-floating-promises");
  });

  testWithOxlint("runs a non-type-aware baseline when tsgolint is unavailable", () => {
    if (tsgolintVersion) {
      return;
    }

    const result = runOxlint(["-c", "fixtures/non-type-aware.json", "fixtures/clean.ts"]);

    expect(result).toBeDefined();
    expect(result?.status).toBe(0);
  });
});
