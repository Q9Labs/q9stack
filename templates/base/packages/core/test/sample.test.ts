import { Schema } from "effect";
import * as fc from "fast-check";
import { describe, expect, expectTypeOf, it } from "vitest";

import { SampleId } from "../src/ids.js";
import {
  createDraftSample,
  SampleEntitySchema,
  transitionSample,
  type SampleCommand,
  type SampleEntity,
  type SampleEntityKind,
  type SampleTransitionError,
  type SampleTransitionResult,
} from "../src/sample/index.js";

const sampleId = Schema.decodeUnknownSync(SampleId)("sample-1");
const publishCommand: SampleCommand = {
  kind: "publish",
  publishedAt: "2026-08-23T00:00:00.000Z",
};
const archiveCommand: SampleCommand = {
  archivedAt: "2026-08-24T00:00:00.000Z",
  kind: "archive",
};
const restoreCommand: SampleCommand = { kind: "restore" };

describe("sample lifecycle", () => {
  it("allows only the ordered draft, published, archived transitions", () => {
    const draft = createDraftSample(sampleId, "A sample");
    const published = transitionSample(draft, publishCommand);

    expect(published).toEqual({
      entity: {
        id: sampleId,
        kind: "published",
        publishedAt: "2026-08-23T00:00:00.000Z",
        title: "A sample",
      },
      ok: true,
    });

    if (!published.ok) {
      throw new Error("publishing a draft must succeed");
    }

    const archived = transitionSample(published.entity, archiveCommand);
    expect(archived.ok).toBe(true);
    expect(transitionSample(draft, archiveCommand)).toEqual({
      error: { command: "archive", from: "draft", kind: "invalid-transition" },
      ok: false,
    });
  });

  it("decodes the discriminated entity schema", () => {
    const draft = Schema.decodeUnknownSync(SampleEntitySchema)({
      id: "sample-1",
      kind: "draft",
      title: "A sample",
    });

    expect(draft).toEqual(createDraftSample(sampleId, "A sample"));
    expect(() =>
      Schema.decodeUnknownSync(SampleEntitySchema)({
        id: "sample-1",
        kind: "published",
        title: "A sample",
      }),
    ).toThrow();
  });

  it("preserves identity and content across arbitrary command sequences", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(publishCommand, archiveCommand, restoreCommand)),
        (sequence) => {
          let entity: SampleEntity = createDraftSample(sampleId, "A sample");

          for (const command of sequence) {
            const result = transitionSample(entity, command);
            if (result.ok) {
              expect(result.entity.id).toBe(sampleId);
              expect(result.entity.title).toBe("A sample");
              entity = result.entity;
            } else {
              expect(result.error.from).toBe(entity.kind);
              expect(result.error.kind).toBe("invalid-transition");
            }
          }
        },
      ),
    );
  });

  it("exposes discriminated result and entity types", () => {
    expectTypeOf<SampleEntity>().toMatchTypeOf<{ readonly kind: SampleEntityKind }>();
    expectTypeOf<SampleTransitionError>().toMatchTypeOf<{
      readonly kind: "invalid-transition";
      readonly from: SampleEntityKind;
    }>();
    expectTypeOf<SampleTransitionResult>().toMatchTypeOf<
      | { readonly ok: true; readonly entity: SampleEntity }
      | { readonly ok: false; readonly error: SampleTransitionError }
    >();
  });
});
