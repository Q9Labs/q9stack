import { Schema } from "effect";
import { describe, expect, expectTypeOf, it } from "vitest";

import { SampleId, type WorkspaceId } from "../src/ids.js";

describe("branded identifiers", () => {
  it("decodes non-empty identifiers and rejects empty values", () => {
    const sampleId = Schema.decodeUnknownSync(SampleId)("sample-1");

    expect(sampleId).toBe("sample-1");
    expect(() => Schema.decodeUnknownSync(SampleId)("")).toThrow();
  });

  it("keeps each identifier brand distinct", () => {
    expectTypeOf<SampleId>().toMatchTypeOf<string>();
    expectTypeOf<SampleId>().not.toEqualTypeOf<string>();
    expectTypeOf<SampleId>().not.toEqualTypeOf<WorkspaceId>();
  });
});
