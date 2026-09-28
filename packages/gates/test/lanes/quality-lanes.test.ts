// cspell:ignore adress pathspecs
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import fc from "fast-check";
import { describe, expect, it, afterEach } from "vitest";

import { executeCommand } from "../../src/adapters/process.js";
import type { CommandResult, GateExec, LaneContext } from "../../src/core/types.js";
import { cspell } from "../../src/lanes/cspell.js";
import { fallow } from "../../src/lanes/fallow.js";
import { hygiene } from "../../src/lanes/hygiene.js";
import { osv } from "../../src/lanes/osv.js";
import { reactDoctor } from "../../src/lanes/react-doctor.js";
import { testPresence } from "../../src/lanes/test-presence.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "q9-gates-lane-"));
  roots.push(root);
  return root;
}

function result(command: string, stdout = "", stderr = "", failed = false): CommandResult {
  return {
    command,
    exitCode: failed ? 1 : 0,
    stdout,
    stderr,
    failed,
  };
}

function context(
  root: string,
  exec: GateExec,
  changedFiles: readonly string[] = [],
  scope: LaneContext["scope"] = "branch",
  explicitFileSelection = false,
  base: string | null = "base-ref",
): LaneContext {
  return {
    repoRoot: root,
    exec,
    changedFiles,
    allChangedFiles: changedFiles,
    classification: {
      changedFiles,
      categories: [],
      unclassifiedFiles: [],
      docsOnly: false,
      fullRequired: false,
    },
    scope,
    target: undefined,
    ...(explicitFileSelection ? { explicitFileSelection } : {}),
    ...(base === null ? {} : { base }),
  };
}

function fakeExec(
  handler: (command: string, args: readonly string[], input: string) => CommandResult,
): GateExec {
  return async (command, args = [], options = {}) => handler(command, args, options.input ?? "");
}

const reactScanExec: GateExec = async (command, args, options) =>
  command === process.execPath
    ? executeCommand(command, args, options)
    : result(`${command} --version`, "1.0.0\n");

describe("quality lanes", () => {
  it("passes Fallow with changed scope and existing baseline flags", async () => {
    const root = await fixture();
    await mkdir(join(root, "gates", "baselines", "fallow"), { recursive: true });
    await writeFile(join(root, "gates", "baselines", "fallow", "dead-code.json"), "{}\n");
    const calls: string[][] = [];
    const exec = fakeExec((command, args) => {
      calls.push([command, ...args]);
      if (command === "fallow" && args[0] === "--version") {
        return result("fallow --version", "2.101.0\n");
      }
      return result(`fallow ${args.join(" ")}`, "dead code: 0\n");
    });

    const laneResult = await fallow().run(context(root, exec, ["packages/a.ts"]));

    expect(laneResult.status).toBe("passed");
    expect(
      calls.some((call) => call.includes("--changed-since") && call.includes("base-ref")),
    ).toBe(true);
    expect(calls.some((call) => call.includes("--dead-code-baseline"))).toBe(true);
    expect(calls.some((call) => call.includes("ls-files"))).toBe(false);
  });

  it("restricts Fallow's staged diff to explicit literal Git path arguments", async () => {
    const root = await fixture();
    const calls: string[][] = [];
    let fallowInput = "";
    const exec = fakeExec((command, args, input) => {
      calls.push([command, ...args]);
      if (command === "fallow" && args[0] === "--version") {
        return result("fallow --version", "2.101.0\n");
      }
      if (command === "git") {
        if (args[0] === "merge-base") {
          return result(`git ${args.join(" ")}`, "merge-base-sha\n");
        }
        return result(`git ${args.join(" ")}`, args.includes("ls-files") ? "" : "selected diff\n");
      }
      fallowInput = input;
      return result(`fallow ${args.join(" ")}`, "dead code: 0\n");
    });

    const laneResult = await fallow().run(context(root, exec, ["src/selected.ts"], "staged", true));

    expect(laneResult.status).toBe("passed");
    expect(calls.find((call) => call[0] === "git" && call.includes("diff"))).toEqual([
      "git",
      "--literal-pathspecs",
      "diff",
      "merge-base-sha",
      "--no-ext-diff",
      "--binary",
      "--",
      "src/selected.ts",
    ]);
    expect(calls.filter((call) => call[0] === "git" && call.includes("diff"))).toHaveLength(1);
    expect(fallowInput).toBe("selected diff\n");
  });

  it("restricts Fallow's branch diff to explicit literal Git path arguments", async () => {
    const root = await fixture();
    const calls: string[][] = [];
    let fallowInput = "";
    const exec = fakeExec((command, args, input) => {
      calls.push([command, ...args]);
      if (command === "fallow" && args[0] === "--version") {
        return result("fallow --version", "2.101.0\n");
      }
      if (command === "git") {
        if (args[0] === "merge-base") {
          return result(`git ${args.join(" ")}`, "merge-base-sha\n");
        }
        return result(
          `git ${args.join(" ")}`,
          args.includes("ls-files") ? "" : "selected branch diff\n",
        );
      }
      fallowInput = input;
      return result(`fallow ${args.join(" ")}`, "dead code: 0\n");
    });

    const laneResult = await fallow().run(context(root, exec, ["src/selected.ts"], "branch", true));

    expect(laneResult.status).toBe("passed");
    expect(calls.find((call) => call[0] === "git" && call.includes("diff"))).toEqual([
      "git",
      "--literal-pathspecs",
      "diff",
      "merge-base-sha",
      "--no-ext-diff",
      "--binary",
      "--",
      "src/selected.ts",
    ]);
    expect(calls.filter((call) => call[0] === "git" && call.includes("diff"))).toHaveLength(1);
    expect(calls.find((call) => call[0] === "fallow" && call[1] === "audit")).toContain(
      "--changed-since",
    );
    expect(fallowInput).toBe("selected branch diff\n");
  });

  it("uses one final-tree diff when unstaged edits shift committed lines", async () => {
    const root = await fixture();
    const git = async (args: readonly string[]) => {
      const command = await executeCommand("git", args, { cwd: root });
      expect(command.failed).toBe(false);
      return command;
    };
    await git(["init", "--quiet"]);
    await git(["config", "user.name", "Q9 Gates Test"]);
    await git(["config", "user.email", "gates-test@example.com"]);
    const selectedPath = "src/selected.ts";
    await mkdir(join(root, "src"), { recursive: true });
    const initialSource = "export const baseline = true;\n";
    await writeFile(join(root, selectedPath), initialSource);
    await git(["add", selectedPath]);
    await git(["commit", "--quiet", "-m", "initial"]);
    const base = (await git(["rev-parse", "HEAD"])).stdout.trim();

    const branchSource = `${initialSource}\nexport function complicated(value: number): number {
  if (value > 2) return value;
  if (value > 1) return value;
  if (value > 0) return value;
  return 0;
}
`;
    await writeFile(join(root, selectedPath), branchSource);
    await git(["add", selectedPath]);
    await git(["commit", "--quiet", "-m", "branch change"]);
    const padding = Array.from({ length: 100 }, (_, index) => `// padding ${index + 1}`).join("\n");
    await writeFile(join(root, selectedPath), `${padding}\n${branchSource}`);

    let fallowInput = "";
    const exec: GateExec = async (command, args = [], options = {}) => {
      if (command === "git") {
        return executeCommand(command, args, { ...options, cwd: root });
      }
      if (command === "fallow" && args[0] === "--version") {
        return result("fallow --version", "2.101.0\n");
      }
      fallowInput = options.input ?? "";
      return fallowInput.includes("+export function complicated")
        ? result(
            `fallow ${args.join(" ")}`,
            "src/selected.ts:102:1 complexity complicated\n",
            "",
            true,
          )
        : result(`fallow ${args.join(" ")}`, "dead code: 0\n");
    };

    const laneResult = await fallow().run({
      ...context(root, exec, [selectedPath], "branch", true),
      base,
    });

    expect(laneResult.status).toBe("failed");
    expect(fallowInput.split("diff --git ")).toHaveLength(2);
    expect(fallowInput).toContain("+export function complicated");
  });

  it("keeps explicit Fallow files scoped during a full gate run", async () => {
    const root = await fixture();
    const calls: string[][] = [];
    let fallowInput = "";
    const exec = fakeExec((command, args, input) => {
      calls.push([command, ...args]);
      if (command === "fallow" && args[0] === "--version") {
        return result("fallow --version", "2.101.0\n");
      }
      if (command === "git" && args[0] === "merge-base") {
        return result(`git ${args.join(" ")}`, "merge-base-sha\n");
      }
      if (command === "git" && args.includes("ls-files")) {
        return result(`git ${args.join(" ")}`, "");
      }
      if (command === "git") {
        return result(`git ${args.join(" ")}`, "selected full diff\n");
      }
      fallowInput = input;
      return result(`fallow ${args.join(" ")}`, "dead code: 0\n");
    });

    const laneResult = await fallow().run(context(root, exec, ["src/selected.ts"], "full", true));

    expect(laneResult.status).toBe("passed");
    expect(fallowInput).toBe("selected full diff\n");
    expect(calls.filter((call) => call[0] === "git" && call.includes("diff"))).toHaveLength(1);
  });

  it("fails Fallow when an explicitly selected untracked file has a finding", async () => {
    const root = await fixture();
    await executeCommand("git", ["init", "--quiet", "--initial-branch", "main"], { cwd: root });
    await executeCommand("git", ["config", "user.name", "Q9 Gates Test"], { cwd: root });
    await executeCommand("git", ["config", "user.email", "gates-test@example.com"], {
      cwd: root,
    });
    await writeFile(join(root, "tracked.ts"), "export const tracked = true;\n");
    await executeCommand("git", ["add", "tracked.ts"], { cwd: root });
    await executeCommand("git", ["commit", "--quiet", "-m", "initial"], { cwd: root });
    const selectedPath = "src/selected.ts";
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, selectedPath), "export const unreferenced = true;\n");

    let fallowInput = "";
    const gitCalls: string[][] = [];
    const exec: GateExec = async (command, args = [], options = {}) => {
      if (command === "git") {
        gitCalls.push([...args]);
        return executeCommand(command, args, { ...options, cwd: root });
      }
      if (command === "fallow" && args[0] === "--version") {
        return result("fallow --version", "2.101.0\n");
      }
      fallowInput = options.input ?? "";
      return fallowInput.includes("+export const unreferenced = true")
        ? result(
            `fallow ${args.join(" ")}`,
            "src/selected.ts:1:1 dead-code unreferenced\n",
            "",
            true,
          )
        : result(`fallow ${args.join(" ")}`, "dead code: 0\n");
    };

    const laneResult = await fallow().run({
      ...context(root, exec, [selectedPath], "branch", true, null),
    });

    expect(laneResult.status).toBe("failed");
    expect(gitCalls.find((call) => call[0] === "merge-base")).toEqual([
      "merge-base",
      "main",
      "HEAD",
    ]);
    expect(fallowInput).toContain("+export const unreferenced = true");
  });

  it("falls back to the root commit when no audit base ref is detectable", async () => {
    const root = await fixture();
    const calls: string[][] = [];
    const exec = fakeExec((command, args) => {
      calls.push([command, ...args]);
      if (command === "git" && args[0] === "rev-parse") {
        return result("git rev-parse", "", "no such ref", true);
      }
      if (command === "git" && args[0] === "rev-list") {
        return result("git rev-list", "rootsha\n");
      }
      if (command === "fallow" && args[0] === "--version") {
        return result("fallow --version", "2.101.0\n");
      }
      return result(`fallow ${args.join(" ")}`, "dead code: 0\n");
    });

    const fullContext: LaneContext = {
      repoRoot: root,
      exec,
      changedFiles: ["packages/a.ts"],
      allChangedFiles: ["packages/a.ts"],
      classification: {
        changedFiles: ["packages/a.ts"],
        categories: [],
        unclassifiedFiles: [],
        docsOnly: false,
        fullRequired: false,
      },
      scope: "full",
      target: undefined,
    };
    const laneResult = await fallow().run(fullContext);

    expect(laneResult.status).toBe("passed");
    expect(
      calls.some(
        (call) =>
          call[0] === "fallow" && call.includes("--changed-since") && call.includes("rootsha"),
      ),
    ).toBe(true);
  });

  it("deduplicates OSV findings before comparing them with the baseline", async () => {
    const root = await fixture();
    await writeFile(join(root, "osv-baseline.json"), '{"entries": []}\n');
    const report = {
      results: [
        {
          source: { path: "packages/a/pnpm-lock.yaml" },
          packages: [
            {
              package: { ecosystem: "npm", name: "unsafe", version: "1.0.0" },
              vulnerabilities: [{ id: "GHSA-test", summary: "Test issue" }],
            },
            {
              package: { ecosystem: "npm", name: "unsafe", version: "1.0.0" },
              vulnerabilities: [{ id: "GHSA-test", summary: "Test issue" }],
            },
          ],
        },
      ],
    };
    const exec = fakeExec((command, args) => {
      if (command === "osv-scanner" && args[0] === "--version") {
        return result("osv-scanner --version", "2.3.8\n");
      }
      return result("osv-scanner scan", JSON.stringify(report));
    });

    const laneResult = await osv().run(context(root, exec, ["package.json"]));

    expect(laneResult.status).toBe("failed");
    expect(laneResult.metrics?.vulnerabilities).toBe(1);
    expect(laneResult.findings).toHaveLength(1);
  });

  it("matches OSV sources and repository roots through symlinked temp paths", async () => {
    const root = await fixture();
    const symlinkRoot = `${root}-alias`;
    roots.push(symlinkRoot);
    await symlink(root, symlinkRoot, "dir");
    await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    await writeFile(
      join(root, "osv-baseline.json"),
      `${JSON.stringify(
        {
          entries: [
            {
              ecosystem: "npm",
              id: "GHSA-test",
              package: "unsafe",
              severity: "UNKNOWN",
              source: "pnpm-lock.yaml",
              summary: "",
              version: "1.0.0",
            },
          ],
        },
        null,
        2,
      )}\n`,
    );
    let sourcePath = join(symlinkRoot, "pnpm-lock.yaml");
    const report = () => ({
      results: [
        {
          source: { path: sourcePath },
          packages: [
            {
              package: { ecosystem: "npm", name: "unsafe", version: "1.0.0" },
              vulnerabilities: [{ id: "GHSA-test" }],
            },
          ],
        },
      ],
    });
    const exec = fakeExec((command, args) =>
      command === "osv-scanner" && args[0] === "--version"
        ? result("osv-scanner --version", "2.3.8\n")
        : result("osv-scanner scan", JSON.stringify(report())),
    );

    const sourceSymlinkResult = await osv().run(context(root, exec, ["pnpm-lock.yaml"]));
    sourcePath = join(root, "pnpm-lock.yaml");
    const rootSymlinkResult = await osv().run(context(symlinkRoot, exec, ["pnpm-lock.yaml"]));

    expect(sourceSymlinkResult.status).toBe("passed");
    expect(rootSymlinkResult.status).toBe("passed");
  });

  it("lets OSV exclude configuration replace the default directories", async () => {
    const root = await fixture();
    await writeFile(join(root, "osv-baseline.json"), '{"entries":[]}\n');
    const captures: string[][] = [];
    const exec = fakeExec((command, args) => {
      if (command === "osv-scanner" && args[0] === "--version") {
        return result("osv-scanner --version", "2.3.8\n");
      }
      if (command === "osv-scanner" && args[0] === "scan") {
        captures.push([...args]);
      }
      return result(`${command} ${args.join(" ")}`, '{"results":[]}\n');
    });

    expect((await osv().run(context(root, exec, ["package.json"]))).status).toBe("passed");
    expect(
      (
        await osv({ exclude: ["scratchpad", ".claude/worktrees"] }).run(
          context(root, exec, ["package.json"]),
        )
      ).status,
    ).toBe("passed");
    expect((await osv({ exclude: [] }).run(context(root, exec, ["package.json"]))).status).toBe(
      "passed",
    );

    expect(captures[0]).toEqual([
      "scan",
      "source",
      "-r",
      "--experimental-exclude",
      "scratchpad",
      "--experimental-exclude",
      ".worktrees",
      "--format",
      "json",
      ".",
    ]);
    expect(captures[1]).toEqual([
      "scan",
      "source",
      "-r",
      "--experimental-exclude",
      "scratchpad",
      "--experimental-exclude",
      ".claude/worktrees",
      "--format",
      "json",
      ".",
    ]);
    expect(captures[2]).toEqual(["scan", "source", "-r", "--format", "json", "."]);
  });

  it("ratchets only new normalized CSpell issue lines", async () => {
    const root = await fixture();
    await writeFile(join(root, "cspell-baseline.txt"), "src/a.ts:1:2:teh\n");
    const exec = fakeExec((command, args, input) => {
      if (command === "cspell" && args[0] === "--version") {
        return result("cspell --version", "9.0.0\n");
      }
      if (command === "git" && args.includes("--deleted")) {
        return result("git ls-files --deleted", "src/gone.ts\n");
      }
      if (command === "git") {
        expect(input).toBe("");
        return result("git ls-files", "src/a.ts\nsrc/b.ts\nsrc/gone.ts\n");
      }
      expect(input).toBe("src/a.ts\nsrc/b.ts");
      return result("cspell lint", "src/b.ts:2:1:adress\nsrc/a.ts:1:2:teh\nsrc/b.ts:2:1:adress\n");
    });

    const laneResult = await cspell().run(context(root, exec, ["README.md"]));

    expect(laneResult.status).toBe("failed");
    expect(laneResult.metrics?.spellingIssues).toBe(2);
    expect(laneResult.findings?.map((finding) => finding.file)).toEqual(["src/b.ts"]);
  });

  it("normalizes arbitrary CSpell output into unique issue metrics", async () => {
    const root = await fixture();
    await writeFile(join(root, "cspell-baseline.txt"), "\n");
    const issues = ["src/a.ts:1:2:teh", "src/b.ts:2:1:adress"] as const;

    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom(...issues), { minLength: 1, maxLength: 8 }),
        async (output) => {
          const laneExec = fakeExec((command, args) => {
            if (command === "cspell" && args[0] === "--version") {
              return result("cspell --version", "9.0.0\n");
            }
            if (command === "git") {
              return args.includes("--deleted")
                ? result("git ls-files --deleted", "")
                : result("git ls-files", "src/a.ts\nsrc/b.ts\n");
            }
            return result("cspell lint", output.join("\n"));
          });
          const laneResult = await cspell().run(context(root, laneExec));
          expect(laneResult.metrics?.spellingIssues).toBe(new Set(output).size);
        },
      ),
    );
  });

  it("recognizes nearby tests and tests that import a source file", async () => {
    const root = await fixture();
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "thing.ts"), "export const thing = 1;\n");
    await writeFile(
      join(root, "src", "thing.test.ts"),
      'import { thing } from "./thing";\nvoid thing;\n',
    );
    const exec = fakeExec((command) =>
      command === "git"
        ? result("git ls-files", "src/thing.ts\nsrc/thing.test.ts\n")
        : result(command),
    );

    const laneResult = await testPresence({ sourceRoots: ["src"] }).run(context(root, exec));

    expect(laneResult.status).toBe("passed");
    expect(laneResult.metrics?.missingTests).toBe(0);
  });

  it("reports hygiene placeholders and missing aliases", async () => {
    const root = await fixture();
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ scripts: { test: "echo ok", build: "tsc" } }),
    );
    await writeFile(join(root, "gate.config.ts"), 'run("pnpm run missing");\n');
    const exec = fakeExec((command) => result(command));

    const laneResult = await hygiene().run(context(root, exec));
    const rules = laneResult.findings?.map((finding) => finding.rule) ?? [];

    expect(laneResult.status).toBe("failed");
    expect(rules).toContain("placeholder-script");
    expect(rules).toContain("missing-script");
  });

  it("returns install hints when React tools are unavailable", async () => {
    const root = await fixture();
    const exec = fakeExec((command) =>
      command === "react-doctor" || command === "react-scan"
        ? result(`${command} --version`, "", "not found", true)
        : result(command),
    );

    const laneResult = await reactDoctor().run(context(root, exec, ["apps/web/src/page.tsx"]));
    const messages = laneResult.findings?.map((finding) => finding.message).join("\n") ?? "";

    expect(laneResult.status).toBe("failed");
    expect(messages).toContain("pnpm add -D react-doctor");
    expect(messages).toContain("pnpm add -D react-scan");
  });

  it("passes a known base to React Doctor during a full run", async () => {
    const root = await fixture();
    const calls: string[][] = [];
    const exec = fakeExec((command, args) => {
      calls.push([command, ...args]);
      return result(`${command} ${args.join(" ")}`);
    });

    const laneResult = await reactDoctor().run(
      context(root, exec, ["apps/web/src/page.tsx"], "full", false, "base-ref"),
    );
    const doctorCall = calls.find((call) => call[0] === "react-doctor" && call[1] === ".");

    expect(laneResult.status).toBe("passed");
    expect(doctorCall).toContain("--base");
    expect(doctorCall).toContain("base-ref");
  });

  it("does not pass a base to React Doctor during a full run when none is known", async () => {
    const root = await fixture();
    const calls: string[][] = [];
    const exec = fakeExec((command, args) => {
      calls.push([command, ...args]);
      return result(`${command} ${args.join(" ")}`);
    });

    await reactDoctor().run(context(root, exec, ["apps/web/src/page.tsx"], "full", false, null));
    const doctorCall = calls.find((call) => call[0] === "react-doctor" && call[1] === ".");

    expect(doctorCall).not.toContain("--base");
  });

  it("passes with an optional-tool finding when only react-scan is unavailable", async () => {
    const root = await fixture();
    const exec = fakeExec((command) =>
      command === "react-scan"
        ? result(`${command} --version`, "", "not found", true)
        : result(command),
    );

    const laneResult = await reactDoctor().run(context(root, exec, ["apps/web/src/page.tsx"]));
    const rules = laneResult.findings?.map((finding) => finding.rule) ?? [];

    expect(laneResult.status).toBe("passed");
    expect(rules).toContain("optional-tool");
  });

  it("fails when react-scan is unavailable and the CLI is required", async () => {
    const root = await fixture();
    const exec = fakeExec((command) =>
      command === "react-scan"
        ? result(`${command} --version`, "", "not found", true)
        : result(command),
    );

    const laneResult = await reactDoctor({ requireScanCli: true }).run(
      context(root, exec, ["apps/web/src/page.tsx"]),
    );

    expect(laneResult.status).toBe("failed");
  });

  it("loads React Scan through its CommonJS exports without importing its ESM graph", async () => {
    const root = await fixture();
    const packageRoot = join(root, "node_modules", "react-scan");
    await mkdir(packageRoot, { recursive: true });
    await writeFile(
      join(packageRoot, "package.json"),
      JSON.stringify({
        name: "react-scan",
        exports: {
          ".": { require: "./index.cjs", import: "./broken.mjs" },
          "./lite": "./lite.cjs",
          "./react-component-name/vite": "./vite.cjs",
        },
      }),
    );
    await writeFile(
      join(packageRoot, "index.cjs"),
      "exports.scan = () => {}; exports.getReport = () => {};\n",
    );
    await writeFile(
      join(packageRoot, "lite.cjs"),
      "exports.instrument = () => ({ stop() {}, isActive() { return false; } });\n",
    );
    await writeFile(
      join(packageRoot, "vite.cjs"),
      "exports.default = () => ({ name: 'react-scan' });\n",
    );
    await writeFile(join(packageRoot, "broken.mjs"), 'import "./package.json";\n');
    const laneResult = await reactDoctor().run(context(root, reactScanExec, ["src/page.tsx"]));

    expect(laneResult.status).toBe("passed");
  });
});
