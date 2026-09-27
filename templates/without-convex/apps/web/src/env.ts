import { browserEnv, fromImportMetaEnv, fromProcessEnv, webServerEnv } from "@__APP_SLUG__/env";

type AppEnvParseResult = ReturnType<typeof browserEnv.parse>;
type SuccessfulAppEnvParse = Extract<AppEnvParseResult, { readonly _tag: "Right" }>;

export type AppEnvironment = SuccessfulAppEnvParse["right"];

export type AppEnvironmentSource = Parameters<typeof browserEnv.parse>[0];
export type AppEnvironmentName = "dev" | "prod";

export function parseServerEnvironment(source: AppEnvironmentSource): void {
  const parsed = webServerEnv.parse(source);
  if (parsed._tag === "Left") {
    throw parsed.left;
  }
}

export function parseAppEnvironment(source: AppEnvironmentSource): AppEnvironment {
  const parsed = browserEnv.parse(source);
  if (parsed._tag === "Left") {
    throw parsed.left;
  }
  return parsed.right;
}

export function readAppEnvironment(): AppEnvironment {
  const source = readAllRuntimeSource();
  if (typeof process !== "undefined") {
    parseServerEnvironment(source);
  }
  return parseAppEnvironment(publicEnvironmentSource(source));
}

export function runtimeAppEnvironment(): AppEnvironmentName {
  return readAppEnvironment().APP_ENV;
}

export function readRuntimeSource(): AppEnvironmentSource {
  return publicEnvironmentSource(readAllRuntimeSource());
}

function readAllRuntimeSource(): Record<string, string | undefined> {
  const importMetaSource = fromImportMetaEnv(import.meta.env);
  if (typeof process === "undefined") {
    return importMetaSource;
  }
  return {
    ...fromProcessEnv(process.env),
    ...importMetaSource,
  };
}

function publicEnvironmentSource(
  source: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const values: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(source)) {
    if (
      value !== undefined &&
      (key === "APP_ENV" ||
        key === "APP_URL" ||
        key === "SENTRY_DSN" ||
        key.startsWith("PUBLIC_") ||
        key.startsWith("VITE_"))
    ) {
      values[key] = value;
    }
  }
  return values;
}
