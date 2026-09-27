import type { LanguageModel as AiLanguageModel } from "ai";
import { Cause, Effect, Exit, Stream } from "effect";

import type { ModelRegistry } from "../core/models.js";
import {
  makeLanguageModel,
  type GenerationOptions,
  type LanguageModelService,
  type ObjectGenerationOptions,
  type TextGenerationResult,
} from "../effect/language-model.js";
import { makeOpenRouterClient, type OpenRouterConfig } from "../effect/openrouter.js";

export interface PlainLanguageModelClient {
  readonly models: ModelRegistry;
  readonly generateText: (options: GenerationOptions) => Promise<TextGenerationResult>;
  readonly streamText: (options: GenerationOptions) => Promise<AsyncIterable<string>>;
  readonly generateObject: <A, I>(options: ObjectGenerationOptions<A, I>) => Promise<A>;
}

export interface PlainClientOverrides {
  readonly resolveModel?: (modelId: string) => AiLanguageModel;
}

const runEffect = async <A, E extends Error>(effect: Effect.Effect<A, E>): Promise<A> => {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;

  const failure = Cause.failureOption(exit.cause);
  if (failure._tag === "Some") throw failure.value;
  throw Cause.squash(exit.cause);
};

const run = (service: LanguageModelService) => ({
  generateText: (options: GenerationOptions): Promise<TextGenerationResult> =>
    runEffect(service.generateText(options)),
  streamText: async (options: GenerationOptions): Promise<AsyncIterable<string>> => {
    const stream = await runEffect(service.streamText(options));
    return Stream.toAsyncIterable(stream);
  },
  generateObject: <A, I>(options: ObjectGenerationOptions<A, I>): Promise<A> =>
    runEffect(service.generateObject(options)),
});

export const createClient = (
  config: OpenRouterConfig,
  overrides: PlainClientOverrides = {},
): PlainLanguageModelClient => {
  const client = makeOpenRouterClient(config);
  const service = makeLanguageModel({
    registry: client.models,
    resolveModel: overrides.resolveModel ?? ((model) => client.model(model)),
    ...(config.onUsage === undefined ? {} : { onUsage: config.onUsage }),
  });
  return {
    models: client.models,
    ...run(service),
  };
};
