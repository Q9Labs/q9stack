import type { ConfigError } from "effect";
import { Cause, Config, ConfigProvider, Effect, Either, Exit, Option } from "effect";

import { EnvError, issuesFromConfigError, type EnvIssue } from "./errors.js";
import { isBlankEnvValue } from "./schema.js";
import type { EnvContract, EnvEntry, EnvSchemaJsonEntry, EnvSpec, EnvValue } from "./types.js";

interface RuntimeEntry {
  readonly key: string;
  readonly definition: EnvEntry;
}

interface RuntimeParsed {
  [key: string]: EnvValue | undefined;
}

interface RuntimeContract {
  readonly parse: (
    source: Record<string, string | undefined>,
  ) => Either.Either<RuntimeParsed, EnvError>;
  readonly keys: () => readonly string[];
  readonly schemaJson: () => readonly EnvSchemaJsonEntry[];
  readonly client: () => RuntimeContract;
}

const readConfig = <A>(
  config: Config.Config<A>,
  provider: ConfigProvider.ConfigProvider,
): Exit.Exit<A, ConfigError.ConfigError> =>
  Effect.runSyncExit(Effect.withConfigProvider(provider)(config));

const failureIssues = (
  key: string,
  cause: Cause.Cause<ConfigError.ConfigError>,
): readonly EnvIssue[] => {
  const error = Option.getOrUndefined(Cause.failureOption(cause));
  return error === undefined
    ? [{ code: "unavailable", key, message: "Configuration could not be evaluated" }]
    : issuesFromConfigError(key, error);
};

const readRequired = (
  key: string,
  config: Config.Config<EnvValue>,
  provider: ConfigProvider.ConfigProvider,
): Either.Either<EnvValue, readonly EnvIssue[]> => {
  const result = readConfig(config, provider);
  return Exit.isSuccess(result)
    ? Either.right(result.value)
    : Either.left(failureIssues(key, result.cause));
};

const readOptional = (
  key: string,
  config: Config.Config<EnvValue>,
  provider: ConfigProvider.ConfigProvider,
): Either.Either<EnvValue | undefined, readonly EnvIssue[]> => {
  const result = readConfig(Config.option(config), provider);
  if (Exit.isFailure(result)) {
    return Either.left(failureIssues(key, result.cause));
  }

  return Either.right(Option.getOrUndefined(result.value));
};

const parseEntries = (
  entries: readonly RuntimeEntry[],
  source: Record<string, string | undefined>,
): Either.Either<RuntimeParsed, EnvError> => {
  const values: RuntimeParsed = {};
  const issues: EnvIssue[] = [];
  const sourceMap = new Map<string, string>();

  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined) {
      sourceMap.set(key, value);
    }
  }

  const provider = ConfigProvider.fromMap(sourceMap);
  for (const entry of entries) {
    const sourceValue = source[entry.key];
    if (
      entry.definition.required === false &&
      typeof sourceValue === "string" &&
      isBlankEnvValue(sourceValue)
    ) {
      values[entry.key] = undefined;
      continue;
    }
    const config = entry.definition.schema.config(entry.key);
    const result =
      entry.definition.required === false
        ? readOptional(entry.key, config, provider)
        : readRequired(entry.key, config, provider);

    if (Either.isLeft(result)) {
      issues.push(...result.left);
    } else {
      values[entry.key] = result.right;
    }
  }

  return issues.length === 0 ? Either.right(values) : Either.left(new EnvError(issues));
};

const isPublicClientKey = (key: string): boolean =>
  key.startsWith("VITE_") || key.startsWith("PUBLIC_") || key.startsWith("EXPO_PUBLIC_");

const makeRuntimeContract = (entries: readonly RuntimeEntry[]): RuntimeContract => {
  const keys = Object.freeze(entries.map((entry) => entry.key));
  const schemaJson = Object.freeze(
    entries.map((entry) => ({
      description: entry.definition.description,
      key: entry.key,
      required: entry.definition.required !== false,
      schema: entry.definition.schema.schemaJson,
      scope: entry.definition.scope,
    })),
  );

  return {
    client: () =>
      makeRuntimeContract(
        entries.filter(
          (entry) => entry.definition.scope === "client" && isPublicClientKey(entry.key),
        ),
      ),
    keys: () => keys,
    parse: (source) => parseEntries(entries, source),
    schemaJson: () => schemaJson,
  };
};

function createContract<Spec extends EnvSpec>(spec: Spec): EnvContract<Spec>;
function createContract(spec: EnvSpec): RuntimeContract;
function createContract(spec: EnvSpec): RuntimeContract {
  const entries: readonly RuntimeEntry[] = Object.entries(spec).map(([key, definition]) => ({
    definition,
    key,
  }));
  return makeRuntimeContract(entries);
}

export function defineEnv<Spec extends EnvSpec>(spec: Spec): EnvContract<Spec>;
export function defineEnv(spec: EnvSpec): RuntimeContract;
export function defineEnv(spec: EnvSpec): RuntimeContract {
  return createContract(spec);
}
