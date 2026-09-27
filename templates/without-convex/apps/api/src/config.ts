import { appEnv } from "@__APP_SLUG__/env";
import { Redacted } from "effect";

export type AppEnvironment = "dev" | "prod";

export interface AppConfig {
  readonly environment: AppEnvironment;
  readonly appURL: URL;
  readonly apiURL: URL;
  readonly apiPort: number;
  readonly databaseURL: string;
  readonly betterAuthSecret: string;
  readonly validateAuthDatabaseSchema?: boolean;
  readonly passwordResetWebhookToken?: string;
  readonly passwordResetWebhookURL?: URL;
}

export class AppConfigError extends Error {
  override readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "AppConfigError";
    this.cause = cause;
  }
}

type ParsedEnvironment = Extract<
  ReturnType<typeof appEnv.parse>,
  { readonly _tag: "Right" }
>["right"];

const parseEnvironment = (source: Record<string, string | undefined>): ParsedEnvironment => {
  const parsed = appEnv.parse(source);
  if (parsed._tag === "Left") {
    throw new AppConfigError(
      `The application environment is invalid: ${parsed.left.message}`,
      parsed.left,
    );
  }
  return parsed.right;
};

const parseAppEnvironment = (value: string): AppEnvironment => {
  if (value === "dev" || value === "prod") return value;
  throw new AppConfigError("APP_ENV must be either dev or prod");
};

const requireUrl = (key: string, value: URL): URL => {
  if (!(value instanceof URL)) {
    throw new AppConfigError(`${key} must be a URL`);
  }
  return value;
};

const requirePort = (value: number): number => {
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new AppConfigError("API_PORT must be an integer from 1 to 65535");
  }
  return value;
};

export const readAppConfig = (
  source: Record<string, string | undefined> = process.env,
): AppConfig => {
  const environment = parseEnvironment(source);
  return {
    apiPort: requirePort(environment.API_PORT),
    apiURL: requireUrl("API_URL", environment.API_URL),
    appURL: requireUrl("APP_URL", environment.APP_URL),
    betterAuthSecret: Redacted.value(environment.BETTER_AUTH_SECRET),
    databaseURL: Redacted.value(environment.DATABASE_URL),
    environment: parseAppEnvironment(environment.APP_ENV),
    ...(environment.PASSWORD_RESET_WEBHOOK_TOKEN === undefined
      ? {}
      : {
          passwordResetWebhookToken: Redacted.value(environment.PASSWORD_RESET_WEBHOOK_TOKEN),
        }),
    ...(environment.PASSWORD_RESET_WEBHOOK_URL === undefined
      ? {}
      : {
          passwordResetWebhookURL: requireUrl(
            "PASSWORD_RESET_WEBHOOK_URL",
            environment.PASSWORD_RESET_WEBHOOK_URL,
          ),
        }),
  };
};
