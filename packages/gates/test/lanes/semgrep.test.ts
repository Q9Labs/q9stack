import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { expect, it } from "vitest";

import { classify } from "../../src/core/classify.js";
import type { CommandResult, GateExec, LaneContext } from "../../src/core/types.js";
import { semgrep } from "../../src/lanes/semgrep.js";

function commandResult(command: string, stdout = "", failed = false): CommandResult {
  return {
    command,
    exitCode: failed ? 1 : 0,
    stdout,
    stderr: failed ? "command failed" : "",
    failed,
  };
}

function context(repoRoot: string, exec: GateExec): LaneContext {
  const changedFiles = ["src/index.ts"];
  return {
    repoRoot,
    changedFiles,
    allChangedFiles: changedFiles,
    target: undefined,
    scope: "full",
    classification: classify(changedFiles),
    exec,
  };
}

async function fixture(): Promise<string> {
  return mkdtemp(join(tmpdir(), "q9gate-semgrep-"));
}

function fingerprint(rule: string, file: string, semgrepFingerprint: string): string {
  return createHash("sha256")
    .update(`${rule}\0${file}\0semgrep:${semgrepFingerprint}`)
    .digest("hex");
}

function snippetFingerprint(rule: string, file: string, snippet: string): string {
  const normalizedSnippet = snippet.replace(/\s+/gu, " ").trim();
  return createHash("sha256")
    .update(`${rule}\0${file}\0snippet:${normalizedSnippet}`)
    .digest("hex");
}

function output(
  results: readonly {
    readonly check_id: string;
    readonly path: string;
    readonly line: number;
    readonly fingerprint?: string;
    readonly lines?: string;
    readonly message: string;
  }[] = [],
  errors: readonly {
    readonly message: string;
    readonly type?: string | readonly unknown[];
    readonly path?: string;
  }[] = [],
): string {
  return JSON.stringify({
    results: results.map((result) => ({
      check_id: result.check_id,
      path: result.path,
      start: { line: result.line },
      extra: {
        ...(result.fingerprint === undefined ? {} : { fingerprint: result.fingerprint }),
        ...(result.lines === undefined ? {} : { lines: result.lines }),
        message: result.message,
      },
    })),
    errors,
  });
}

function semgrepExec(scanOutput: string, failed = false): GateExec {
  return async (command, args = []) => {
    if (args.includes("--version")) {
      return commandResult(command, "1.166.0");
    }
    return commandResult(command, scanOutput, failed);
  };
}

async function writeBaseline(
  root: string,
  path: string,
  entries: readonly {
    readonly file: string;
    readonly rule: string;
    readonly fingerprint: string;
  }[],
): Promise<void> {
  const baselineFile = join(root, path);
  await mkdir(dirname(baselineFile), { recursive: true });
  await writeFile(
    baselineFile,
    `${JSON.stringify(
      {
        count: entries.length,
        entries,
        acceptedAt: "2026-09-28T00:00:00.000Z",
        message: "Reviewed existing findings",
      },
      null,
      2,
    )}\n`,
  );
}

it("reports each skipped file as a visible warning without failing", async () => {
  const root = await fixture();
  const scanOutput = output(
    [],
    [
      {
        type: ["PartialParsing", [{ path: "packages/convex/convex/auth.ts" }]],
        path: "packages/convex/convex/auth.ts",
        message: "Syntax error at line packages/convex/convex/auth.ts:247",
      },
      {
        type: "Syntax error",
        path: "apps/web/src/auth.ts",
        message: "Syntax error at line 18",
      },
    ],
  );
  try {
    const result = await semgrep().run(context(root, semgrepExec(scanOutput, true)));
    expect(result.status).toBe("passed");
    expect(result.findings).toEqual([
      {
        file: "packages/convex/convex/auth.ts",
        rule: "semgrep-parse-warning",
        message:
          "Semgrep skipped packages/convex/convex/auth.ts after a parse error: Syntax error at line packages/convex/convex/auth.ts:247",
      },
      {
        file: "apps/web/src/auth.ts",
        rule: "semgrep-parse-warning",
        message:
          "Semgrep skipped apps/web/src/auth.ts after a parse error: Syntax error at line 18",
      },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("keeps rule findings failing when parse warnings are also present", async () => {
  const root = await fixture();
  const scanOutput = output(
    [
      {
        check_id: ".semgrep/project.yml.q9.javascript.forbid-eval",
        path: "./src/index.ts",
        line: 21,
        fingerprint: "stable-semgrep-fingerprint",
        lines: "eval(input);",
        message: "Avoid eval.",
      },
    ],
    [
      {
        type: "Syntax error",
        path: "src/broken.ts",
        message: "Syntax error at line 4",
      },
    ],
  );
  try {
    const result = await semgrep().run(context(root, semgrepExec(scanOutput)));
    expect(result.status).toBe("failed");
    expect(result.findings?.map((finding) => finding.rule)).toEqual([
      "q9.javascript.forbid-eval",
      "semgrep-parse-warning",
    ]);
    expect(result.findings?.[0]?.line).toBe(21);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("ratchets stable rule, path, and Semgrep fingerprints", async () => {
  const root = await fixture();
  const baselinePath = "gates/semgrep-baseline.json";
  const findingPath = "src/index.ts";
  const findingRule = "q9.javascript.forbid-eval";
  const semgrepFingerprint = "stable-semgrep-fingerprint";
  await writeBaseline(root, baselinePath, [
    {
      file: findingPath,
      rule: findingRule,
      fingerprint: fingerprint(findingRule, findingPath, semgrepFingerprint),
    },
  ]);

  const existing = {
    check_id: `.semgrep/project.yml.${findingRule}`,
    path: `./${findingPath}`,
    line: 31,
    fingerprint: semgrepFingerprint,
    lines: "eval( input );",
    message: "Avoid eval.",
  };
  try {
    const lane = semgrep({ baselinePath });
    expect(lane.baseline).toEqual({ path: baselinePath, format: "json" });
    const passed = await lane.run(
      context(root, semgrepExec(output([{ ...existing, lines: "eval(input);" }]))),
    );
    expect(passed.status).toBe("passed");
    expect(passed.baseline).toEqual({ before: 1, after: 1 });

    const failed = await lane.run(
      context(
        root,
        semgrepExec(
          output([
            existing,
            {
              ...existing,
              line: 80,
              fingerprint: "new-semgrep-fingerprint",
            },
          ]),
        ),
      ),
    );
    expect(failed.status).toBe("failed");
    expect(failed.baseline).toEqual({ before: 1, after: 2 });
    expect(failed.findings).toEqual([
      {
        file: findingPath,
        line: 80,
        rule: findingRule,
        message: "Avoid eval.",
      },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("uses a normalized source snippet when Semgrep omits its fingerprint", async () => {
  const root = await fixture();
  const baselinePath = "gates/semgrep-baseline.json";
  const findingPath = "src/index.ts";
  const findingRule = "q9.javascript.forbid-eval";
  await writeBaseline(root, baselinePath, [
    {
      file: join(root, findingPath),
      rule: `.semgrep/project.yml.${findingRule}`,
      fingerprint: snippetFingerprint(findingRule, findingPath, "eval(input);"),
    },
  ]);
  try {
    const result = await semgrep({ baselinePath }).run(
      context(
        root,
        semgrepExec(
          output([
            {
              check_id: `.semgrep/project.yml.${findingRule}`,
              path: join(root, findingPath),
              line: 42,
              lines: "\n  eval(input);  \n",
              message: "Avoid eval.",
            },
          ]),
        ),
      ),
    );
    expect(result.status).toBe("passed");
    expect(result.baseline).toEqual({ before: 1, after: 1 });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("keeps the legacy behavior when no baseline is configured", async () => {
  const root = await fixture();
  const result = await semgrep().run(
    context(
      root,
      semgrepExec(
        output([
          {
            check_id: "q9.javascript.forbid-eval",
            path: "src/index.ts",
            line: 1,
            fingerprint: "new-finding",
            lines: "eval(input);",
            message: "Avoid eval.",
          },
        ]),
      ),
    ),
  );
  expect(result.status).toBe("failed");
  expect(result.findings?.[0]?.rule).toBe("q9.javascript.forbid-eval");
});

it("keeps malformed Semgrep rule errors failing instead of warning", async () => {
  const root = await fixture();
  try {
    const result = await semgrep().run(
      context(
        root,
        semgrepExec(
          output(
            [],
            [
              {
                type: "Rule parse error",
                path: ".semgrep/project.yml",
                message: "Invalid rule pattern.",
              },
            ],
          ),
        ),
      ),
    );
    expect(result.status).toBe("failed");
    expect(result.findings?.[0]?.rule).toBe("semgrep-error");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("fails non-parse Semgrep errors", async () => {
  const root = await fixture();
  const result = await semgrep().run(
    context(root, semgrepExec(output([], [{ message: "Unable to load Semgrep rules." }]))),
  );
  expect(result.status).toBe("failed");
  expect(result.findings?.[0]?.rule).toBe("semgrep-error");
});
