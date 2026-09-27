import { Data } from "effect";

export type LanguageModelErrorContext = {
  readonly message: string;
  readonly model: string;
  readonly operation: "generateText" | "streamText" | "generateObject";
  readonly cause?: unknown;
};

export class RateLimited extends Data.TaggedError("RateLimited")<
  LanguageModelErrorContext & {
    readonly retryAfterMs?: number;
    readonly statusCode?: number;
  }
> {}

export class ProviderUnavailable extends Data.TaggedError("ProviderUnavailable")<
  LanguageModelErrorContext & {
    readonly statusCode?: number;
  }
> {}

export class InvalidResponse extends Data.TaggedError("InvalidResponse")<
  LanguageModelErrorContext & {
    readonly statusCode?: number;
  }
> {}

export class ContextTooLong extends Data.TaggedError("ContextTooLong")<
  LanguageModelErrorContext & {
    readonly statusCode?: number;
  }
> {}

export class ContentFiltered extends Data.TaggedError("ContentFiltered")<
  LanguageModelErrorContext & {
    readonly statusCode?: number;
  }
> {}

export type LanguageModelError =
  | RateLimited
  | ProviderUnavailable
  | InvalidResponse
  | ContextTooLong
  | ContentFiltered;

export const isRetryableError = (
  error: LanguageModelError,
): error is RateLimited | ProviderUnavailable =>
  error._tag === "RateLimited" || error._tag === "ProviderUnavailable";
