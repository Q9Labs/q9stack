import { Effect } from "effect";

import type { LanguageModelError } from "../core/errors.js";
import type { ModelUsage, UsageEvent, UsageLogger } from "../core/usage.js";
import { mapAiSdkError, type ErrorMappingContext } from "./errors.js";

export const mapUsage = (usage: {
  readonly inputTokens: number | undefined;
  readonly outputTokens: number | undefined;
  readonly totalTokens: number | undefined;
  readonly reasoningTokens?: number | undefined;
  readonly cachedInputTokens?: number | undefined;
}): ModelUsage => {
  const details =
    usage.reasoningTokens === undefined && usage.cachedInputTokens === undefined
      ? undefined
      : {
          ...(usage.reasoningTokens === undefined
            ? {}
            : { reasoningTokens: usage.reasoningTokens }),
          ...(usage.cachedInputTokens === undefined
            ? {}
            : { cachedInputTokens: usage.cachedInputTokens }),
        };

  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    ...(details === undefined ? {} : { details }),
  };
};

export const usageEvent = (
  model: string,
  operation: UsageEvent["operation"],
  usage: ModelUsage,
): UsageEvent => ({ model, operation, usage });

export const reportUsage = (
  logger: UsageLogger | undefined,
  event: UsageEvent,
  context: ErrorMappingContext,
): Effect.Effect<void, LanguageModelError> => {
  if (logger === undefined) return Effect.void;
  return Effect.tryPromise({
    try: () => Promise.resolve(logger(event)),
    catch: (cause) => mapAiSdkError(cause, context),
  });
};
