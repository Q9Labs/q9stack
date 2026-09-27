export interface EnvKeySource {
  readonly name: string;
  readonly keys: readonly string[];
  /** Keys that are neither expected nor allowed in this source (server-only secrets). */
  readonly forbid?: readonly string[];
}

export interface EnvKeyDifference {
  readonly key: string;
  readonly missingFrom: readonly string[];
}

export interface EnvForbiddenKey {
  readonly key: string;
  readonly source: string;
}

export interface EnvContractDiff {
  readonly valid: boolean;
  readonly differences: readonly EnvKeyDifference[];
  readonly forbidden: readonly EnvForbiddenKey[];
}

export function diffEnvContract(
  schemaKeys: readonly string[],
  sources: readonly EnvKeySource[],
): EnvContractDiff {
  const sides: readonly EnvKeySource[] = [{ name: "schema", keys: schemaKeys }, ...sources];
  const allKeys = [...new Set(sides.flatMap((source) => source.keys))].toSorted();
  const differences = allKeys.flatMap((key) => {
    const missingFrom = sides
      .filter((source) => !source.keys.includes(key) && source.forbid?.includes(key) !== true)
      .map((source) => source.name);
    if (missingFrom.length === 0) {
      return [];
    }
    return [{ key, missingFrom }];
  });
  const forbidden = sides.flatMap((source) =>
    (source.forbid ?? [])
      .filter((key) => source.keys.includes(key))
      .map((key) => ({ key, source: source.name })),
  );
  return { valid: differences.length === 0 && forbidden.length === 0, differences, forbidden };
}
