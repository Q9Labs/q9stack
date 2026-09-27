import { resolve } from "node:path";

import { cruise } from "dependency-cruiser";
import { describe, expect, test } from "vitest";

import { makeHexagonalRules } from "../src/index.js";
import { toDependencyCruiserPatterns } from "../src/path-pattern.js";
import { presets } from "../src/presets.js";

const fixtureRoot = resolve(import.meta.dirname, "fixtures/hexagonal");
const crossPackageFixtureRoot = resolve(import.meta.dirname, "fixtures/cross-package");
const typeScriptFixtureRoot = resolve(import.meta.dirname, "ts-fixtures");

describe("makeHexagonalRules", () => {
  test("reports a core module importing an edge module", async () => {
    const result = await cruise([fixtureRoot], {
      validate: true,
      // Rules only: the factory's default excludes would skip this test/fixtures tree.
      ruleSet: {
        forbidden: makeHexagonalRules({ core: ["src/core"], edges: ["src/edge"] }).forbidden ?? [],
      },
    });

    expect(result.exitCode).toBe(0);
    if (typeof result.output === "string") {
      throw new Error("dependency-cruiser returned formatted output");
    }

    const [violation] = result.output.summary.violations;
    expect(result.output.summary.violations).toHaveLength(1);
    if (violation === undefined) {
      throw new Error("expected one violation");
    }

    expect(violation.to).toMatch(/[\\/]src[\\/]edge[\\/]edge\.js$/u);
    expect(violation.rule.name).toBe("domain-imports-edge");
  });

  test("keeps the monorepo paths as glob inputs", async () => {
    const rules = makeHexagonalRules(presets.monorepo);

    expect(rules.forbidden?.[0]).toMatchObject({
      name: "domain-imports-edge",
      from: { path: ["(?:^|/)packages/core/src(?:/|$)"] },
      to: {
        path: [
          "(?:^|/)apps/[^/]+/src(?:/|$)",
          "(?:^|/)packages/[^/]+/src/(?:adapters|http|db|cli)(?:/|$)",
        ],
      },
    });
  });

  test("excludes build output, fixtures, and worktrees from the cruise by default", () => {
    const rules = makeHexagonalRules({ core: [], edges: [], exclude: ["^scratchpad/"] });
    const exclude = rules.options?.exclude;

    if (exclude === undefined || typeof exclude === "string" || Array.isArray(exclude)) {
      throw new Error("expected an exclude path list");
    }
    const paths = exclude.path;
    if (paths === undefined || typeof paths === "string") {
      throw new Error("expected an exclude path list");
    }
    expect(paths).toContain("^scratchpad/");
    expect(paths.some((pattern) => pattern.includes("\\.worktrees"))).toBe(true);
    expect(paths.some((pattern) => pattern.includes("fixtures/"))).toBe(true);
  });

  test("uses the source package capture to exclude same-package imports", () => {
    const rules = makeHexagonalRules({ core: [], edges: [] });

    expect(rules.forbidden).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "no-cross-package-src-imports",
          from: { path: "(?:^|/)packages/([^/]+)/src(?:/|$)" },
          to: { path: "(?:^|/)packages/(?!$1/)[^/]+/src(?:/|$)" },
        }),
      ]),
    );
  });

  test("reports cross-package source imports without flagging same-package imports", async () => {
    const result = await cruise([crossPackageFixtureRoot], {
      validate: true,
      ruleSet: { forbidden: makeHexagonalRules({ core: [], edges: [] }).forbidden ?? [] },
    });

    expect(result.exitCode).toBe(0);
    if (typeof result.output === "string") {
      throw new Error("dependency-cruiser returned formatted output");
    }

    const violations = result.output.summary.violations.filter(
      (violation) => violation.rule.name === "no-cross-package-src-imports",
    );
    const [violation] = violations;
    expect(violations).toHaveLength(1);
    if (violation === undefined) {
      throw new Error("expected one violation");
    }
    expect(violation.from).toMatch(/[\\/]packages[\\/]alpha[\\/]src[\\/]index\.js$/u);
    expect(violation.to).toMatch(/[\\/]packages[\\/]beta[\\/]src[\\/]value\.js$/u);
  });

  test("cruises TypeScript and TSX modules", async () => {
    const result = await cruise([typeScriptFixtureRoot], {
      validate: true,
      ruleSet: { forbidden: [] },
      parser: "tsc",
    });

    expect(result.exitCode).toBe(0);
    if (typeof result.output === "string") {
      throw new Error("dependency-cruiser returned formatted output");
    }

    const sources = result.output.modules
      .map(({ source }) => source)
      .filter((source) => /\.tsx?$/u.test(source));
    expect(sources.some((source) => source.endsWith("/index.ts"))).toBe(true);
    expect(sources.some((source) => source.endsWith("/view.tsx"))).toBe(true);
  });
});

describe("dependency-cruiser path globs", () => {
  test("expands brace alternatives without corrupting the generated group", () => {
    const pattern = toDependencyCruiserPatterns(["packages/*/src/{adapters,http}"])[0];
    if (!pattern) {
      throw new Error("glob converter returned no pattern");
    }

    expect(pattern).toBe("(?:^|/)packages/[^/]+/src/(?:adapters|http)(?:/|$)");
    expect(new RegExp(pattern).test("/repo/packages/ui/src/adapters/button.ts")).toBe(true);
    expect(new RegExp(pattern).test("/repo/packages/ui/src/routes/button.ts")).toBe(false);
  });

  test("expands double-star without rewriting the generated wildcard", () => {
    const pattern = toDependencyCruiserPatterns(["packages/**/src"])[0];
    if (!pattern) {
      throw new Error("glob converter returned no pattern");
    }

    expect(pattern).toBe("(?:^|/)packages/.*/src(?:/|$)");
    expect(new RegExp(pattern).test("/repo/packages/ui/src/index.ts")).toBe(true);
    expect(new RegExp(pattern).test("/repo/packages/ui/nested/src/index.ts")).toBe(true);
  });
});
