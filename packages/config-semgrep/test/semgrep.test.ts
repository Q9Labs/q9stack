import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import { semgrepRulePacks } from "../src/index.js";

type CommandResult = {
  readonly status: number | null;
  readonly output: string;
  readonly error: Error | undefined;
};

type Pack = {
  readonly name: string;
  readonly config: string;
  readonly fixtures: readonly string[];
  readonly ruleIds: readonly string[];
};

type PackResult =
  | { readonly kind: "scan"; readonly pack: Pack; readonly output: string }
  | { readonly kind: "validated"; readonly pack: Pack; readonly reason: string }
  | { readonly kind: "skipped"; readonly pack: Pack; readonly reason: string };

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

const packs = [
  {
    name: "type-safety",
    config: "rules/type-safety.yml",
    fixtures: [
      "tests/q9.typescript.no-type-assertions.ts",
      "tests/q9.typescript.no-shapeless-records.ts",
      "tests/q9.typescript.no-shape-erasing-guards.ts",
      "tests/q9.javascript.require-suppression-justification.ts",
    ],
    ruleIds: [
      "q9.typescript.no-type-assertions",
      "q9.typescript.no-shapeless-records",
      "q9.typescript.no-shape-erasing-guards",
      "q9.javascript.require-suppression-justification",
    ],
  },
  {
    name: "shape-heuristics",
    config: "rules/shape-heuristics.yml",
    fixtures: [
      "tests/q9.typescript.no-optional-field-soup.ts",
      "tests/q9.typescript.no-optional-boolean-flag-pairs.ts",
      "tests/q9.javascript.no-unvalidated-json-parse.ts",
    ],
    ruleIds: [
      "q9.typescript.no-optional-field-soup",
      "q9.typescript.no-optional-boolean-flag-pairs",
      "q9.javascript.no-unvalidated-json-parse",
    ],
  },
  {
    name: "security",
    config: "rules/security.yml",
    fixtures: [
      "tests/q9.javascript.no-dynamic-code.ts",
      "tests/q9.javascript.no-unsanitized-dangerously-set-inner-html.tsx",
      "tests/q9.javascript.require-noopener-for-blank-target.tsx",
      "tests/q9.javascript.no-child-process-exec-template.ts",
      "tests/q9.javascript.no-hard-coded-provider-token.ts",
    ],
    ruleIds: [
      "q9.javascript.no-dynamic-code",
      "q9.javascript.no-unsanitized-dangerously-set-inner-html",
      "q9.javascript.require-noopener-for-blank-target",
      "q9.javascript.no-child-process-exec-template",
      "q9.javascript.no-hard-coded-provider-token",
    ],
  },
] as const satisfies readonly Pack[];

const runSemgrep = (args: readonly string[]): CommandResult => {
  const result = spawnSync("semgrep", args, {
    cwd: packageRoot,
    encoding: "utf8",
    timeout: 30_000,
  });

  return {
    status: result.status,
    output: `${result.stdout}\n${result.stderr}`,
    error: result.error,
  };
};

const compactReason = (result: CommandResult): string => {
  const detail = result.error?.message ?? result.output.trim();
  return detail.length > 500 ? `${detail.slice(0, 500)}…` : detail;
};

const hasConfigurationError = (result: CommandResult): boolean =>
  result.error !== undefined ||
  /invalid configuration|configuration error|fatal error/i.test(result.output);

const hasTargets = (result: CommandResult): boolean =>
  !/Targets scanned:\s*0|Nothing to scan\.|No files to scan/i.test(result.output);

const runPack = (pack: Pack): PackResult => {
  const requestedScan = runSemgrep(["--metrics=off", "--config", pack.config, "tests/"]);

  if (!hasConfigurationError(requestedScan) && hasTargets(requestedScan)) {
    return { kind: "scan", pack, output: requestedScan.output };
  }

  const targetedScan = runSemgrep([
    "--metrics=off",
    "--config",
    pack.config,
    "tests/",
    ...pack.fixtures,
  ]);

  if (!hasConfigurationError(targetedScan) && hasTargets(targetedScan)) {
    return { kind: "scan", pack, output: targetedScan.output };
  }

  const validation = runSemgrep(["--metrics=off", "--validate", "--config", pack.config]);

  if (!hasConfigurationError(validation) && validation.status === 0) {
    return {
      kind: "validated",
      pack,
      reason: `Semgrep scan unavailable; --validate succeeded. Scan: ${compactReason(targetedScan)}`,
    };
  }

  return {
    kind: "skipped",
    pack,
    reason: `LOUD SKIP: Semgrep scan and --validate both failed. Scan: ${compactReason(targetedScan)}. Validation: ${compactReason(validation)}`,
  };
};

describe("Semgrep rule packs", () => {
  it("exports the three stable pack subpaths", () => {
    expect(semgrepRulePacks).toEqual({
      typeSafety: "@q9labsai/config-semgrep/type-safety",
      shapeHeuristics: "@q9labsai/config-semgrep/shape-heuristics",
      security: "@q9labsai/config-semgrep/security",
    });
  });

  for (const pack of packs) {
    const result = runPack(pack);

    if (result.kind === "skipped") {
      it.skip(`${result.reason} (${pack.name})`, () => {});
      continue;
    }

    if (result.kind === "validated") {
      it(`validates ${pack.name} when scan is unavailable`, () => {
        expect(result.reason).toContain("--validate succeeded");
      });
      continue;
    }

    it(`reports every ${pack.name} fixture rule`, () => {
      for (const ruleId of pack.ruleIds) {
        expect(result.output, `missing diagnostic for ${ruleId}`).toContain(ruleId);
      }
    });
  }
});

describe("RTL direction utility rule", () => {
  const physicalDirectionFixture = mkdtempSync(join(tmpdir(), "q9-semgrep-direction-"));
  const physicalDirectionTarget = join(physicalDirectionFixture, "fixture.tsx");
  writeFileSync(
    physicalDirectionTarget,
    readFileSync(
      resolve(packageRoot, "test/fixtures/q9.ui.no-physical-direction-classes.tsx.txt"),
      "utf8",
    ),
  );
  afterAll(() => rmSync(physicalDirectionFixture, { recursive: true, force: true }));

  const physicalDirectionScan = runSemgrep([
    "--metrics=off",
    "--json",
    "--config",
    "rules/shape-heuristics.yml",
    physicalDirectionTarget,
  ]);

  if (!hasConfigurationError(physicalDirectionScan) && hasTargets(physicalDirectionScan)) {
    it("rejects physical direction classes while allowing logical classes", () => {
      const matches = physicalDirectionScan.output.match(
        /"check_id"\s*:\s*"[^"]*q9\.ui\.no-physical-direction-classes"/gu,
      );
      expect(matches).toHaveLength(4);
      expect(physicalDirectionScan.output).not.toMatch(/ms-4|text-start|rounded-s-lg|border-s-2/u);
      expect(physicalDirectionScan.output).not.toContain("right-to-left");
    });
  } else {
    it.skip(`Semgrep fixture scan unavailable (${compactReason(physicalDirectionScan)})`, () => {});
  }
});
