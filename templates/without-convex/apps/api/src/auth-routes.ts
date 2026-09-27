import { HttpApiBuilder, HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";

import { AuthService, listDevelopmentAccounts } from "./auth.js";
import type { AppConfig } from "./config.js";

export const AuthRoutesLive = (config: AppConfig) =>
  HttpApiBuilder.Router.use((router) =>
    Effect.gen(function* () {
      const authServer = yield* AuthService;
      yield* router.all(
        "/api/auth/*",
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest;
          const webRequest = yield* HttpServerRequest.toWeb(request);
          const response = yield* Effect.tryPromise(() => authServer.auth.handler(webRequest));
          return HttpServerResponse.fromWeb(response);
        }).pipe(
          Effect.tapErrorCause(Effect.logError),
          Effect.catchAll(() => Effect.succeed(HttpServerResponse.empty({ status: 500 }))),
        ),
      );

      yield* router.get(
        "/api/dev/accounts",
        Effect.gen(function* () {
          if (config.environment === "prod") {
            return HttpServerResponse.empty({ status: 404 });
          }
          const accounts = yield* Effect.tryPromise(() => listDevelopmentAccounts(authServer.pool));
          return yield* HttpServerResponse.json({ accounts });
        }).pipe(
          Effect.tapErrorCause(Effect.logError),
          Effect.catchAll(() => Effect.succeed(HttpServerResponse.empty({ status: 500 }))),
        ),
      );

      yield* router.get(
        "/api/dev/password-reset",
        Effect.gen(function* () {
          if (config.environment === "prod") {
            return HttpServerResponse.empty({ status: 404 });
          }
          const request = yield* HttpServerRequest.HttpServerRequest;
          const webRequest = yield* HttpServerRequest.toWeb(request);
          const email = new URL(webRequest.url).searchParams.get("email");
          if (email === null || email.length === 0) {
            return HttpServerResponse.empty({ status: 400 });
          }
          const resetUrl = authServer.passwordResetDelivery.developmentUrl(email);
          return resetUrl === undefined
            ? HttpServerResponse.empty({ status: 404 })
            : yield* HttpServerResponse.json({ resetUrl });
        }).pipe(
          Effect.tapErrorCause(Effect.logError),
          Effect.catchAll(() => Effect.succeed(HttpServerResponse.empty({ status: 500 }))),
        ),
      );
    }),
  );
