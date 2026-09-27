import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  classify,
  ClassificationError,
  filesForCategory,
  hasCategory,
} from "../../src/core/classify.js";

describe("classify", () => {
  it("normalizes, sorts, and de-duplicates changed paths", () => {
    const result = classify(["src\\main.ts", "README.md", "src/main.ts", "package.json"]);

    expect(result.changedFiles).toEqual(["README.md", "package.json", "src/main.ts"]);
    expect(filesForCategory(result, "source")).toEqual(["src/main.ts"]);
    expect(filesForCategory(result, "docs")).toEqual(["README.md"]);
    expect(filesForCategory(result, "dependency")).toEqual(["package.json"]);
  });

  it("matches the built-in categories and allows project patterns", () => {
    const result = classify(
      [
        "apps/web/src/App.tsx",
        "apps/web/wrangler.json",
        "apps/web/wrangler.jsonc",
        "wrangler.toml",
        "db/migrations/001.sql",
        ".env.example",
        ".github/workflows/ci.yml",
        "infra/main.tf",
        "packages/contracts/src/schema.ts",
        "convex/schema.ts",
        "scripts/release.sh",
        "assets/logo.svg",
        "README.md",
        "notes.rst",
        "package.json",
      ],
      { docs: ["*.rst"] },
    );

    expect(filesForCategory(result, "source")).toEqual([
      "apps/web/src/App.tsx",
      "convex/schema.ts",
      "packages/contracts/src/schema.ts",
    ]);
    expect(filesForCategory(result, "docs")).toEqual(["README.md", "notes.rst"]);
    expect(filesForCategory(result, "dependency")).toEqual(["package.json"]);
    expect(filesForCategory(result, "gateDefinition")).toEqual([".github/workflows/ci.yml"]);
    expect(filesForCategory(result, "workflow")).toEqual([".github/workflows/ci.yml"]);
    expect(filesForCategory(result, "infra")).toEqual(["infra/main.tf"]);
    expect(filesForCategory(result, "contract")).toEqual([
      "convex/schema.ts",
      "packages/contracts/src/schema.ts",
    ]);
    expect(filesForCategory(result, "env")).toEqual([
      ".env.example",
      "apps/web/wrangler.json",
      "apps/web/wrangler.jsonc",
      "wrangler.toml",
    ]);
    expect(filesForCategory(result, "ui")).toEqual(["apps/web/src/App.tsx"]);
    expect(filesForCategory(result, "shell")).toEqual(["scripts/release.sh"]);
    expect(filesForCategory(result, "sql")).toEqual(["db/migrations/001.sql"]);
    expect(hasCategory(result, "source")).toBe(true);
    expect(result.unclassifiedFiles).toEqual(["assets/logo.svg"]);
    expect(result.fullRequired).toBe(true);
    expect(result.fullReason).toBe(".github/workflows/ci.yml changes gate behavior");
  });

  it("marks gate-definition changes as requiring a full gate", () => {
    const result = classify(["gate.config.ts"]);

    expect(result.fullRequired).toBe(true);
    expect(result.fullReason).toBe("gate.config.ts changes gate behavior");
    expect(filesForCategory(result, "gateDefinition")).toEqual(["gate.config.ts"]);
  });

  it("requires a full gate for an otherwise unknown path", () => {
    const result = classify(["assets/logo.svg"]);

    expect(result.unclassifiedFiles).toEqual(["assets/logo.svg"]);
    expect(result.fullRequired).toBe(true);
    expect(result.fullReason).toBe("assets/logo.svg is not classified");
  });

  it("treats only documentation files as a documentation-only change", () => {
    const docs = classify(["README.md", "docs/guide.mdx", "scratchpad/notes.txt"]);
    const mixed = classify(["README.md", "src/index.ts"]);

    expect(docs.docsOnly).toBe(true);
    expect(docs.fullRequired).toBe(false);
    expect(mixed.docsOnly).toBe(false);
  });

  it("fails closed for invalid paths", () => {
    const invalidPaths = [
      "",
      "/tmp/file.ts",
      "C:\\tmp\\file.ts",
      "src//file.ts",
      "src/./file.ts",
      "src/../file.ts",
    ];

    for (const path of invalidPaths) {
      expect(() => classify([path])).toThrow(ClassificationError);
    }
  });

  it("is deterministic under input ordering and duplicate paths", () => {
    const pathArbitrary = fc.constantFrom(
      "src/index.ts",
      "src/index.test.ts",
      "README.md",
      "package.json",
      "infra/main.tf",
      "assets/logo.svg",
    );

    fc.assert(
      fc.property(fc.array(pathArbitrary, { maxLength: 24 }), (paths) => {
        const forward = classify(paths);
        const reverse = classify(paths.toReversed());

        expect(reverse).toEqual(forward);
        expect(forward.changedFiles).toEqual([...new Set(paths)].toSorted());
      }),
    );
  });

  it("treats backslash and slash separators identically", () => {
    const pathArbitrary = fc.constantFrom(
      "apps/web/src/main.tsx",
      "packages/core/src/index.ts",
      "docs/guide.md",
      "infra/stacks/dev/main.tf",
    );

    fc.assert(
      fc.property(pathArbitrary, (path) => {
        expect(classify([path.replaceAll("/", "\\")])).toEqual(classify([path]));
      }),
    );
  });

  it("preserves category matching for representative paths", () => {
    const examples = [
      ["src/file.ts", "source"],
      ["src/file.test.ts", "test"],
      ["README.md", "docs"],
      ["package.json", "dependency"],
      ["infra/main.tf", "infra"],
      ["db/migrations/001.sql", "sql"],
      ["apps/web/src/App.tsx", "ui"],
    ] as const;

    fc.assert(
      fc.property(fc.constantFrom(...examples), ([path, category]) => {
        expect(filesForCategory(classify([path]), category)).toContain(path);
      }),
    );
  });
});
