import { cp, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { classify } from "../../src/core/classify.js";
import type { CommandResult, GateExec, LaneContext } from "../../src/core/types.js";
import { bundleSize } from "../../src/lanes/bundle-size.js";
import { depcruise } from "../../src/lanes/depcruise.js";
import { contractDrift } from "../../src/lanes/drift.js";
import { envContract } from "../../src/lanes/env-contract.js";
import { migrationSafety } from "../../src/lanes/migration-safety.js";
import { tofu } from "../../src/lanes/tofu.js";
import { versionDrift } from "../../src/lanes/version-drift.js";

function commandResult(command: string, stdout = "", failed = false): CommandResult {
  return {
    command,
    exitCode: failed ? 1 : 0,
    stdout,
    stderr: failed ? "command failed" : "",
    failed,
  };
}

const successfulExec: GateExec = async (command) => commandResult(command);
const typescriptNotCruisedExec: GateExec = async (command, args = []) =>
  args.includes("--version")
    ? commandResult(command, "18.4.0")
    : commandResult(command, JSON.stringify({ modules: [{ source: "src/index.js" }] }));

function context(repoRoot: string, changedFiles: readonly string[], exec: GateExec): LaneContext {
  return {
    repoRoot,
    changedFiles,
    allChangedFiles: changedFiles,
    scope: "full",
    classification: classify(changedFiles),
    target: undefined,
    exec,
  };
}

async function fixture(): Promise<string> {
  return mkdtemp(join(tmpdir(), "q9gate-special-lanes-"));
}

describe("special lane factories", () => {
  it("reports missing tofu as a required tool failure", async () => {
    const root = await fixture();
    await mkdir(join(root, "infra", "stacks", "dev"), { recursive: true });
    const calls: string[] = [];
    const exec: GateExec = async (command, args = []) => {
      calls.push([command, ...args].join(" "));
      return commandResult(command, "", command === "tofu");
    };
    try {
      const result = await tofu().run(context(root, ["infra/stacks/dev/main.tf"], exec));
      expect(result.status).toBe("failed");
      expect(result.findings?.[0]?.rule).toBe("missing-tool");
      expect(calls[0]).toBe("tofu --version");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("initializes each stack before validating it", async () => {
    const root = await fixture();
    await mkdir(join(root, "infra", "stacks", "dev"), { recursive: true });
    const calls: string[] = [];
    const exec: GateExec = async (command, args = []) => {
      calls.push([command, ...args].join(" "));
      return commandResult(command, "", command === "tflint" || command === "trivy");
    };
    try {
      const result = await tofu().run(context(root, ["infra/stacks/dev/main.tf"], exec));
      expect(result.status).toBe("passed");
      const stackPath = join(root, "infra", "stacks", "dev");
      const initIndex = calls.indexOf(`tofu -chdir=${stackPath} init -backend=false -input=false`);
      const validateIndex = calls.indexOf(`tofu -chdir=${stackPath} validate`);
      expect(initIndex).toBeGreaterThan(-1);
      expect(validateIndex).toBeGreaterThan(initIndex);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reports a failed stack init and skips validation for that stack", async () => {
    const root = await fixture();
    await mkdir(join(root, "infra", "stacks", "dev"), { recursive: true });
    const calls: string[] = [];
    const exec: GateExec = async (command, args = []) => {
      calls.push([command, ...args].join(" "));
      const isInit = command === "tofu" && args.includes("init");
      return commandResult(command, "", isInit || command === "tflint" || command === "trivy");
    };
    try {
      const result = await tofu().run(context(root, ["infra/stacks/dev/main.tf"], exec));
      expect(result.status).toBe("failed");
      expect(result.findings?.some((item) => item.rule === "tofu-init")).toBe(true);
      expect(calls.some((call) => call.endsWith(" validate"))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("restores generated contract files after detecting drift", async () => {
    const root = await fixture();
    const calls: string[] = [];
    let statusCount = 0;
    const exec: GateExec = async (command, args = []) => {
      calls.push([command, ...args].join(" "));
      if (command === "git" && args[0] === "status") {
        statusCount += 1;
        return commandResult(command, statusCount === 1 ? "" : " M generated.ts\n");
      }
      if (command === "git" && args[0] === "diff" && args[1] === "--name-only") {
        return commandResult(command, "generated.ts\n");
      }
      if (command === "git" && args[0] === "diff") {
        return commandResult(command, "generated output differs\n");
      }
      return commandResult(command);
    };
    try {
      const result = await contractDrift({
        generate: "pnpm contracts:generate",
        paths: ["generated.ts"],
      }).run(context(root, ["packages/contracts/schema.ts"], exec));
      expect(result.status).toBe("failed");
      expect(result.findings?.some((item) => item.rule === "generated-drift")).toBe(true);
      expect(calls).toContain("git checkout -- generated.ts");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("honors id and title overrides for a second drift lane", () => {
    const lane = contractDrift({
      generate: "pnpm contracts:generate",
      paths: ["openapi.json"],
      id: "openapi-drift",
      title: "Generated OpenAPI drift",
    });
    expect(lane.id).toBe("openapi-drift");
    expect(lane.title).toBe("Generated OpenAPI drift");
    expect(contractDrift({ generate: "pnpm i18n:extract" }).id).toBe("contract-drift");
  });

  it("compares schema keys with JSONC and TOML including per-environment vars", async () => {
    const root = await fixture();
    await mkdir(join(root, "infra", "stacks", "dev"), { recursive: true });
    await writeFile(
      join(root, "schema.mjs"),
      'export function keys() { return ["API_KEY", "PUBLIC_URL", "PREVIEW_ONLY", "PRODUCTION_ONLY"]; }\n',
    );
    await cp(
      resolve(import.meta.dirname, "../fixtures/env-contract/wrangler.jsonc"),
      join(root, "wrangler.jsonc"),
    );
    await cp(
      resolve(import.meta.dirname, "../fixtures/env-contract/wrangler.toml"),
      join(root, "wrangler.toml"),
    );
    await writeFile(
      join(root, ".env.example"),
      "API_KEY=\nPUBLIC_URL=\nPREVIEW_ONLY=\nPRODUCTION_ONLY=\n",
    );
    await writeFile(
      join(root, "infra/stacks/dev/outputs.tf"),
      'output "API_KEY" {}\noutput "PUBLIC_URL" {}\noutput "PREVIEW_ONLY" {}\noutput "PRODUCTION_ONLY" {}\n',
    );
    try {
      const result = await envContract({
        schema: "schema.mjs",
        sources: ["wrangler.jsonc", "wrangler.toml", ".env.example", "infra/stacks/*/outputs.tf"],
      }).run(context(root, ["wrangler.jsonc", "wrangler.toml"], successfulExec));
      expect(result.status).toBe("passed");
      expect(result.metrics?.missingEnvKeys).toBe(0);
      expect(result.metrics?.unexpectedEnvKeys).toBe(0);
      expect(result.metrics?.filesChecked).toBe(4);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails when TypeScript sources exist but dependency-cruiser reports none", async () => {
    const root = await fixture();
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src/index.ts"), "export const value = true;\n");

    try {
      const result = await depcruise().run(
        context(root, ["src/index.ts"], typescriptNotCruisedExec),
      );
      expect(result.status).toBe("failed");
      expect(result.findings?.[0]?.rule).toBe("typescript-not-cruised");
      expect(result.findings?.[0]?.message).toContain("install TypeScript <7");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("forbids server-only keys in scoped sources while exempting their absence", async () => {
    const root = await fixture();
    await writeFile(
      join(root, "schema.mjs"),
      'export function keys() { return ["API_KEY", "DATABASE_URL"]; }\n',
    );
    await writeFile(join(root, "wrangler.jsonc"), '{ "vars": { "API_KEY": "x" } }\n');
    await writeFile(join(root, ".env.example"), "API_KEY=\nDATABASE_URL=\n");
    try {
      const passed = await envContract({
        schema: "schema.mjs",
        sources: [{ glob: "wrangler.jsonc", forbid: ["DATABASE_URL"] }, ".env.example"],
      }).run(context(root, ["wrangler.jsonc"], successfulExec));
      expect(passed.status).toBe("passed");

      await writeFile(
        join(root, "wrangler.jsonc"),
        '{ "vars": { "API_KEY": "x", "DATABASE_URL": "leak" } }\n',
      );
      const failed = await envContract({
        schema: "schema.mjs",
        sources: [{ glob: "wrangler.jsonc", forbid: ["DATABASE_URL"] }, ".env.example"],
      }).run(context(root, ["wrangler.jsonc"], successfulExec));
      expect(failed.status).toBe("failed");
      expect(failed.findings?.some((item) => item.rule === "forbidden-key")).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails unsafe SQL migrations and measures scanned files", async () => {
    const root = await fixture();
    await mkdir(join(root, "migrations"), { recursive: true });
    await writeFile(join(root, "migrations/001.sql"), "ALTER TABLE users DROP COLUMN email;\n");
    try {
      const result = await migrationSafety({ dir: "migrations" }).run(
        context(root, ["migrations/001.sql"], successfulExec),
      );
      expect(result.status).toBe("failed");
      expect(result.metrics?.unsafeMigrations).toBe(1);
      expect(result.findings?.[0]?.line).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails a bundle whose gzip output exceeds its human-readable budget", async () => {
    const root = await fixture();
    await mkdir(join(root, "web", "dist"), { recursive: true });
    await writeFile(join(root, "web/dist/index.js"), "const bundle = 'a'.repeat(10000);\n");
    try {
      const result = await bundleSize({ budgets: { web: "1 B" } }).run(
        context(root, ["web/src/index.ts"], successfulExec),
      );
      expect(result.status).toBe("failed");
      expect(result.metrics?.gzipBytes).toBeGreaterThan(1);
      expect(result.findings?.[0]?.rule).toBe("bundle-budget");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("measures only the files matched by a glob budget target", async () => {
    const root = await fixture();
    await mkdir(join(root, "web", "dist", "client", "assets"), { recursive: true });
    const font = Array.from({ length: 20000 }, (_, index) => `${index * 2654435761}`).join("|");
    await writeFile(join(root, "web/dist/client/assets/app.js"), "export const app = 1;\n");
    await writeFile(join(root, "web/dist/client/assets/font.woff2"), font);
    try {
      const result = await bundleSize({
        budgets: { "web/dist/client/assets/*.{js,css}": "1 kB" },
      }).run(context(root, ["web/src/index.ts"], successfulExec));
      expect(result.status).toBe("passed");
      expect(result.metrics?.gzipBytes).toBeLessThan(1000);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("finds catalog mismatches and duplicate dependency majors", async () => {
    const root = await fixture();
    await mkdir(join(root, "packages", "one"), { recursive: true });
    await mkdir(join(root, "packages", "two"), { recursive: true });
    await writeFile(
      join(root, "pnpm-workspace.yaml"),
      "packages:\n  - packages/*\n\ncatalog:\n  foo: ^1.2.0\n  two: 0.1.0\n  react: 19.2.7\n",
    );
    await writeFile(join(root, "package.json"), '{"name":"fixture","private":true}\n');
    await writeFile(
      join(root, "packages/one/package.json"),
      '{"name":"one","dependencies":{"foo":"^1.2.0","two":"workspace:*"},"peerDependencies":{"react":">=19"}}\n',
    );
    await writeFile(
      join(root, "packages/two/package.json"),
      '{"name":"two","dependencies":{"foo":"^2.0.0"},"devDependencies":{"react":"^19.0.0"}}\n',
    );
    await mkdir(join(root, "packages", "three"), { recursive: true });
    await writeFile(
      join(root, "packages/three/package.json"),
      '{"name":"three","dependencies":{"foo":"link:../../vendor/foo"}}\n',
    );
    try {
      const result = await versionDrift().run(
        context(root, ["packages/one/package.json"], successfulExec),
      );
      expect(result.status).toBe("failed");
      expect(result.metrics?.versionMismatches).toBe(2);
      expect(result.findings?.some((item) => item.file === "packages/three/package.json")).toBe(
        false,
      );
      expect(result.metrics?.duplicateMajors).toBe(1);
      expect(
        result.findings?.some(
          (item) =>
            item.rule === "catalog-mismatch" &&
            item.file === "packages/one/package.json" &&
            item.message.includes("react uses >=19"),
        ),
      ).toBe(false);
      expect(
        result.findings?.some(
          (item) =>
            item.rule === "catalog-mismatch" &&
            item.file === "packages/two/package.json" &&
            item.message.includes("react uses ^19.0.0"),
        ),
      ).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
