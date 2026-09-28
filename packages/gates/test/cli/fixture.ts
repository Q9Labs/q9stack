import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { executeCommand } from "../../src/adapters/process.js";

const gateConfig = (includeTargetContext: boolean) => `
const hygiene = {
  id: "hygiene",
  title: "Hygiene",
  triggers: "always",
  run: async () => ({ status: "passed" }),
};

const custom = {
  id: "fixture-custom",
  title: "Fixture custom lane",
  triggers: ({ classification }) =>
    classification.changedFiles.length > 0 ? classification.changedFiles.join(", ") + " changed" : false,
  run: async ({ changedFiles, workspaceRoots }) => {
    const isSingleDocsTarget = changedFiles.length === 1 && changedFiles[0] === "docs/guide.md";
    const targetWasNarrowed = workspaceRoots?.length === 1 && workspaceRoots[0] === "docs";
    return {
      status: isSingleDocsTarget && !targetWasNarrowed ? "failed" : "passed",
      metrics: { filesChecked: changedFiles.length },
    };
  },
  baseline: { path: "gates/baselines/fixture-custom.json" },
};

const targetContext = {
  id: "target-context",
  title: "Target context",
  triggers: ({ target, changedFiles, allChangedFiles }) =>
    target === "web" &&
    changedFiles.length === 1 &&
    changedFiles[0] === "src/index.ts" &&
    allChangedFiles.length === 2 &&
    allChangedFiles.includes("src/index.ts") &&
    allChangedFiles.includes("docs/guide.md")
      ? "target context exposed"
      : false,
  run: async ({ target, changedFiles, allChangedFiles }) => {
    const contextMatches =
      target === "web" &&
      changedFiles.length === 1 &&
      changedFiles[0] === "src/index.ts" &&
      allChangedFiles.length === 2 &&
      allChangedFiles.includes("src/index.ts") &&
      allChangedFiles.includes("docs/guide.md");
    return { status: contextMatches ? "passed" : "failed" };
  },
};

export default {
  workspaceRoots: ["src", "docs"],
  targets: { web: ["src"], docs: ["docs"] },
  concurrency: 2,
  lanes: [hygiene, custom${includeTargetContext ? ", targetContext" : ""}],
};
`;

async function git(repoRoot: string, args: readonly string[]): Promise<void> {
  const result = await executeCommand("git", args, { cwd: repoRoot });
  if (result.failed) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(" ")} failed`);
  }
}

export async function createFixtureRepo(includeTargetContext = false): Promise<string> {
  const repoRoot = await mkdtemp(join(tmpdir(), "q9gate-fixture-"));
  await mkdir(join(repoRoot, "src"), { recursive: true });
  await mkdir(join(repoRoot, "docs"), { recursive: true });
  await mkdir(join(repoRoot, "gates", "baselines"), { recursive: true });
  await writeFile(join(repoRoot, "gate.config.ts"), gateConfig(includeTargetContext), "utf8");
  await writeFile(
    join(repoRoot, "package.json"),
    `${JSON.stringify({ name: "q9gate-fixture", private: true, scripts: {} }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(join(repoRoot, "src", "index.ts"), "export const answer = 42;\n", "utf8");
  await writeFile(join(repoRoot, "src", "other.ts"), "export const fixture = true;\n", "utf8");
  await writeFile(join(repoRoot, "docs", "guide.md"), "# Fixture guide\n", "utf8");
  await writeFile(
    join(repoRoot, "gates", "baselines", "fixture-custom.json"),
    `${JSON.stringify({ count: 0, entries: [], acceptedAt: "2026-01-01T00:00:00.000Z", message: "seed" }, null, 2)}\n`,
    "utf8",
  );
  await git(repoRoot, ["init"]);
  await git(repoRoot, ["config", "user.email", "fixture@example.test"]);
  await git(repoRoot, ["config", "user.name", "q9gate fixture"]);
  await git(repoRoot, [
    "add",
    "gate.config.ts",
    "package.json",
    "src/index.ts",
    "src/other.ts",
    "docs/guide.md",
    "gates/baselines/fixture-custom.json",
  ]);
  await git(repoRoot, ["commit", "-m", "test: seed fixture"]);
  return repoRoot;
}
