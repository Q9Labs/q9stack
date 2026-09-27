import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { acceptBaselineMessage, validateBaseline } from "../../src/adapters/baseline-store.js";

describe("baseline store", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  async function fixture(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "q9gate-baseline-"));
    roots.push(root);
    return root;
  }

  it("accepts an absent optional Fallow directory and records approval metadata", async () => {
    const root = await fixture();
    const spec = { path: "gates/baselines/fallow", format: "directory" as const };

    await expect(validateBaseline(root, spec)).resolves.toBeUndefined();
    const path = await acceptBaselineMessage(
      root,
      spec,
      "Reviewed Fallow debt",
      new Date("2026-08-23T00:00:00.000Z"),
    );

    expect(path).toBe(join(root, "gates/baselines/fallow/.q9gate-acceptance.json"));
    expect(await readFile(path, "utf8")).toContain("Reviewed Fallow debt");
  });

  it("validates a native JSON baseline without rewriting it", async () => {
    const root = await fixture();
    const baselinePath = join(root, "gitleaks-baseline.json");
    await writeFile(baselinePath, '[{"RuleID":"secret"}]\n');
    const spec = { path: "gitleaks-baseline.json", format: "json-document" as const };

    await expect(validateBaseline(root, spec)).resolves.toBeUndefined();
    const acceptancePath = await acceptBaselineMessage(root, spec, "Reviewed secret finding");
    const baseline: unknown = JSON.parse(await readFile(baselinePath, "utf8"));

    expect(baseline).toEqual([{ RuleID: "secret" }]);
    expect(await readFile(acceptancePath, "utf8")).toContain("Reviewed secret finding");
  });

  it("rejects malformed JSON within a baseline directory", async () => {
    const root = await fixture();
    await mkdir(join(root, "gates/baselines/fallow"), { recursive: true });
    await writeFile(join(root, "gates/baselines/fallow/dead-code.json"), "not json\n");

    await expect(
      validateBaseline(root, {
        path: "gates/baselines/fallow",
        format: "directory",
      }),
    ).rejects.toThrow("not valid JSON");
  });
});
