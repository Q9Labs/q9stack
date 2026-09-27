import { createDraftSample, decodeSampleId } from "@__APP_SLUG__/core";
import { it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { expect } from "vitest";

import { SampleRepo, SampleRepoLive, databaseLayer, runMigrations } from "../src/index.js";

const databaseUrl = process.env["DATABASE_URL"];
const test = it;

if (databaseUrl === undefined) {
  test.skip("sample repository integration requires DATABASE_URL; set it to run against PostgreSQL", () =>
    expect.fail("The skipped PostgreSQL integration test must not execute without DATABASE_URL."));
} else {
  test.effect("persists and transitions a sample entity in PostgreSQL", () => {
    const repositoryLayer = Layer.provideMerge(SampleRepoLive, databaseLayer(databaseUrl));
    return Effect.gen(function* () {
      yield* runMigrations;
      const repository = yield* SampleRepo;
      const id = decodeSampleId(`integration-${Date.now()}`);
      const draft = yield* repository.insert(createDraftSample(id, "Integration sample"));
      expect(draft.kind).toBe("draft");

      const published = yield* repository.transition(id, {
        kind: "publish",
        publishedAt: "2026-01-01T00:00:00.000Z",
      });
      expect(published.kind).toBe("published");
      expect((yield* repository.get(id)).kind).toBe("published");
    }).pipe(Effect.provide(repositoryLayer));
  });
}
