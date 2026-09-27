import { defineEnv, schemas } from "@q9labsai/env";
import type { EnvContract, EnvEntry } from "@q9labsai/env";
import type { Redacted } from "effect/Redacted";

type AppEnvironmentSpec = {
  readonly APP_ENV: EnvEntry<"dev" | "prod"> & { readonly scope: "client" };
  readonly APP_URL: EnvEntry<URL> & { readonly scope: "client" };
  readonly LOG_LEVEL: EnvEntry<"debug" | "info" | "warn" | "error"> & {
    readonly scope: "server";
  };
  readonly OPENROUTER_API_KEY: EnvEntry<Redacted> & { readonly scope: "server" };
  readonly SENTRY_DSN: EnvEntry<URL> & {
    readonly required: false;
    readonly scope: "client";
  };
};

export const envSchema: AppEnvironmentSpec = {
  APP_ENV: {
    description: "Deployment environment the app is running in",
    schema: schemas.enumeration(["dev", "prod"]),
    scope: "client",
  },
  APP_URL: {
    description: "Public origin the app is served from",
    schema: schemas.url(),
    scope: "client",
  },
  LOG_LEVEL: {
    description: "Minimum level emitted by the server logger",
    schema: schemas.enumeration(["debug", "info", "warn", "error"]),
    scope: "server",
  },
  OPENROUTER_API_KEY: {
    description: "OpenRouter API key for model calls",
    schema: schemas.redacted(),
    scope: "server",
  },
  SENTRY_DSN: {
    description: "Sentry ingestion endpoint; unset disables reporting",
    required: false,
    schema: schemas.url(),
    scope: "client",
  },
} as const;

export const appEnv: EnvContract<AppEnvironmentSpec> = defineEnv(envSchema);

export const webServerEnv = appEnv;

export const browserEnv = defineEnv({
  APP_ENV: envSchema.APP_ENV,
  APP_URL: envSchema.APP_URL,
  SENTRY_DSN: envSchema.SENTRY_DSN,
});
