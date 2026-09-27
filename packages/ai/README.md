# @q9labsai/ai

Effect and Promise APIs for text generation through OpenRouter and the Vercel AI SDK 6.
The package keeps model selection, provider errors, retry policy, structured-output validation,
and usage events in one small service boundary.

## Consume

Install `@q9labsai/ai`, `ai`, `effect`, and `@openrouter/ai-sdk-provider`. The root export is the
Effect API. Convex actions and other Promise-based code should import `@q9labsai/ai/plain`.

```ts
import { Effect } from "effect";
import { LanguageModel, OpenRouterLive } from "@q9labsai/ai";

const program = Effect.gen(function* () {
  const languageModel = yield* LanguageModel;
  return yield* languageModel.generateText({
    role: "fast",
    prompt: "Give one short greeting.",
  });
}).pipe(
  Effect.provide(
    OpenRouterLive({
      apiKey: "${OPENROUTER_API_KEY}",
      appName: "My q9labs app",
      referer: "https://example.com",
      zdr: true,
    }),
  ),
);
```

`ModelRegistry` resolves `fast`, `default`, `reasoning`, `embedding`, and `vision`. Its defaults
are `openai/gpt-5.6-luna` for `fast`, `openai/gpt-5.6-sol` for `default` and `reasoning`,
`openai/text-embedding-3-small` for `embedding`, and `openai/gpt-4o-mini` for `vision`.
Direct `models` overrides apply first. A nested `q9.models` override applies last, either as an
object or as a function receiving the direct-override table.

```ts
import { createClient } from "@q9labsai/ai/plain";

const client = createClient({
  apiKey: "${OPENROUTER_API_KEY}",
  models: { fast: "openai/gpt-5.6-luna" },
  q9: { models: { fast: "anthropic/claude-sonnet-4.5" } },
});

const result = await client.generateText({
  role: "fast",
  prompt: "Say hello.",
});
```

The Promise entry is `createClient`:

```ts
import { createClient } from "@q9labsai/ai/plain";

const client = createClient({ apiKey: "${OPENROUTER_API_KEY}" });
const result = await client.generateText({ prompt: "Say hello." });
for await (const chunk of await client.streamText({ prompt: "Count to three." })) {
  process.stdout.write(chunk);
}
```

The Promise API throws the same tagged `Data.TaggedError` instances as the Effect API. `onUsage`
receives token usage after successful text and object calls, or after a stream finishes. The
provider's cost is not invented when OpenRouter does not return it, so `costUsd` is optional.

Generation options require exactly one prompt source: either a string `prompt` or a `messages`
array. Model role, explicit model, and provider settings remain optional alongside that source.

## Structured output and tools

Pass an Effect Schema to `generateObject`. The schema is converted with `JSONSchema.make`, sent
through the AI SDK's `jsonSchema`, and decoded again at the boundary. A provider response that
does not validate becomes `InvalidResponse`.

`defineTool(schema, handler)` keeps the schema input and handler output typed. Its `run(input)`
method executes the handler directly, while `toAiSdkTool()` is the erased adapter used at the AI
SDK boundary. Collect named definitions in a `ReadonlyMap` with `toAiSdkTools` and pass the
returned `ToolSet` to the AI SDK directly.

```ts
import { Effect, Schema } from "effect";
import { defineTool, toAiSdkTools } from "@q9labsai/ai/tools";

const add = defineTool(
  Schema.Struct({ left: Schema.Number, right: Schema.Number }),
  ({ left, right }) => Effect.succeed(left + right),
);
const tools = toAiSdkTools(new Map([["add", add]]));
```

The package does not include React hooks. Browser applications should wire `@ai-sdk/react`
directly to their server route.

## Errors and retries

Provider failures are mapped to `RateLimited`, `ProviderUnavailable`, `InvalidResponse`,
`ContextTooLong`, or `ContentFiltered`. Text and object operations use an Effect exponential
schedule with jitter and three retries, limited to rate limits and provider availability. Stream
chunks carry the same mapped errors, but a stream is not restarted after it has emitted data.
