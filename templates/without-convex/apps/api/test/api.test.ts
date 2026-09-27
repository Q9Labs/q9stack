import { createDraftSample, decodeSampleId, type SampleId } from "@__APP_SLUG__/core";
import * as Database from "@__APP_SLUG__/database";
import { HttpApiBuilder, HttpServer } from "@effect/platform";
import { it, expect } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { ApiLive, makeApiApplicationLive } from "../src/api.js";
import type { AppConfig, AppEnvironment } from "../src/config.js";

const sampleId: SampleId = decodeSampleId("sample-1");
const draftSample = createDraftSample(sampleId, "First sample");

const makeHandler = (
  sampleRepo: Database.SampleRepository,
): ReturnType<typeof HttpApiBuilder.toWebHandler> =>
  HttpApiBuilder.toWebHandler(
    Layer.mergeAll(ApiLive, HttpServer.layerContext).pipe(
      Layer.provide(Layer.succeed(Database.SampleRepo, sampleRepo)),
    ),
  );

const configuredHandler = (environment: AppEnvironment) =>
  HttpApiBuilder.toWebHandler(
    Layer.mergeAll(
      makeApiApplicationLive({
        apiPort: 3001,
        apiURL: new URL("http://api.test"),
        appURL: new URL("http://web.test"),
        betterAuthSecret: "test-only-secret-with-thirty-two-characters",
        databaseURL: "postgres://invalid:invalid@127.0.0.1:1/invalid",
        environment,
        validateAuthDatabaseSchema: false,
      } satisfies AppConfig),
      HttpServer.layerContext,
    ).pipe(
      Layer.provide(
        Layer.succeed(Database.SampleRepo, {
          get: () => Effect.succeed(draftSample),
          insert: () => Effect.succeed(draftSample),
          list: () => Effect.succeed([draftSample]),
          transition: () => Effect.succeed(draftSample),
        }),
      ),
    ),
  );

const requestJSON = (url: string, method: string, body: unknown): Request =>
  new Request(url, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method,
  });

it.effect("serves health through the built HttpApi handler", () =>
  Effect.tryPromise(async () => {
    const app = makeHandler({
      get: () => Effect.succeed(draftSample),
      insert: () => Effect.succeed(draftSample),
      list: () => Effect.succeed([draftSample]),
      transition: () => Effect.succeed(draftSample),
    });
    try {
      const response = await app.handler(new Request("http://api.test/api/health"));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "ok", version: "0.1.0" });
    } finally {
      await app.dispose();
    }
  }),
);

it.effect("inserts and lists samples through the built handler", () =>
  Effect.tryPromise(async () => {
    const app = makeHandler({
      get: () => Effect.succeed(draftSample),
      insert: () => Effect.succeed(draftSample),
      list: () => Effect.succeed([draftSample]),
      transition: () => Effect.succeed(draftSample),
    });
    try {
      const inserted = await app.handler(
        requestJSON("http://api.test/api/samples", "POST", draftSample),
      );
      expect(inserted.status).toBe(200);
      expect(await inserted.json()).toEqual(draftSample);

      const listed = await app.handler(new Request("http://api.test/api/samples"));
      expect(listed.status).toBe(200);
      expect(await listed.json()).toEqual([draftSample]);
    } finally {
      await app.dispose();
    }
  }),
);

it.effect("maps a repository NotFound error to a 404 response", () =>
  Effect.tryPromise(async () => {
    const app = makeHandler({
      get: () => Effect.fail(new Database.NotFound({ id: sampleId })),
      insert: () => Effect.succeed(draftSample),
      list: () => Effect.succeed([draftSample]),
      transition: () => Effect.succeed(draftSample),
    });
    try {
      const response = await app.handler(new Request(`http://api.test/api/samples/${sampleId}`));
      expect(response.status).toBe(404);
    } finally {
      await app.dispose();
    }
  }),
);

it.effect("mounts Better Auth and hides development accounts in production", () =>
  Effect.tryPromise(async () => {
    const developmentApp = configuredHandler("dev");
    try {
      const response = await developmentApp.handler(new Request("http://api.test/api/auth/ok"));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
    } finally {
      await developmentApp.dispose();
    }

    const productionApp = configuredHandler("prod");
    try {
      const accountsResponse = await productionApp.handler(
        new Request("http://api.test/api/dev/accounts"),
      );
      expect(accountsResponse.status).toBe(404);
      const resetResponse = await productionApp.handler(
        new Request("http://api.test/api/dev/password-reset?email=member%40dev.local"),
      );
      expect(resetResponse.status).toBe(404);
    } finally {
      await productionApp.dispose();
    }
  }),
);
