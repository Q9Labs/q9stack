import type { AppConfig } from "@__APP_SLUG__/api";
import { Either, Redacted } from "effect";
import type { Redacted as RedactedValue } from "effect/Redacted";

export interface SeedEnvironmentValues {
  readonly APP_ENV: string;
  readonly API_PORT: number;
  readonly API_URL: URL;
  readonly APP_URL: URL;
  readonly BETTER_AUTH_SECRET: string;
  readonly DATABASE_URL: string;
}

const requireDevelopmentEnvironment = (value: string): Either.Either<"dev", Error> => {
  if (value === "dev") return Either.right("dev");
  return Either.left(
    new Error(
      value === "prod" ? "Refusing to seed APP_ENV=prod." : "APP_ENV must be either dev or prod.",
    ),
  );
};

export const createSeedConfig = (
  environment: SeedEnvironmentValues,
): Either.Either<AppConfig, Error> => {
  const appEnvironment = requireDevelopmentEnvironment(environment.APP_ENV);
  if (Either.isLeft(appEnvironment)) return Either.left(appEnvironment.left);

  return Either.right({
    apiPort: environment.API_PORT,
    apiURL: environment.API_URL,
    appURL: environment.APP_URL,
    betterAuthSecret: environment.BETTER_AUTH_SECRET,
    databaseURL: environment.DATABASE_URL,
    environment: appEnvironment.right,
  });
};

export const preflightSeedEnvironment = <E>(
  parsed: Either.Either<SeedEnvironmentValues, E>,
): Either.Either<AppConfig, E | Error> => {
  if (Either.isLeft(parsed)) return Either.left(parsed.left);
  return createSeedConfig(parsed.right);
};

export const redactedSeedEnvironment = (environment: {
  readonly APP_ENV: string;
  readonly API_PORT: number;
  readonly API_URL: URL;
  readonly APP_URL: URL;
  readonly BETTER_AUTH_SECRET: RedactedValue;
  readonly DATABASE_URL: RedactedValue;
}): SeedEnvironmentValues => ({
  API_PORT: environment.API_PORT,
  API_URL: environment.API_URL,
  APP_ENV: environment.APP_ENV,
  APP_URL: environment.APP_URL,
  BETTER_AUTH_SECRET: Redacted.value(environment.BETTER_AUTH_SECRET),
  DATABASE_URL: Redacted.value(environment.DATABASE_URL),
});
