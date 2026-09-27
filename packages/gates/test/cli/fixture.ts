import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { executeCommand } from "../../src/adapters/process.js";

const gateConfig = `
const hygiene = {
  id: "hygiene",
  title: "Hygiene",
  triggers: () => "always required",
  run: async () => ({ status: "passed" }),
};

const custom = {
  id: "fixture-custom",
  title: "Fixture custom lane",
  triggers: ({ classification }) =>
    classification.changedFiles.length > 0 ? "fixture files changed" : false,
  run: async () => ({ status: "passed", metrics: { filesChecked: 1 } }),
  baseline: { path: "gates/baselines/fixture-custom.json" },
};

export default {
  workspaceRoots: ["src"],
  concurrency: 2,
  lanes: [hygiene, custom],
};
`;

async function git(repoRoot: string, args: readonly string[]): Promise<void> {
  const result = await executeCommand("git", args, { cwd: repoRoot });
  if (result.failed) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(" ")} failed`);
  }
}

export async function createFixtureRepo(): Promise<string> {
  const repoRoot = await mkdtemp(join(tmpdir(), "q9gate-fixture-"));
  await mkdir(join(repoRoot, "src"), { recursive: true });
  await mkdir(join(repoRoot, "gates", "baselines"), { recursive: true });
  await writeFile(join(repoRoot, "gate.config.ts"), gateConfig, "utf8");
  await writeFile(
    join(repoRoot, "package.json"),
    `${JSON.stringify({ name: "q9gate-fixture", private: true, scripts: {} }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(join(repoRoot, "src", "index.ts"), "export const answer = 42;\n", "utf8");
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
    "gates/baselines/fixture-custom.json",
  ]);
  await git(repoRoot, ["commit", "-m", "test: seed fixture"]);
  return repoRoot;
}
