import { decodeSampleId, createDraftSample } from "@__APP_SLUG__/core";
import { it } from "@effect/vitest";
import { Effect } from "effect";
import { describe, expect } from "vitest";

import {
  applySampleTransition,
  decodeSampleRow,
  ConflictingTransition,
} from "../src/repositories.js";

const row = {
  archived_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
  id: "sample-1",
  published_at: "2026-01-01T00:00:00.000Z",
  state: "published",
  title: "A sample",
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("SampleRepo mapping and transitions", () => {
  it.effect("maps a published SQL row to the core union", () =>
    Effect.gen(function* () {
      const entity = yield* decodeSampleRow(row);
      expect(entity).toEqual({
        id: decodeSampleId("sample-1"),
        kind: "published",
        publishedAt: "2026-01-01T00:00:00.000Z",
        title: "A sample",
      });
    }),
  );

  it.effect("returns a typed conflict for an invalid transition", () =>
    Effect.gen(function* () {
      const id = decodeSampleId("sample-2");
      const result = yield* Effect.either(
        applySampleTransition(id, createDraftSample(id, "A draft"), {
          kind: "archive",
          archivedAt: "2026-01-01T00:00:00.000Z",
        }),
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(ConflictingTransition);
        expect(result.left).toMatchObject({
          command: "archive",
          from: "draft",
          id,
        });
      }
    }),
  );
});
