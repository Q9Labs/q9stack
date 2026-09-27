import {
  generateObject as aiGenerateObject,
  generateText as aiGenerateText,
  streamText as aiStreamText,
  type LanguageModel as AiLanguageModel,
  type Schema as AiSchema,
} from "ai";
import { Either, Effect, Stream, Schema } from "effect";

import type { ModelRegistry } from "../core/index.js";
import {
  InvalidResponse,
  type LanguageModelError,
  type ModelRole,
  type ModelUsage,
  retryLanguageModel,
  type UsageLogger,
} from "../core/index.js";
import { mapAiSdkError, type ErrorMappingContext } from "./errors.js";
import {
  makeTextArguments,
  type GenerationOptions,
  type ObjectGenerationOptions,
} from "./request.js";
import { toAiSdkSchema } from "./schema.js";
import { mapUsage, reportUsage, usageEvent } from "./usage.js";

export interface TextGenerationResult {
  readonly text: string;
  readonly finishReason: string;
  readonly usage: ModelUsage;
}

export type {
  GenerationInput,
  GenerationOptions,
  GenerationSettings,
  ObjectGenerationOptions,
} from "./request.js";

export interface LanguageModelService {
  readonly generateText: (
    options: GenerationOptions,
  ) => Effect.Effect<TextGenerationResult, LanguageModelError>;
  readonly streamText: (
    options: GenerationOptions,
  ) => Effect.Effect<Stream.Stream<string, LanguageModelError>, LanguageModelError>;
  readonly generateObject: <A, I>(
    options: ObjectGenerationOptions<A, I>,
  ) => Effect.Effect<A, LanguageModelError>;
}

export interface LanguageModelDependencies {
  readonly registry: ModelRegistry;
  readonly resolveModel: (modelId: string) => AiLanguageModel;
  readonly onUsage?: UsageLogger;
}

const selectModel = (
  registry: ModelRegistry,
  requestedModel: string | undefined,
  role: ModelRole | undefined,
): string => registry.resolveName(requestedModel ?? role ?? "default");

export const makeLanguageModel = (
  dependencies: LanguageModelDependencies,
): LanguageModelService => ({
  generateText: (options) => {
    const model = selectModel(dependencies.registry, options.model, options.role);
    const context: ErrorMappingContext = { model, operation: "generateText" };
    const effect = Effect.gen(function* () {
      const result = yield* retryLanguageModel(
        Effect.tryPromise({
          try: () => aiGenerateText(makeTextArguments(options, dependencies.resolveModel(model))),
          catch: (cause) => mapAiSdkError(cause, context),
        }),
      );
      const usage = mapUsage(result.totalUsage);
      yield* reportUsage(dependencies.onUsage, usageEvent(model, "generateText", usage), context);
      return {
        text: result.text,
        finishReason: result.finishReason,
        usage,
      };
    });
    return effect;
  },

  streamText: (options) => {
    const model = selectModel(dependencies.registry, options.model, options.role);
    const context: ErrorMappingContext = { model, operation: "streamText" };
    const effect = Effect.try({
      try: () => {
        const result = aiStreamText(makeTextArguments(options, dependencies.resolveModel(model)));
        const stream = Stream.fromAsyncIterable(result.textStream, (cause) =>
          mapAiSdkError(cause, context),
        );
        const report =
          dependencies.onUsage === undefined
            ? Effect.void
            : Effect.tryPromise({
                try: async () => {
                  const usage = mapUsage(await result.totalUsage);
                  await dependencies.onUsage?.(usageEvent(model, "streamText", usage));
                },
                catch: (cause) => mapAiSdkError(cause, context),
              });
        return stream.pipe(Stream.onEnd(report));
      },
      catch: (cause) => mapAiSdkError(cause, context),
    });
    return retryLanguageModel(effect);
  },

  generateObject: <A, I>(options: ObjectGenerationOptions<A, I>) => {
    const model = selectModel(dependencies.registry, options.model, options.role);
    const context: ErrorMappingContext = {
      model,
      operation: "generateObject",
    };
    const effect = Effect.gen(function* () {
      const aiSchema = yield* Effect.try({
        try: () => toAiSdkSchema(options.schema),
        catch: (cause) =>
          new InvalidResponse({
            ...context,
            message: "Could not convert the Effect schema to JSON Schema",
            cause,
          }),
      });
      const result = yield* retryLanguageModel(
        Effect.tryPromise({
          try: () =>
            aiGenerateObject<AiSchema<A>, "object", A>({
              ...makeTextArguments(options, dependencies.resolveModel(model)),
              schema: aiSchema,
            }),
          catch: (cause) => mapAiSdkError(cause, context),
        }),
      );
      const decoded = Schema.decodeUnknownEither(options.schema)(result.object);
      if (Either.isLeft(decoded)) {
        return yield* Effect.fail(
          new InvalidResponse({
            ...context,
            message: "The provider returned an object that failed schema validation",
            cause: decoded.left,
          }),
        );
      }
      const usage = mapUsage(result.usage);
      yield* reportUsage(dependencies.onUsage, usageEvent(model, "generateObject", usage), context);
      return decoded.right;
    });
    return effect;
  },
});
