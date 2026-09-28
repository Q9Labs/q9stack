import { spawn, spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import packageJson from "../package.json" with { type: "json" };
import { addEntry, exportWhatsNew, parseChangelog, release } from "../src/changelog.js";
import { validateTracker } from "../src/tracker.js";

const packageRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const bin = path.join(packageRoot, "dist", "cli.js");
const fixture = path.join(packageRoot, "test", "fixtures");
let root: string;

function cli(...args: string[]) {
  return spawnSync(process.execPath, [bin, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 10000,
  });
}

function cliAsync(...args: string[]): Promise<{ status: number | null; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin, ...args], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.once("error", reject);
    child.once("close", (status) => resolve({ status, stdout }));
  });
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "q9-cli-test-"));
  for (const file of ["tracker.yaml", "note.md", "CHANGELOG.md"])
    await cp(path.join(fixture, file), path.join(root, file));
  await writeFile(
    path.join(root, "q9.config.json"),
    JSON.stringify({
      trackerAreas: ["custom"],
      diag: { adapter: "command", command: ["node", "trace.mjs"] },
    }),
  );
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "fixture",
      scripts: {
        "dev:reset:hook": "node -e \"require('fs').writeFileSync('reset-marker', 'ran')\"",
      },
    }),
  );
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

it("reports the version from its package manifest", () => {
  const result = cli("--version");

  expect(result.status).toBe(0);
  expect(result.stdout.trim().startsWith(`q9/${packageJson.version}`)).toBe(true);
});

describe("tracker", () => {
  it("checks schema, references and paths with a fixture CLI", async () => {
    expect(cli("tracker", "check").status).toBe(0);
    expect(JSON.parse(cli("tracker", "check", "--json").stdout)).toMatchObject({
      valid: true,
      outcomes: 2,
    });
    await writeFile(
      path.join(root, "tracker.yaml"),
      (await readFile(path.join(root, "tracker.yaml"), "utf8")).replace(
        "note.md#purpose",
        "note.md#missing",
      ),
    );
    const failed = cli("tracker", "check");
    expect(failed.status).not.toBe(0);
    expect(failed.stderr).toContain("outcomes[0].theory");
    expect(failed.stderr).toContain("tracker.yaml");
  });

  it("lists with filters and shows all outcome details", () => {
    const listed = cli("tracker", "list", "--state", "planned", "--json");
    expect(listed.status).toBe(0);
    expect(JSON.parse(listed.stdout)).toHaveLength(1);
    expect(cli("tracker", "list", "--area", "custom").stdout).toContain("demo.second");
    const shown = cli("tracker", "show", "demo.first");
    expect(shown.stdout).toContain("Implement it");
    expect(shown.stdout).toContain("note.md");
    expect(shown.stdout).toContain("Evidence:");
    expect(JSON.parse(cli("tracker", "show", "demo.first", "--json").stdout)).toMatchObject({
      id: "demo.first",
    });
    expect(cli("tracker", "show", "missing").status).not.toBe(0);
  });

  it("reports multiple schema and semantic problems with YAML paths", () => {
    const input = {
      schema_version: 6,
      principle: "",
      sizing: "ok",
      outcomes: [{ id: "Bad", title: "", area: "oops", state: "planned", summary: "", code: [] }],
    };
    expect(() => validateTracker(input)).toThrow(/outcomes\[0\]\.priority/);
    try {
      validateTracker(input);
    } catch (error) {
      expect(String(error)).toContain("schema_version");
      expect(String(error)).toContain("outcomes[0].area");
    }
  });
});

describe("changelog", () => {
  it("adds, checks, releases and exports with the fixture CLI", async () => {
    expect(cli("changelog", "check").status).toBe(0);
    expect(
      cli("changelog", "add", "--type", "fixed", "--title", "New fix", "--body", "It works.")
        .status,
    ).toBe(0);
    expect(await readFile(path.join(root, "CHANGELOG.md"), "utf8")).toContain(
      "- **New fix**: It works.",
    );
    expect(cli("changelog", "release", "1.1.0", "--date", "2026-09-27", "--json").status).toBe(0);
    const released = await readFile(path.join(root, "CHANGELOG.md"), "utf8");
    expect(released).toContain("## [1.1.0] - 2026-09-27");
    expect(cli("changelog", "check", "--json").status).toBe(0);
    expect(cli("changelog", "export", "--out", "changelog.json").status).toBe(0);
    const exported: unknown = JSON.parse(await readFile(path.join(root, "changelog.json"), "utf8"));
    expect(exported).toMatchObject({ schemaVersion: 1 });
    expect(JSON.stringify(exported)).not.toContain('"internal"');
    expect(cli("changelog", "release", "1.1.0").status).not.toBe(0);
  });

  it("validates ordering, headings, dates and entry formatting", async () => {
    const source = await readFile(path.join(fixture, "CHANGELOG.md"), "utf8");
    expect(() => parseChangelog(source.replace("2026-01-02", "2026-02-30"))).toThrow(
      /calendar date/,
    );
    expect(() => parseChangelog(source.replace("### Fixed", "### Misc"))).toThrow(/heading/);
    expect(() =>
      parseChangelog(source.replace("- **Old bug**: Fixed an old bug.", "- Old bug")),
    ).toThrow(/Title/);
    expect(() => release(source, "0.9.0", "2026-09-27")).toThrow(/greater/);
    expect(addEntry(source, { type: "fixed", title: "Fix", body: "Body" })).toContain("**Fix**");
    expect(exportWhatsNew(source).releases[0]?.entries).toHaveLength(1);
    expect(
      addEntry("# Changelog\n\n## [1.0.0] - 2026-01-02\n", {
        type: "added",
        title: "Start",
        body: "Works.",
      }),
    ).toContain("## [Unreleased]");
  });
});

describe("dev", () => {
  it("keeps both records when starts overlap", async () => {
    try {
      const [first, second] = await Promise.all(
        ["first", "second"].map((name) =>
          cliAsync(
            "dev",
            "start",
            "--name",
            name,
            "--",
            process.execPath,
            "-e",
            "setInterval(() => {}, 1000)",
          ),
        ),
      );
      expect(first?.status).toBe(0);
      expect(second?.status).toBe(0);
      const records = z
        .array(z.object({ name: z.string() }))
        .parse(JSON.parse(cli("dev", "status", "--json").stdout));
      expect(records.map((record) => record.name).toSorted()).toEqual(["first", "second"]);
    } finally {
      cli("dev", "reset");
    }
  }, 20_000);

  it("finds a listening port owned by a child in the recorded process group", async () => {
    if (process.platform === "win32" || spawnSync("lsof", ["-v"]).error) return;
    const childSource = "require('net').createServer().listen(0); setInterval(() => {}, 1000)";
    const parentSource =
      "require('child_process').spawn(process.execPath, ['-e', " +
      JSON.stringify(childSource) +
      "], {stdio: 'ignore'}); setInterval(() => {}, 1000)";
    try {
      expect(
        cli("dev", "start", "--name", "group", "--", process.execPath, "-e", parentSource).status,
      ).toBe(0);
      await new Promise((resolve) => setTimeout(resolve, 500));
      const records = z
        .array(z.object({ ports: z.array(z.number()).optional() }))
        .parse(JSON.parse(cli("dev", "status", "--json").stdout));
      expect(records[0]?.ports?.length).toBeGreaterThan(0);
    } finally {
      cli("dev", "stop", "--name", "group");
    }
  });

  it("does not leave a process running without an identity record", () => {
    const result = spawnSync(
      process.execPath,
      [
        bin,
        "dev",
        "start",
        "--name",
        "unverified",
        "--json",
        "--",
        process.execPath,
        "-e",
        "setInterval(() => {}, 1000)",
      ],
      {
        cwd: root,
        encoding: "utf8",
        timeout: 10000,
        env: { ...process.env, PATH: "/nonexistent" },
      },
    );
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("cannot verify process identity");
    expect(cli("dev", "status", "--json").stdout.trim()).toBe("[]");
  });

  it("starts, inspects, logs and stops only a recorded process", async () => {
    const started = cli(
      "dev",
      "start",
      "--name",
      "api",
      "--json",
      "--",
      process.execPath,
      "-e",
      "console.log('ready'); setInterval(() => {}, 1000)",
    );
    expect(started.status).toBe(0);
    expect(JSON.parse(started.stdout)).toMatchObject({ name: "api" });
    expect(
      cli(
        "dev",
        "start",
        "--name",
        "api",
        "--",
        process.execPath,
        "-e",
        "setInterval(() => {}, 1000)",
      ).status,
    ).not.toBe(0);
    const status = z
      .array(z.object({ alive: z.boolean(), process: z.object({ pid: z.number() }) }))
      .parse(JSON.parse(cli("dev", "status", "--json").stdout));
    expect(status[0]?.alive).toBe(true);
    expect(status[0]?.process.pid).toBeGreaterThan(0);
    expect(cli("dev", "logs", "--name", "api", "--tail", "5", "--json").status).toBe(0);
    expect(cli("dev", "stop", "--name", "api").status).toBe(0);
    expect(JSON.parse(cli("dev", "status", "--json").stdout)).toHaveLength(0);
  });

  it("resets all records and invokes the project hook", async () => {
    const result = cli("dev", "reset", "--json");
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ stopped: [], hook: true });
    expect(await readFile(path.join(root, "reset-marker"), "utf8")).toBe("ran");
  });
});
