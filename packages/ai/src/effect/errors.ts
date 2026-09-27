import {
  APICallError,
  InvalidPromptError,
  InvalidResponseDataError,
  JSONParseError,
  NoContentGeneratedError,
  NoObjectGeneratedError,
  TypeValidationError,
} from "ai";

import {
  ContentFiltered,
  ContextTooLong,
  InvalidResponse,
  ProviderUnavailable,
  RateLimited,
  type LanguageModelError,
} from "../core/index.js";

export interface ErrorMappingContext {
  readonly model: string;
  readonly operation: "generateText" | "streamText" | "generateObject";
}

const errorMessage = (cause: unknown): string => {
  if (cause instanceof Error) return cause.message;
  return String(cause);
};

const normalizedMessage = (cause: unknown): string => errorMessage(cause).toLowerCase();

const isContextError = (cause: unknown): boolean => {
  const message = normalizedMessage(cause);
  return (
    message.includes("context length") ||
    message.includes("context window") ||
    message.includes("maximum context") ||
    message.includes("too many tokens") ||
    message.includes("token limit") ||
    message.includes("context too long")
  );
};

const isContentFilterError = (cause: unknown): boolean => {
  const message = normalizedMessage(cause);
  return (
    message.includes("content filter") ||
    message.includes("content policy") ||
    message.includes("safety filter") ||
    message.includes("moderation") ||
    message.includes("prompt was blocked") ||
    message.includes("blocked by provider")
  );
};

const retryAfterMs = (error: APICallError): number | undefined => {
  const header = error.responseHeaders?.["retry-after"] ?? error.responseHeaders?.["Retry-After"];
  if (header === undefined) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
};

const contextFields = (context: ErrorMappingContext, cause: unknown) => ({
  ...context,
  message: errorMessage(cause),
  cause,
});

const isMappedLanguageModelError = (cause: unknown): cause is LanguageModelError =>
  cause instanceof RateLimited ||
  cause instanceof ProviderUnavailable ||
  cause instanceof InvalidResponse ||
  cause instanceof ContextTooLong ||
  cause instanceof ContentFiltered;

const apiContextFields = (context: ErrorMappingContext, error: APICallError) => ({
  ...contextFields(context, error),
  ...(error.statusCode === undefined ? {} : { statusCode: error.statusCode }),
});

const mapApiCallError = (error: APICallError, context: ErrorMappingContext): LanguageModelError => {
  const statusCode = error.statusCode;
  const fields = apiContextFields(context, error);
  if (statusCode === 429) {
    const retryAfter = retryAfterMs(error);
    return new RateLimited({
      ...fields,
      ...(retryAfter === undefined ? {} : { retryAfterMs: retryAfter }),
    });
  }
  if (isContextError(error) || statusCode === 413) {
    return new ContextTooLong(fields);
  }
  if (isContentFilterError(error)) {
    return new ContentFiltered(fields);
  }
  if (error.isRetryable || (statusCode !== undefined && statusCode >= 500)) {
    return new ProviderUnavailable(fields);
  }
  return new InvalidResponse(fields);
};

const isInvalidResponseCause = (cause: unknown): boolean =>
  InvalidResponseDataError.isInstance(cause) ||
  JSONParseError.isInstance(cause) ||
  TypeValidationError.isInstance(cause) ||
  InvalidPromptError.isInstance(cause) ||
  NoContentGeneratedError.isInstance(cause) ||
  NoObjectGeneratedError.isInstance(cause);

export const mapAiSdkError = (cause: unknown, context: ErrorMappingContext): LanguageModelError => {
  if (isMappedLanguageModelError(cause)) {
    return cause;
  }

  if (APICallError.isInstance(cause)) {
    return mapApiCallError(cause, context);
  }

  if (isContextError(cause)) {
    return new ContextTooLong(contextFields(context, cause));
  }

  if (isContentFilterError(cause)) {
    return new ContentFiltered(contextFields(context, cause));
  }

  if (isInvalidResponseCause(cause)) {
    return new InvalidResponse(contextFields(context, cause));
  }

  return new ProviderUnavailable(contextFields(context, cause));
};
