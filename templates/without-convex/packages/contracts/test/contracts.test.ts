import { OpenApi } from "@effect/platform";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  AppApi,
  SampleCommandSchema,
  SampleEntitySchema,
  type ConflictingTransition,
  type HealthResponse,
  type NotFound,
} from "../src/index.js";

describe("app HTTP contract", () => {
  it("exposes the health and sample paths", () => {
    const spec = OpenApi.fromApi(AppApi);

    expect(Object.keys(spec.paths).toSorted()).toEqual([
      "/api/health",
      "/api/samples",
      "/api/samples/{id}",
      "/api/samples/{id}/transition",
    ]);
    expect(spec.paths["/api/health"]?.get).toBeDefined();
    expect(spec.paths["/api/samples"]?.get).toBeDefined();
    expect(spec.paths["/api/samples"]?.post).toBeDefined();
    expect(spec.paths["/api/samples/{id}"]?.get).toBeDefined();
    expect(spec.paths["/api/samples/{id}/transition"]?.post).toBeDefined();
  });

  it("keeps payload and transport error types explicit", () => {
    expectTypeOf<HealthResponse>().toEqualTypeOf<{
      readonly status: "ok";
      readonly version: "0.1.0";
    }>();
    expectTypeOf<NotFound>().toMatchTypeOf<{ readonly id: string }>();
    expectTypeOf<ConflictingTransition>().toMatchTypeOf<{
      readonly command: "publish" | "archive" | "restore";
      readonly from: "draft" | "published" | "archived";
      readonly id: string;
    }>();
    expect(SampleCommandSchema).toBeDefined();
    expect(SampleEntitySchema).toBeDefined();
  });
});
