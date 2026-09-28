import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { doctorCommand } from "../../src/commands/doctor.js";
import type { GateConfig, GateExec } from "../../src/core/types.js";
import { custom } from "../../src/lanes/custom.js";
import { typecheck } from "../../src/lanes/typecheck.js";
import { createFixtureRepo } from "./fixture.js";

describe("doctor configured commands", () => {
  const roots: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("does not require a custom lint tool or an unused typecheck script", async () => {
    const root = await createFixtureRepo();
    roots.push(root);
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ scripts: { "check-types": "tsc --noEmit" } }),
    );
    await writeFile(
      join(root, "gate.config.ts"),
      'lanes.typecheck({ command: "pnpm", args: ["run", "check-types"] });\nlanes.custom({ run: "pnpm run lint" });\n',
    );
    const calls: string[] = [];
    const exec: GateExec = async (command) => {
      calls.push(command);
      return {
        command,
        exitCode: command === "oxlint" ? 127 : 0,
        stdout: "",
        stderr: "",
        failed: command === "oxlint",
      };
    };
    const config: GateConfig = {
      workspaceRoots: ["src"],
      lanes: [
        custom({ id: "lint", title: "Project lint", triggers: "always", run: "pnpm run lint" }),
        typecheck({ command: "pnpm", args: ["run", "check-types"] }),
      ],
    };
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    // The custom command references lint, so hygiene should require that script too.
    expect(await doctorCommand(root, config, exec)).toBe(1);
    expect(calls).not.toContain("oxlint");
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ scripts: { "check-types": "tsc --noEmit", lint: "biome check ." } }),
    );
    expect(await doctorCommand(root, config, exec)).toBe(0);
    expect(calls).not.toContain("oxlint");
  });

  it("probes an overridden typecheck executable", async () => {
    const root = await createFixtureRepo();
    roots.push(root);
    const calls: string[] = [];
    const exec: GateExec = async (command) => {
      calls.push(command);
      return {
        command,
        exitCode: command === "tsgo" ? 127 : 0,
        stdout: "",
        stderr: "",
        failed: command === "tsgo",
      };
    };
    const config: GateConfig = {
      workspaceRoots: ["src"],
      lanes: [typecheck({ command: "tsgo", args: ["--noEmit"] })],
    };
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    expect(await doctorCommand(root, config, exec)).toBe(1);
    expect(calls).toContain("tsgo");
    expect(calls).not.toContain("pnpm");
  });
});
