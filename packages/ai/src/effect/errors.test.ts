import { APICallError } from "ai";
import { describe, expect, it } from "vitest";

import {
  ContentFiltered,
  ContextTooLong,
  InvalidResponse,
  ProviderUnavailable,
  RateLimited,
} from "../core/errors.js";
import { mapAiSdkError } from "./errors.js";

const context = {
  model: "openai/test",
  operation: "generateText" as const,
};

describe("AI SDK error mapping", () => {
  it("maps rate limits to a retryable tagged error", () => {
    const error = new APICallError({
      message: "Too many requests",
      url: "https://openrouter.ai/api/v1/chat/completions",
      requestBodyValues: {},
      statusCode: 429,
      responseHeaders: { "retry-after": "2" },
      isRetryable: true,
    });

    const mapped = mapAiSdkError(error, context);

    expect(mapped).toBeInstanceOf(RateLimited);
    expect(mapped._tag).toBe("RateLimited");
    if (mapped instanceof RateLimited) expect(mapped.retryAfterMs).toBe(2000);
  });

  it("maps provider outages and does not classify ordinary 400 errors as filters", () => {
    const unavailable = mapAiSdkError(
      new APICallError({
        message: "upstream unavailable",
        url: "https://openrouter.ai/api/v1/chat/completions",
        requestBodyValues: {},
        statusCode: 503,
        isRetryable: true,
      }),
      context,
    );
    const invalid = mapAiSdkError(
      new APICallError({
        message: "bad request",
        url: "https://openrouter.ai/api/v1/chat/completions",
        requestBodyValues: {},
        statusCode: 400,
      }),
      context,
    );

    expect(unavailable).toBeInstanceOf(ProviderUnavailable);
    expect(invalid).toBeInstanceOf(InvalidResponse);
    expect(invalid).not.toBeInstanceOf(ContentFiltered);
  });

  it("maps context and content policy failures", () => {
    const contextError = mapAiSdkError(new Error("context length exceeded"), context);
    const filtered = mapAiSdkError(new Error("content filter blocked the prompt"), context);

    expect(contextError).toBeInstanceOf(ContextTooLong);
    expect(filtered).toBeInstanceOf(ContentFiltered);
  });
});
