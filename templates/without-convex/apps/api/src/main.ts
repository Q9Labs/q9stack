import { createServer } from "node:http";

import { RuntimeSqlLive, SampleRepoLive } from "@__APP_SLUG__/database";
import { HttpApiBuilder, HttpMiddleware } from "@effect/platform";
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Effect, Layer } from "effect";

import { makeApiApplicationLive } from "./api.js";
import { readAppConfig } from "./config.js";
import { requestLogger, shouldDisableRequestTracing } from "./request-logging.js";

const Main = Effect.gen(function* () {
  const config = readAppConfig();
  const nodeServer = NodeHttpServer.layer(createServer, { port: config.apiPort });
  const listenURL = new URL(config.apiURL.toString());
  listenURL.port = String(config.apiPort);
  const database = SampleRepoLive.pipe(Layer.provide(RuntimeSqlLive));
  const application = makeApiApplicationLive(config).pipe(Layer.provide(database));
  const server = HttpApiBuilder.serve((httpApp) =>
    HttpMiddleware.cors({
      allowedHeaders: ["content-type", "authorization"],
      allowedMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedOrigins: [config.appURL.origin],
      credentials: true,
    })(requestLogger(httpApp)),
  ).pipe(
    HttpMiddleware.withTracerDisabledWhen((request) => shouldDisableRequestTracing(request.url)),
    Layer.provide(application),
    Layer.provide(nodeServer),
  );

  yield* Effect.log(`API listening on ${listenURL.origin}`);
  yield* Layer.launch(server);
});

NodeRuntime.runMain(Main);
