import { AppApi } from "@__APP_SLUG__/contracts";
import { HttpApiBuilder, HttpApiSwagger } from "@effect/platform";
import { Layer } from "effect";

import { AuthRoutesLive } from "./auth-routes.js";
import { AuthServerLive } from "./auth.js";
import type { AppConfig } from "./config.js";
import { HealthHandlersLive } from "./health-handlers.js";
import { SampleHandlersLive } from "./sample-handlers.js";

const HandlerLayers = Layer.mergeAll(HealthHandlersLive, SampleHandlersLive);

export const ApiLive = HttpApiBuilder.api(AppApi).pipe(Layer.provide(HandlerLayers));

const ApiDocumentationLive = Layer.mergeAll(
  HttpApiSwagger.layer({ path: "/docs" }),
  HttpApiBuilder.middlewareOpenApi({ path: "/openapi.json" }),
).pipe(Layer.provideMerge(ApiLive));

export const makeApiApplicationLive = (config: AppConfig) =>
  Layer.mergeAll(
    ApiDocumentationLive,
    AuthRoutesLive(config).pipe(Layer.provide(AuthServerLive(config))),
  );
