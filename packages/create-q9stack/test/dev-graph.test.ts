import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { scaffoldProject } from "../src/adapters/scaffold.js";
import type { ScaffoldProjectOptions } from "../src/adapters/scaffold.js";

type TemplateVariant = "with-convex" | "without-convex";

const templateRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../templates");

async function readJson(path: string): Promise<unknown> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  return parsed;
}

async function expectJsonFile(path: string, expected: object): Promise<void> {
  expect(await readJson(path)).toMatchObject(expected);
}

function scaffoldOptions(
  targetDirectory: string,
  variant: TemplateVariant,
): ScaffoldProjectOptions {
  return {
    appName: "Graph Fixture",
    appSlug: "graph-fixture",
    license: "proprietary",
    noGit: true,
    noInstall: true,
    product: "support",
    targetDirectory,
    templateRoot,
    variant,
    year: "2026",
  };
}

async function renderVariant(variant: TemplateVariant): Promise<{
  readonly parentDirectory: string;
  readonly targetDirectory: string;
}> {
  const parentDirectory = await mkdtemp(join(tmpdir(), "create-q9stack-dev-graph-"));
  const targetDirectory = resolve(parentDirectory, "graph-fixture");
  await scaffoldProject(scaffoldOptions(targetDirectory, variant));
  return { parentDirectory, targetDirectory };
}

const persistentTask = { cache: false, persistent: true };
const watcherTask = { ...persistentTask, dependsOn: ["dev:prepare"] };
const preparedPackageScripts = {
  scripts: {
    "dev:prepare": "tsdown --no-clean",
    "dev:watch": "tsdown --watch --no-clean",
  },
};

describe("generated development task graph", () => {
  test("renders the Convex web closure with persistent package watchers", async () => {
    const { parentDirectory, targetDirectory } = await renderVariant("with-convex");

    try {
      await Promise.all([
        expectJsonFile(join(targetDirectory, "package.json"), {
          scripts: {
            build: "pnpm run convex:codegen && turbo run build",
            dev: "q9 dev start -- pnpm run dev:run",
            "dev:run": "pnpm run dev:server",
            "dev:prepare": "turbo run dev:prepare --filter=@graph-fixture/web",
            "dev:server":
              "turbo run @graph-fixture/web#dev:server @graph-fixture/convex#dev:convex --concurrency=20",
            "test:convex": "vitest run convex",
            "typecheck:convex": "tsc --noEmit -p convex/tsconfig.json",
            "web:dev": "pnpm --filter @graph-fixture/web run dev",
          },
        }),
        expectJsonFile(join(targetDirectory, "convex.json"), {
          functions: "convex/",
        }),
        expectJsonFile(join(targetDirectory, "apps/web/package.json"), {
          scripts: {
            dev: "pnpm -w exec turbo run @graph-fixture/web#dev:server --concurrency=20",
            "dev:server": "pnpm -w run changelog:export && vite dev",
          },
        }),
        expectJsonFile(join(targetDirectory, "turbo.json"), {
          tasks: {
            "dev:convex": persistentTask,
            "dev:prepare": {
              cache: false,
              dependsOn: ["^dev:prepare"],
              outputs: ["dist/**"],
            },
            "dev:watch": watcherTask,
            "dev:server": {
              ...persistentTask,
              dependsOn: ["^dev:prepare"],
            },
            "@graph-fixture/web#dev:server": {
              ...persistentTask,
              dependsOn: ["^dev:prepare"],
              with: [
                "@graph-fixture/auth#dev:watch",
                "@graph-fixture/convex#dev:watch",
                "@graph-fixture/env#dev:watch",
              ],
            },
          },
        }),
        ...["packages/env", "packages/auth", "packages/convex"].map((packagePath) =>
          expectJsonFile(
            join(targetDirectory, packagePath, "package.json"),
            preparedPackageScripts,
          ),
        ),
        expectJsonFile(join(targetDirectory, "packages/convex/package.json"), {
          private: true,
          scripts: {
            test: "pnpm -w run convex:codegen && pnpm -w run test:convex",
            typecheck: "pnpm -w run convex:codegen && pnpm -w run typecheck:convex",
          },
        }),
      ]);

      const rootManifest = await readFile(join(targetDirectory, "package.json"), "utf8");
      const webManifest = await readFile(join(targetDirectory, "apps/web/package.json"), "utf8");
      const convexSchema = await readFile(join(targetDirectory, "convex/schema.ts"), "utf8");
      const convexIgnore = await readFile(join(targetDirectory, "convex/.gitignore"), "utf8");
      expect(convexSchema).toContain("defineSchema");
      expect(convexIgnore).toContain("_generated/");
      await expect(
        readFile(join(targetDirectory, "packages/convex/convex/schema.ts"), "utf8"),
      ).rejects.toThrow();
      await expect(
        readFile(join(targetDirectory, "packages/convex/.gitignore"), "utf8"),
      ).rejects.toThrow();
      expect(rootManifest).not.toContain("--filter=@graph-fixture/api...");
      expect(webManifest).not.toContain("dev:convex");
      expect(webManifest).not.toContain("dev:watch");
      expect(rootManifest).not.toContain("dev:watch");
    } finally {
      await rm(parentDirectory, { force: true, recursive: true });
    }
  });

  test("renders the Postgres web and API union without recursive server wrappers", async () => {
    const { parentDirectory, targetDirectory } = await renderVariant("without-convex");

    try {
      await Promise.all([
        expectJsonFile(join(targetDirectory, "package.json"), {
          scripts: {
            "api:dev": "turbo run @graph-fixture/api#dev:server --concurrency=20",
            dev: "q9 dev start -- pnpm run dev:run",
            "dev:run": "pnpm run dev:server",
            "dev:prepare":
              "turbo run dev:prepare --filter=@graph-fixture/web --filter=@graph-fixture/api",
            "dev:server":
              "turbo run @graph-fixture/web#dev:server @graph-fixture/api#dev:server --concurrency=20",
            "web:dev": "pnpm --filter @graph-fixture/web run dev",
          },
        }),
        expectJsonFile(join(targetDirectory, "apps/web/package.json"), {
          scripts: {
            dev: "pnpm -w exec turbo run @graph-fixture/web#dev:server --concurrency=20",
            "dev:server": "pnpm -w run changelog:export && vite dev",
          },
        }),
        expectJsonFile(join(targetDirectory, "apps/api/package.json"), {
          scripts: {
            dev: "node --env-file-if-exists=../../.env --import tsx src/main.ts",
            "dev:server": "node --env-file-if-exists=../../.env --import tsx src/main.ts",
          },
        }),
        expectJsonFile(join(targetDirectory, "turbo.json"), {
          tasks: {
            "dev:prepare": {
              cache: false,
              dependsOn: ["^dev:prepare"],
              outputs: ["dist/**"],
            },
            "dev:watch": watcherTask,
            "dev:server": {
              ...persistentTask,
              dependsOn: ["^dev:prepare"],
            },
            "@graph-fixture/web#dev:server": {
              ...persistentTask,
              dependsOn: ["^dev:prepare"],
              with: [
                "@graph-fixture/auth#dev:watch",
                "@graph-fixture/contracts#dev:watch",
                "@graph-fixture/core#dev:watch",
                "@graph-fixture/env#dev:watch",
              ],
            },
            "@graph-fixture/api#dev:server": {
              ...persistentTask,
              dependsOn: ["^dev:prepare"],
              with: [
                "@graph-fixture/contracts#dev:watch",
                "@graph-fixture/core#dev:watch",
                "@graph-fixture/database#dev:watch",
                "@graph-fixture/env#dev:watch",
              ],
            },
          },
        }),
        ...[
          "packages/env",
          "packages/auth",
          "packages/contracts",
          "packages/core",
          "packages/database",
        ].map((packagePath) =>
          expectJsonFile(
            join(targetDirectory, packagePath, "package.json"),
            preparedPackageScripts,
          ),
        ),
      ]);

      const rootManifest = await readFile(join(targetDirectory, "package.json"), "utf8");
      const apiManifest = await readFile(join(targetDirectory, "apps/api/package.json"), "utf8");
      const webManifest = await readFile(join(targetDirectory, "apps/web/package.json"), "utf8");
      const webViteConfig = await readFile(
        join(targetDirectory, "apps/web/vite.config.ts"),
        "utf8",
      );
      expect(rootManifest).not.toContain("dev:convex");
      expect(rootManifest).not.toContain("dev:watch");
      expect(webManifest).not.toContain("dev:watch");
      expect(webViteConfig).toContain('envDir: "../.."');
      expect(webViteConfig).toContain('"PUBLIC_", "APP_ENV", "APP_URL", "SENTRY_DSN"');
      expect(apiManifest).not.toContain('"dev:prepare"');
      expect(apiManifest).not.toContain('"dev:watch"');
    } finally {
      await rm(parentDirectory, { force: true, recursive: true });
    }
  });
});
