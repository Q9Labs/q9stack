import { describe, expect, expectTypeOf, it } from "vitest";

import type { SampleEntity } from "../../packages/core/src/index.js";
import { createSampleFixtures, type SampleFixtures } from "../sample.js";

describe("sample fixtures", () => {
  it("covers every sample entity discriminant", () => {
    const fixtures = createSampleFixtures(17);

    expect(fixtures.draft.kind).toBe("draft");
    expect(fixtures.published.kind).toBe("published");
    expect(fixtures.archived.kind).toBe("archived");
    expect(fixtures.draft.id).toBe(fixtures.published.id);
    expect(fixtures.published.id).toBe(fixtures.archived.id);
  });

  it("is deterministic for the same seed", () => {
    expect(createSampleFixtures(17)).toEqual(createSampleFixtures(17));
    expect(createSampleFixtures(18)).not.toEqual(createSampleFixtures(17));
  });

  it("returns the named fixture types", () => {
    expectTypeOf<SampleFixtures>().toMatchTypeOf<{
      readonly draft: Extract<SampleEntity, { readonly kind: "draft" }>;
      readonly published: Extract<SampleEntity, { readonly kind: "published" }>;
      readonly archived: Extract<SampleEntity, { readonly kind: "archived" }>;
    }>();
  });
});
