import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { z } from "zod";

import type { BaselineSpec } from "../core/types.js";
import { pathExists } from "./filesystem.js";

const jsonBaselineSchema = z
  .object({
    count: z.number().int().nonnegative().optional(),
    entries: z.array(z.json()),
    acceptedAt: z.string().optional(),
    message: z.string().optional(),
  })
  .passthrough();

async function validateJsonFile(path: string, displayPath: string): Promise<void> {
  const contents = await readFile(path, "utf8").catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read baseline ${displayPath}: ${detail}`);
  });
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Baseline ${displayPath} is not valid JSON: ${detail}`, { cause: error });
  }
  z.json().parse(parsed);
}

export async function validateBaseline(repoRoot: string, spec: BaselineSpec): Promise<void> {
  const path = resolve(repoRoot, spec.path);
  if (spec.format === "directory") {
    let entries: readonly string[];
    try {
      entries = await readdir(path);
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return;
      }
      throw error;
    }
    await Promise.all(
      entries
        .filter((entry) => entry.endsWith(".json"))
        .map((entry) => validateJsonFile(join(path, entry), `${spec.path}/${entry}`)),
    );
    return;
  }
  if (spec.format === "json-document") {
    await validateJsonFile(path, spec.path);
    return;
  }
  const contents = await readFile(path, "utf8").catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read baseline ${spec.path}: ${detail}`);
  });
  if (spec.format === "text") {
    return;
  }
  const parsed: unknown = JSON.parse(contents);
  jsonBaselineSchema.parse(parsed);
}

export async function acceptBaselineMessage(
  repoRoot: string,
  spec: BaselineSpec,
  message: string,
  now = new Date(),
): Promise<string> {
  const path = resolve(repoRoot, spec.path);
  const acceptedAt = now.toISOString();
  if (spec.format === "directory") {
    await mkdir(path, { recursive: true });
    const acceptancePath = join(path, ".q9gate-acceptance.json");
    await writeFile(
      acceptancePath,
      `${JSON.stringify({ count: 0, entries: [], acceptedAt, message }, null, 2)}\n`,
      "utf8",
    );
    return acceptancePath;
  }
  if (spec.format === "json-document") {
    await validateJsonFile(path, spec.path);
    const acceptancePath = `${path}.q9gate-acceptance.json`;
    await writeFile(
      acceptancePath,
      `${JSON.stringify({ count: 0, entries: [], acceptedAt, message }, null, 2)}\n`,
      "utf8",
    );
    return acceptancePath;
  }
  await mkdir(dirname(path), { recursive: true });
  if (spec.format === "text") {
    await appendFile(path, `# accepted ${acceptedAt}: ${message}\n`, "utf8");
    return path;
  }

  let baseline: z.infer<typeof jsonBaselineSchema>;
  if (await pathExists(path)) {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    baseline = jsonBaselineSchema.parse(parsed);
  } else {
    baseline = { count: 0, entries: [] };
  }
  const updated = { ...baseline, acceptedAt, message };
  await writeFile(path, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  return path;
}
