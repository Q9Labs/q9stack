import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import glob from "fast-glob";
import { parse as parseToml } from "smol-toml";
import { z } from "zod";

import { diffEnvContract, type EnvKeySource } from "../core/env-contract.js";
import type { LaneFinding } from "../core/report.js";
import type { GateLane, LaneContext, LaneResult } from "../core/types.js";
import { categoryTrigger } from "./trigger.js";

export interface EnvContractSourceOptions {
  readonly glob: string;
  /** Keys that must not appear in files matched by this pattern (server-only secrets). */
  readonly forbid: readonly string[];
}

export type EnvContractSourceOption = string | EnvContractSourceOptions;

export interface EnvContractOptions {
  readonly schema: string;
  readonly sources: readonly EnvContractSourceOption[];
}

function sourcePattern(option: EnvContractSourceOption): string {
  return typeof option === "string" ? option : option.glob;
}

function sourceForbid(option: EnvContractSourceOption): readonly string[] {
  return typeof option === "string" ? [] : option.forbid;
}

const schemaKeys = z.array(z.string());
const wranglerEnvironment = z
  .object({ vars: z.record(z.string(), z.unknown()).optional() })
  .passthrough();
const wranglerDocument = wranglerEnvironment.extend({
  env: z.record(z.string(), wranglerEnvironment).optional(),
});

interface KeyExport {
  readonly keys: () => unknown;
}

function hasKeysExport(value: unknown): value is KeyExport {
  return (
    typeof value === "object" &&
    value !== null &&
    "keys" in value &&
    typeof value.keys === "function"
  );
}

function finding(file: string, rule: string, message: string): LaneFinding {
  return { file, rule, message };
}

type JsonTextState = "plain" | "quoted";

interface JsonTextCursor {
  readonly index: number;
  readonly output: string;
  readonly state: JsonTextState;
  readonly escaped: boolean;
}

function skipLineComment(input: string, start: number): number {
  let index = start + 1;
  while (index + 1 < input.length && input[index + 1] !== "\n") {
    index += 1;
  }
  return index + 1;
}

function skipBlockComment(input: string, start: number): number {
  let index = start + 2;
  while (index + 1 < input.length && !(input[index] === "*" && input[index + 1] === "/")) {
    index += 1;
  }
  return index + 2;
}

function consumeQuotedCharacter(input: string, cursor: JsonTextCursor): JsonTextCursor {
  const character = input[cursor.index] ?? "";
  const escaped = !cursor.escaped && character === "\\";
  const state: JsonTextState = cursor.escaped || character !== '"' ? "quoted" : "plain";
  return {
    index: cursor.index + 1,
    output: cursor.output + character,
    state,
    escaped,
  };
}

function consumePlainCharacter(input: string, cursor: JsonTextCursor): JsonTextCursor {
  const character = input[cursor.index] ?? "";
  const next = input[cursor.index + 1];
  if (character === '"') {
    return {
      index: cursor.index + 1,
      output: cursor.output + character,
      state: "quoted",
      escaped: false,
    };
  }
  if (character === "/" && next === "/") {
    return {
      index: skipLineComment(input, cursor.index),
      output: cursor.output + "\n",
      state: "plain",
      escaped: false,
    };
  }
  if (character === "/" && next === "*") {
    return {
      index: skipBlockComment(input, cursor.index),
      output: cursor.output + " ",
      state: "plain",
      escaped: false,
    };
  }
  return {
    index: cursor.index + 1,
    output: cursor.output + character,
    state: "plain",
    escaped: false,
  };
}

function stripJsonComments(input: string): string {
  let cursor: JsonTextCursor = { index: 0, output: "", state: "plain", escaped: false };
  while (cursor.index < input.length) {
    cursor =
      cursor.state === "quoted"
        ? consumeQuotedCharacter(input, cursor)
        : consumePlainCharacter(input, cursor);
  }
  return cursor.output.replace(/,\s*([}\]])/gu, "$1");
}

function staticSchemaKeys(source: string): readonly string[] {
  const arrayMatch = source.match(
    /(?:function\s+keys\s*\([^)]*\)|(?:const|let|var)\s+keys\s*=)[\s\S]{0,2000}?(?:return\s+)?\[([\s\S]*?)\]/u,
  );
  if (arrayMatch?.[1] !== undefined) {
    return [...arrayMatch[1].matchAll(/["']([A-Za-z_][A-Za-z0-9_]*)["']/gu)]
      .map((match) => match[1] ?? "")
      .filter((key) => key.length > 0);
  }
  return [...source.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*:/gmu)]
    .map((match) => match[1] ?? "")
    .filter((key) => key.length > 0);
}

async function loadSchemaKeys(repoRoot: string, schemaPath: string): Promise<readonly string[]> {
  const absolute = resolve(repoRoot, schemaPath);
  try {
    return await importSchemaKeys(absolute, schemaPath);
  } catch (error: unknown) {
    return loadStaticSchemaKeys(absolute, schemaPath, error);
  }
}

async function importSchemaKeys(absolute: string, schemaPath: string): Promise<readonly string[]> {
  const url = pathToFileURL(absolute);
  url.searchParams.set("q9gate", String(Date.now()));
  const loaded: unknown = await import(url.href);
  if (typeof loaded !== "object" || loaded === null) {
    throw new Error(`Schema module ${schemaPath} does not export keys().`);
  }
  const candidate = keyExport(loaded);
  if (candidate === undefined) {
    throw new Error(`Schema module ${schemaPath} does not export keys().`);
  }
  const result: unknown = await Promise.resolve(candidate.keys());
  return schemaKeys.parse(result);
}

function keyExport(loaded: object): KeyExport | undefined {
  if (hasKeysExport(loaded)) {
    return loaded;
  }
  if ("default" in loaded && hasKeysExport(loaded.default)) {
    return loaded.default;
  }
  if ("env" in loaded && hasKeysExport(loaded.env)) {
    return loaded.env;
  }
  return undefined;
}

async function loadStaticSchemaKeys(
  absolute: string,
  schemaPath: string,
  importError: unknown,
): Promise<readonly string[]> {
  let source: string;
  try {
    source = await readFile(absolute, "utf8");
  } catch (readError: unknown) {
    const detail = readError instanceof Error ? readError.message : String(readError);
    throw new Error(`Could not load env schema ${schemaPath}: ${detail}`, { cause: readError });
  }
  const keys = staticSchemaKeys(source);
  if (keys.length > 0) {
    return keys;
  }
  const detail = importError instanceof Error ? importError.message : String(importError);
  throw new Error(`Could not load env schema ${schemaPath}: ${detail}`, { cause: importError });
}

function envFileKeys(source: string): readonly string[] {
  return source
    .split(/\r?\n/u)
    .map((line) => line.trim().replace(/^export\s+/u, ""))
    .flatMap((line) => {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/u);
      return match?.[1] === undefined ? [] : [match[1]];
    });
}

function wranglerKeys(sourcePath: string, source: string): readonly string[] {
  let parsed: unknown;
  try {
    parsed =
      basename(sourcePath) === "wrangler.toml"
        ? parseToml(source, { unsafeKeyBehaviour: "throw" })
        : JSON.parse(stripJsonComments(source));
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse ${sourcePath}: ${detail}`, { cause: error });
  }
  const validated = wranglerDocument.safeParse(parsed);
  if (!validated.success) {
    throw new Error(
      `Wrangler configuration ${sourcePath} has invalid vars: ${validated.error.message}`,
    );
  }
  const keys = Object.keys(validated.data.vars ?? {});
  for (const environment of Object.values(validated.data.env ?? {})) {
    keys.push(...Object.keys(environment.vars ?? {}));
  }
  return [...new Set(keys)].toSorted();
}

function tofuOutputKeys(source: string): readonly string[] {
  return [...source.matchAll(/^\s*output\s+["']([^"']+)["']/gmu)]
    .map((match) => match[1] ?? "")
    .filter((key) => key.length > 0);
}

function sourceKeys(sourcePath: string, source: string): readonly string[] {
  const name = basename(sourcePath);
  if (name === "wrangler.jsonc" || name === "wrangler.json" || name === "wrangler.toml") {
    return wranglerKeys(sourcePath, source);
  }
  if (name === ".env.example" || name.startsWith(".env.")) {
    return envFileKeys(source);
  }
  if (name === "outputs.tf" || name.endsWith(".tf")) {
    return tofuOutputKeys(source);
  }
  return envFileKeys(source);
}

async function loadSources(
  context: LaneContext,
  patterns: readonly EnvContractSourceOption[],
): Promise<{
  readonly sources: readonly EnvKeySource[];
  readonly findings: readonly LaneFinding[];
}> {
  const loadedPatterns = await Promise.all(
    patterns.map((pattern) => loadSourcePattern(context, pattern)),
  );
  return {
    sources: loadedPatterns.flatMap((loaded) => loaded.sources),
    findings: loadedPatterns.flatMap((loaded) => loaded.findings),
  };
}

interface LoadedSources {
  readonly sources: readonly EnvKeySource[];
  readonly findings: readonly LaneFinding[];
}

async function loadSourcePattern(
  context: LaneContext,
  option: EnvContractSourceOption,
): Promise<LoadedSources> {
  const pattern = sourcePattern(option);
  const matches = await glob(pattern, {
    cwd: context.repoRoot,
    dot: true,
    onlyFiles: true,
    unique: true,
  });
  if (matches.length === 0) {
    return {
      sources: [],
      findings: [
        finding(pattern, "missing-source", `No environment contract source matched ${pattern}.`),
      ],
    };
  }
  const loaded = await Promise.all(
    matches.map((match) => loadSourceFile(context.repoRoot, match, sourceForbid(option))),
  );
  return {
    sources: loaded.flatMap((result) => result.sources),
    findings: loaded.flatMap((result) => result.findings),
  };
}

async function loadSourceFile(
  repoRoot: string,
  match: string,
  forbid: readonly string[],
): Promise<LoadedSources> {
  try {
    const source = await readFile(resolve(repoRoot, match), "utf8");
    return { sources: [{ name: match, keys: sourceKeys(match, source), forbid }], findings: [] };
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    return { sources: [], findings: [finding(match, "source-parse", detail)] };
  }
}

async function runEnvContract(
  context: LaneContext,
  options: EnvContractOptions,
): Promise<LaneResult> {
  const findings: LaneFinding[] = [];
  let schema: readonly string[];
  try {
    schema = await loadSchemaKeys(context.repoRoot, options.schema);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      status: "failed",
      findings: [finding(options.schema, "schema-load", detail)],
      metrics: { filesChecked: 0 },
    };
  }

  const loaded = await loadSources(context, options.sources);
  findings.push(...loaded.findings);
  const contract = diffEnvContract(schema, loaded.sources);
  const schemaSet = new Set(schema);
  const missingKeys = new Set(
    contract.differences
      .filter((difference) => schemaSet.has(difference.key))
      .map((difference) => difference.key),
  );
  const unexpectedKeys = new Set(
    contract.differences
      .filter((difference) => difference.missingFrom.includes("schema"))
      .map((difference) => difference.key),
  );
  for (const difference of contract.differences) {
    const location = difference.missingFrom[0] ?? "env contract";
    findings.push(
      finding(
        location,
        "env-contract",
        `${difference.key} is missing from ${difference.missingFrom.join(", ")}.`,
      ),
    );
  }
  for (const entry of contract.forbidden) {
    findings.push(
      finding(
        entry.source,
        "forbidden-key",
        `${entry.key} must not appear in ${entry.source}; it is forbidden for this source.`,
      ),
    );
  }
  const result: LaneResult = {
    status: findings.length === 0 ? "passed" : "failed",
    metrics: {
      missingEnvKeys: missingKeys.size,
      unexpectedEnvKeys: unexpectedKeys.size,
      filesChecked: loaded.sources.length,
    },
  };
  return findings.length > 0 ? { ...result, findings } : result;
}

export function envContract(options: EnvContractOptions): GateLane {
  return {
    id: "env-contract",
    title: "Environment contract",
    categories: ["env"],
    triggers: categoryTrigger(["env"]),
    run: (context) => runEnvContract(context, options),
  };
}
