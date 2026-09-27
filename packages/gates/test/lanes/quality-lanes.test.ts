// cspell:ignore adress
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import fc from "fast-check";
import { describe, expect, it, afterEach } from "vitest";

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

function context(root: string, exec: GateExec, changedFiles: readonly string[] = []): LaneContext {
  return {
    repoRoot: root,
    exec,
    changedFiles,
    classification: {
      changedFiles,
      categories: [],
      unclassifiedFiles: [],
      docsOnly: false,
      fullRequired: false,
    },
    scope: "branch",
    base: "base-ref",
  };
}

function fakeExec(
  handler: (command: string, args: readonly string[], input: string) => CommandResult,
): GateExec {
  return async (command, args = [], options = {}) => handler(command, args, options.input ?? "");
}

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
      classification: {
        changedFiles: ["packages/a.ts"],
        categories: [],
        unclassifiedFiles: [],
        docsOnly: false,
        fullRequired: false,
      },
      scope: "full",
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
});
