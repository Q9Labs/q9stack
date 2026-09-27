import { betterAuth } from "better-auth";
import { Context, Effect, Layer, Schema } from "effect";
import { Pool } from "pg";

import type { AppConfig } from "./config.js";
import {
  createPasswordResetDelivery,
  type PasswordResetDelivery,
} from "./password-reset-delivery.js";

const createBetterAuth = (
  config: AppConfig,
  pool: Pool,
  passwordResetDelivery: PasswordResetDelivery,
) => {
  const production = config.environment === "prod";
  return betterAuth({
    appName: "__APP_NAME__",
    basePath: "/api/auth",
    baseURL: config.apiURL.toString(),
    database: pool,
    emailAndPassword: {
      enabled: true,
      sendResetPassword: ({ user, url }) =>
        passwordResetDelivery.deliver({ email: user.email, resetUrl: url }),
    },
    secret: config.betterAuthSecret,
    trustedOrigins: [config.appURL.origin],
    user: {
      additionalFields: {
        role: {
          defaultValue: "member",
          input: false,
          required: false,
          type: "string",
        },
      },
    },
    advanced: {
      database: {
        validateSchema: config.validateAuthDatabaseSchema ?? true,
      },
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: production ? "none" : "lax",
        secure: production,
      },
      useSecureCookies: production,
    },
  });
};

export type BetterAuth = ReturnType<typeof createBetterAuth>;

export interface AuthServer {
  readonly auth: BetterAuth;
  readonly passwordResetDelivery: PasswordResetDelivery;
  readonly pool: Pool;
  readonly close: () => Promise<void>;
}

export class AuthService extends Context.Tag("@__APP_SLUG__/api/AuthService")<
  AuthService,
  AuthServer
>() {}

const DevAccountRowSchema = Schema.Struct({
  email: Schema.String,
  id: Schema.String,
  role: Schema.Literal("admin", "member", "viewer"),
});
type DevAccountRow = Schema.Schema.Type<typeof DevAccountRowSchema>;

export interface DevAccount {
  readonly id: string;
  readonly email: string;
  readonly role: DevAccountRow["role"];
  readonly environment: "development";
}

export class AuthDatabaseError extends Error {
  override readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "AuthDatabaseError";
    this.cause = cause;
  }
}

const toDevAccount = (row: unknown): DevAccount => {
  const parsed = Schema.decodeUnknownEither(DevAccountRowSchema)(row);
  if (parsed._tag === "Left") {
    throw new AuthDatabaseError("Better Auth returned an invalid account row", parsed.left);
  }
  return {
    email: parsed.right.email,
    environment: "development",
    id: parsed.right.id,
    role: parsed.right.role,
  };
};

export const listDevelopmentAccounts = async (pool: Pool): Promise<readonly DevAccount[]> => {
  const result = await pool.query<DevAccountRow>(
    'SELECT id, email, role FROM "user" ORDER BY email ASC',
  );
  return result.rows.map(toDevAccount);
};

export const createAuthServer = (config: AppConfig): AuthServer => {
  const pool = new Pool({ connectionString: config.databaseURL });
  const passwordResetDelivery = createPasswordResetDelivery({
    environment: config.environment,
    ...(config.passwordResetWebhookToken === undefined
      ? {}
      : { webhookToken: config.passwordResetWebhookToken }),
    ...(config.passwordResetWebhookURL === undefined
      ? {}
      : { webhookUrl: config.passwordResetWebhookURL }),
  });
  const auth = createBetterAuth(config, pool, passwordResetDelivery);

  return {
    auth,
    close: () => pool.end(),
    passwordResetDelivery,
    pool,
  };
};

export const AuthServerLive = (config: AppConfig): Layer.Layer<AuthService> =>
  Layer.scoped(
    AuthService,
    Effect.acquireRelease(
      Effect.sync(() => createAuthServer(config)),
      (server) => Effect.promise(server.close),
    ),
  );
