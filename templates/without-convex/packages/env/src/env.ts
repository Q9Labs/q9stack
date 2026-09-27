import { defineEnv, schema } from "@q9labsai/env";
import type { EnvContract, EnvEntry } from "@q9labsai/env";
import type { Redacted } from "effect/Redacted";

type AppEnvironmentSpec = {
  readonly APP_ENV: EnvEntry<"dev" | "prod"> & { readonly scope: "build" };
  readonly APP_URL: EnvEntry<URL> & { readonly scope: "client" };
  readonly API_URL: EnvEntry<URL> & { readonly scope: "client" };
  readonly API_PORT: EnvEntry<number> & { readonly scope: "server" };
  readonly DATABASE_URL: EnvEntry<Redacted> & { readonly scope: "server" };
  readonly BETTER_AUTH_SECRET: EnvEntry<Redacted> & { readonly scope: "server" };
  readonly LOG_LEVEL: EnvEntry<string> & { readonly scope: "server" };
  readonly OPENROUTER_API_KEY: EnvEntry<Redacted> & { readonly scope: "server" };
  readonly PUBLIC_APP_URL: EnvEntry<URL> & { readonly scope: "client" };
  readonly PUBLIC_API_URL: EnvEntry<URL> & { readonly scope: "client" };
  readonly PASSWORD_RESET_WEBHOOK_TOKEN: EnvEntry<Redacted> & {
    readonly required: false;
    readonly scope: "server";
  };
  readonly PASSWORD_RESET_WEBHOOK_URL: EnvEntry<URL> & {
    readonly required: false;
    readonly scope: "server";
  };
  readonly SENTRY_DSN: EnvEntry<URL> & {
    readonly required: false;
    readonly scope: "client";
  };
};

export const envSchema: AppEnvironmentSpec = {
  APP_ENV: {
    description: "Runtime environment name.",
    schema: schema.enumeration(["dev", "prod"]),
    scope: "build",
  },
  APP_URL: {
    description: "Canonical application URL.",
    schema: schema.url(),
    scope: "client",
  },
  API_URL: {
    description: "Canonical API URL.",
    schema: schema.url(),
    scope: "client",
  },
  API_PORT: {
    description: "API listen port.",
    schema: schema.integer(),
    scope: "server",
  },
  DATABASE_URL: {
    description: "PostgreSQL connection URL.",
    schema: schema.redacted(),
    scope: "server",
  },
  BETTER_AUTH_SECRET: {
    description: "Better Auth signing secret.",
    schema: schema.redacted(),
    scope: "server",
  },
  LOG_LEVEL: {
    description: "Server log level.",
    schema: schema.string(),
    scope: "server",
  },
  OPENROUTER_API_KEY: {
    description: "Server-only OpenRouter credential.",
    schema: schema.redacted(),
    scope: "server",
  },
  PUBLIC_APP_URL: {
    description: "Browser-safe application origin embedded in the web bundle.",
    schema: schema.url(),
    scope: "client",
  },
  PUBLIC_API_URL: {
    description: "Browser-safe API origin embedded in the web bundle.",
    schema: schema.url(),
    scope: "client",
  },
  PASSWORD_RESET_WEBHOOK_TOKEN: {
    description: "Optional bearer token for the production password-reset webhook.",
    required: false,
    schema: schema.redacted(),
    scope: "server",
  },
  PASSWORD_RESET_WEBHOOK_URL: {
    description: "Optional HTTPS webhook that delivers production password-reset messages.",
    required: false,
    schema: schema.url(),
    scope: "server",
  },
  SENTRY_DSN: {
    description: "Optional Sentry project DSN.",
    schema: schema.url(),
    required: false,
    scope: "client",
  },
};

export const appEnv: EnvContract<AppEnvironmentSpec> = defineEnv(envSchema);

export const webServerEnv = defineEnv({
  APP_ENV: envSchema.APP_ENV,
  APP_URL: envSchema.APP_URL,
  LOG_LEVEL: envSchema.LOG_LEVEL,
  OPENROUTER_API_KEY: envSchema.OPENROUTER_API_KEY,
  PUBLIC_APP_URL: envSchema.PUBLIC_APP_URL,
  PUBLIC_API_URL: envSchema.PUBLIC_API_URL,
  SENTRY_DSN: envSchema.SENTRY_DSN,
});

export const browserEnv = defineEnv({
  APP_ENV: envSchema.APP_ENV,
  APP_URL: envSchema.APP_URL,
  SENTRY_DSN: envSchema.SENTRY_DSN,
});

export const migrationEnv = defineEnv({
  APP_ENV: envSchema.APP_ENV,
  DATABASE_URL: envSchema.DATABASE_URL,
});
