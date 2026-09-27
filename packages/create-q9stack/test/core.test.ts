import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import fc from "fast-check";
import { describe, expect, test } from "vitest";

import { readTemplateDirectory } from "../src/adapters/filesystem.js";
import { rewriteLinkedDependencies, sortDependencySections } from "../src/core/dependencies.js";
import { applyOverlay } from "../src/core/overlay.js";
import { createScaffoldPlan } from "../src/core/plan.js";
import { restorePackedTemplatePaths } from "../src/core/template-paths.js";
import { hasTemplateTokens, replaceTokens, type TemplateTokens } from "../src/core/tokens.js";

const fixtureRoot = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures/templates");

function testTokens(overrides: Partial<TemplateTokens> = {}): TemplateTokens {
  return {
    appName: "Fixture App",
    appSlug: "fixture-app",
    licenseBlock: "Copyright (c) 2026 q9labs.",
    product: "fixture",
    year: "2026",
    ...overrides,
  };
}

describe("template core", () => {
  test("restores gitignore files renamed for package transport", () => {
    const restored = restorePackedTemplatePaths(
      new Map([
        [".gitignore.template", "node_modules/\n"],
        ["convex/.gitignore.template", "_generated/\n"],
      ]),
    );

    expect(restored.get(".gitignore")).toBe("node_modules/\n");
    expect(restored.get("convex/.gitignore")).toBe("_generated/\n");
    expect(restored.has(".gitignore.template")).toBe(false);
  });

  test("overlay wins, merges directories, and removes listed paths", () => {
    const base = new Map([
      ["shared/base.txt", "base"],
      ["shared/winner.txt", "base winner"],
      ["remove.txt", "remove me"],
    ]);
    const overlay = new Map([
      ["shared/winner.txt", "overlay winner"],
      ["shared/new.txt", "new"],
      [".q9-remove", "remove.txt\n"],
    ]);

    const merged = applyOverlay(base, overlay);

    expect(merged.get("shared/base.txt")).toBe("base");
    expect(merged.get("shared/winner.txt")).toBe("overlay winner");
    expect(merged.get("shared/new.txt")).toBe("new");
    expect(merged.has("remove.txt")).toBe(false);
    expect(merged.has(".q9-remove")).toBe(false);
  });

  test("fixture overlay renames token paths and leaves binary bytes untouched", async () => {
    const temporaryFixture = await mkdtemp(join(tmpdir(), "create-q9stack-fixture-"));
    const binary = new Uint8Array([
      0xff,
      ...new TextEncoder().encode("__APP_NAME__ stays unchanged"),
      0x80,
    ]);

    try {
      await cp(fixtureRoot, temporaryFixture, { recursive: true });
      await writeFile(resolve(temporaryFixture, "base/binary.bin"), binary);
      const base = await readTemplateDirectory(resolve(temporaryFixture, "base"));
      const overlay = await readTemplateDirectory(resolve(temporaryFixture, "with-convex"));
      const plan = createScaffoldPlan(base, overlay, {
        appName: "Fixture App",
        appSlug: "fixture-app",
        license: "proprietary",
        product: "support",
        variant: "with-convex",
        year: "2026",
      });

      expect(plan.files.has("fixture-app.txt")).toBe(true);
      expect(plan.files.has("__APP_SLUG__.txt")).toBe(false);
      expect(plan.files.get("shared/merged.txt")).toBe("overlay content\n");
      expect(plan.files.has("removed.txt")).toBe(false);
      expect(plan.files.get("support.md")).toBe("Convex product: support.\n");
      expect(plan.files.get("README.md")).toContain("Copyright (c) 2026 q9labs.");

      const transformed = plan.files.get("binary.bin");
      if (!(transformed instanceof Uint8Array)) {
        throw new Error("Expected fixture binary output");
      }
      expect(Array.from(transformed)).toEqual(Array.from(binary));
      expect(Array.from(await readFile(resolve(temporaryFixture, "base/binary.bin")))).toEqual(
        Array.from(binary),
      );
    } finally {
      await rm(temporaryFixture, { force: true, recursive: true });
    }
  });

  test("without-convex fixture overlays the shared directory", async () => {
    const base = await readTemplateDirectory(resolve(fixtureRoot, "base"));
    const overlay = await readTemplateDirectory(resolve(fixtureRoot, "without-convex"));
    const plan = createScaffoldPlan(base, overlay, {
      appName: "Postgres App",
      appSlug: "postgres-app",
      license: "mit",
      product: "billing",
      variant: "without-convex",
      year: "2026",
    });

    expect(plan.files.get("shared/merged.txt")).toBe("postgres overlay content\n");
    expect(plan.files.get("api.txt")).toBe("Postgres API for Postgres App.\n");
    expect(plan.files.get("README.md")).toContain("MIT License");
  });

  test("binary file contents are not tokenized", () => {
    const bytes = new Uint8Array([0xff, 0x00, 0x80, 0x5f]);
    const result = replaceTokens(new Map([["asset.bin", bytes]]), testTokens());
    const output = result.get("asset.bin");
    if (!(output instanceof Uint8Array)) {
      throw new Error("Expected binary output");
    }

    expect(Array.from(output)).toEqual([0xff, 0x00, 0x80, 0x5f]);
  });

  test("link-local rewrites q9labs dependencies in every dependency section", () => {
    const files = new Map([
      [
        "package.json",
        `${JSON.stringify(
          {
            dependencies: { "@q9labsai/ui": "workspace:*", react: "19.2.7" },
            devDependencies: { "@q9labsai/config-tsconfig": "workspace:*" },
            peerDependencies: { "@q9labsai/core": "^0.1.0" },
          },
          null,
          2,
        )}\n`,
      ],
    ]);

    const rewritten = rewriteLinkedDependencies(files, "/tmp/q9stack");
    const manifest = rewritten.get("package.json");
    expect(manifest).toContain('"@q9labsai/ui": "link:/tmp/q9stack/packages/ui"');
    expect(manifest).toContain(
      '"@q9labsai/config-tsconfig": "link:/tmp/q9stack/packages/config-tsconfig"',
    );
    expect(manifest).toContain('"@q9labsai/core": "link:/tmp/q9stack/packages/core"');
    expect(manifest).toContain('"react": "19.2.7"');
  });

  test("dependency sections are sorted after token substitution", () => {
    const files = new Map([
      [
        "apps/web/package.json",
        `${JSON.stringify(
          {
            dependencies: {
              "@convex-fresh/auth": "workspace:*",
              "@convex-dev/better-auth": "catalog:",
              react: "19.2.7",
            },
          },
          null,
          2,
        )}\n`,
      ],
    ]);

    const sorted = sortDependencySections(files);
    const manifest = sorted.get("apps/web/package.json");
    expect(typeof manifest).toBe("string");
    if (typeof manifest === "string") {
      const names = Array.from(manifest.matchAll(/"(@?[\w./-]+)":/gu), (match) => match[1]);
      expect(names).toEqual([
        "dependencies",
        "@convex-dev/better-auth",
        "@convex-fresh/auth",
        "react",
      ]);
    }
  });

  test("link-local strips q9labs catalog entries from pnpm-workspace.yaml", () => {
    const workspace = ["catalog:", '  "@q9labsai/ui": ^0.1.0', "  react: 19.2.7", ""].join("\n");
    const files = new Map([["pnpm-workspace.yaml", workspace]]);

    const rewritten = rewriteLinkedDependencies(files, "/tmp/q9stack");
    const output = rewritten.get("pnpm-workspace.yaml");
    expect(output).not.toContain("@q9labsai/ui");
    expect(output).toContain("react: 19.2.7");
  });

  test("token replacement is idempotent and leaves no known placeholders", () => {
    const arbitraryValue = fc
      .string()
      .map((value) => value.replaceAll("_", "-").replaceAll("\u0000", ""));
    const tokensArbitrary = fc.record({
      appName: arbitraryValue,
      appSlug: arbitraryValue,
      licenseBlock: arbitraryValue,
      product: arbitraryValue,
      year: arbitraryValue,
    });

    fc.assert(
      fc.property(tokensArbitrary, (values) => {
        const tokens: TemplateTokens = values;
        const source = new Map([
          ["__APP_SLUG__/__PRODUCT__.txt", "__APP_NAME__ __YEAR__ __LICENSE_BLOCK__"],
        ]);
        const once = replaceTokens(source, tokens);
        const twice = replaceTokens(once, tokens);
        expect([...twice]).toEqual([...once]);
        for (const [path, content] of once) {
          expect(hasTemplateTokens(path)).toBe(false);
          if (typeof content === "string") {
            expect(hasTemplateTokens(content)).toBe(false);
          }
        }
      }),
    );
  });
});
