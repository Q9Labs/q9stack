import { describe, expect, it } from "@effect/vitest";
import { MockLanguageModelV3 } from "ai/test";
import { Schema, Effect } from "effect";

import { InvalidResponse, makeModelRegistry, ProviderUnavailable, RateLimited } from "../index.js";
import { makeLanguageModel } from "./language-model.js";

const modelResult = (text: string) => ({
  content: [{ type: "text" as const, text }],
  finishReason: { unified: "stop" as const, raw: undefined },
  usage: {
    inputTokens: {
      total: 1,
      noCache: 1,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: 2,
      text: 2,
      reasoning: undefined,
    },
  },
  warnings: [],
});

describe("LanguageModel", () => {
  it.effect("runs text generation through a mock AI SDK model", () =>
    Effect.gen(function* () {
      const model = new MockLanguageModelV3({
        modelId: "mock/text",
        doGenerate: modelResult("hello"),
      });
      const service = makeLanguageModel({
        registry: makeModelRegistry({ models: { default: "mock/text" } }),
        resolveModel: () => model,
      });

      const result = yield* service.generateText({ prompt: "hello" });

      expect(result.text).toBe("hello");
      expect(result.usage.totalTokens).toBe(3);
    }),
  );

  it.effect("validates generated objects with the Effect schema", () =>
    Effect.gen(function* () {
      const model = new MockLanguageModelV3({
        modelId: "mock/object",
        doGenerate: modelResult('{"name":"q9"}'),
      });
      const service = makeLanguageModel({
        registry: makeModelRegistry({ models: { default: "mock/object" } }),
        resolveModel: () => model,
      });

      const result = yield* service.generateObject({
        prompt: "return a name",
        schema: Schema.Struct({ name: Schema.String }),
      });

      expect(result.name).toBe("q9");
    }),
  );

  it.effect("turns a schema mismatch into InvalidResponse", () =>
    Effect.gen(function* () {
      const model = new MockLanguageModelV3({
        modelId: "mock/invalid",
        doGenerate: modelResult('{"name":42}'),
      });
      const service = makeLanguageModel({
        registry: makeModelRegistry({ models: { default: "mock/invalid" } }),
        resolveModel: () => model,
      });

      const result = yield* Effect.either(
        service.generateObject({
          prompt: "return a name",
          schema: Schema.Struct({ name: Schema.String }),
        }),
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(InvalidResponse);
      }
    }),
  );

  it.live("retries one rate limit and returns the successful result", () =>
    Effect.gen(function* () {
      let attempts = 0;
      const model = new MockLanguageModelV3({
        modelId: "mock/retry",
        doGenerate: modelResult("recovered"),
      });
      const service = makeLanguageModel({
        registry: makeModelRegistry({ models: { default: "mock/retry" } }),
        resolveModel: () => {
          attempts += 1;
          if (attempts === 1) {
            throw new RateLimited({
              message: "slow down",
              model: "mock/retry",
              operation: "generateText",
            });
          }
          return model;
        },
      });

      const result = yield* service.generateText({ prompt: "retry" });

      expect(attempts).toBe(2);
      expect(result.text).toBe("recovered");
    }),
  );

  it.effect("does not retry a non-retryable response", () =>
    Effect.gen(function* () {
      let attempts = 0;
      const error = new InvalidResponse({
        message: "invalid output",
        model: "mock/invalid",
        operation: "generateText",
      });
      const service = makeLanguageModel({
        registry: makeModelRegistry({ models: { default: "mock/invalid" } }),
        resolveModel: () => {
          attempts += 1;
          throw error;
        },
      });

      const result = yield* Effect.either(service.generateText({ prompt: "invalid" }));

      expect(attempts).toBe(1);
      expect(result._tag).toBe("Left");
      if (result._tag === "Left") expect(result.left).toBe(error);
    }),
  );

  it.effect("does not repeat generation when usage logging fails", () =>
    Effect.gen(function* () {
      let attempts = 0;
      const model = new MockLanguageModelV3({
        modelId: "mock/usage",
        doGenerate: modelResult("hello"),
      });
      const service = makeLanguageModel({
        registry: makeModelRegistry({ models: { default: "mock/usage" } }),
        resolveModel: () => {
          attempts += 1;
          return model;
        },
        onUsage: () => {
          throw new Error("usage sink failed");
        },
      });

      const result = yield* Effect.either(service.generateText({ prompt: "hello" }));

      expect(attempts).toBe(1);
      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(ProviderUnavailable);
      }
    }),
  );
});
