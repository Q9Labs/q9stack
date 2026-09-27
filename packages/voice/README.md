# @q9labsai/voice

`@q9labsai/voice` gives browser applications one small `VoiceCallClient` port and provider adapters for Ultravox and OpenAI Realtime WebRTC. The core entry has no provider or Node-only imports, so applications can keep provider choice at their boundary.

## Install

```sh
pnpm add @q9labsai/voice
```

The package expects `effect` at runtime, `ultravox-client` for the Ultravox adapter, and React as a peer dependency only when the React entry is used.

## Core API

Import the port and shared event types from the package root:

```ts
import type { VoiceCallClient, VoiceEvent } from "@q9labsai/voice";
```

`VoiceCallClient` exposes `start`, `stop`, `mute`, `sendText`, and typed `on` subscriptions. `start` receives a discriminated option with `provider: "ultravox"` and a `joinUrl`, or `provider: "openai-realtime"` and an `ephemeralToken`. Events are discriminated by `type`: `status`, `transcript`, `toolCall`, `error`, and `ended`. Provider failures are Effect tagged errors (`VoiceConfigurationError`, `VoiceInvalidResponseError`, `VoiceProviderError`, and `VoiceTransportError`).

Tool definitions use Effect Schema. The server helpers convert those schemas to JSON Schema before sending provider requests:

```ts
import { Schema } from "effect";
import { toVoiceToolDefinition } from "@q9labsai/voice";

const lookupTool = toVoiceToolDefinition({
  name: "lookup_order",
  description: "Find an order by its number",
  parameters: Schema.Struct({ orderNumber: Schema.String }),
});
```

## Ultravox

Use `@q9labsai/voice/ultravox` in a browser for the WebRTC session and on a Worker or Node server for call creation:

```ts
import { UltravoxCallClient, createUltravoxCall } from "@q9labsai/voice/ultravox";

const call = await createUltravoxCall({
  apiKey,
  systemPrompt: "You are a helpful assistant.",
  voice: "default",
});

const client = new UltravoxCallClient();
await client.start({ provider: "ultravox", joinUrl: call.joinUrl });
```

`createUltravoxCall` uses `fetch`, sends `X-API-Key`, validates both `callId` and `joinUrl`, and accepts an injected `fetch` for Workers tests. Its `tools` input is provider-neutral Effect Schema metadata, but Ultravox's call API only accepts preconfigured tool names, so the helper sends `selectedTools: [{ toolName }]` and does not send JSON schemas to Ultravox. The browser adapter wraps `UltravoxSession` 0.6 status, transcript, error, mute, text, join, and leave APIs. Ultravox 0.6 does not emit a disconnect event, so the adapter derives `ended` from the final disconnected status and explicit `stop` cleanup.

## OpenAI Realtime

Use `@q9labsai/voice/openai-realtime` to create a short-lived client secret on the server and connect in the browser:

```ts
import { OpenAIRealtimeCallClient, createRealtimeSession } from "@q9labsai/voice/openai-realtime";

const session = await createRealtimeSession({
  apiKey,
  model: "gpt-realtime-2.1",
  voice: "alloy",
  instructions: "You are a helpful assistant.",
});

const client = new OpenAIRealtimeCallClient();
await client.start({
  provider: "openai-realtime",
  ephemeralToken: session.value,
});
```

The helper posts the current `{ session: { type: "realtime", model, instructions, audio, tools } }` shape to `/v1/realtime/client_secrets`. Its result exposes the ephemeral `value`, `expiresAt`, and validated `session.id`, `session.type`, and `session.model` fields. The browser adapter creates `RTCPeerConnection`, sends the SDP offer to `/v1/realtime/calls` with the ephemeral token, sets the answer, plays the remote stream, and uses the `oai-events` data channel for transcripts and function-call events, including the current `response.output_audio.delta` and `response.output_audio.done` lifecycle events.

Production applications that need a voice relay should authenticate callers, reserve sessions server-side, and keep provider credentials and session cleanup out of browser code. Relay protocols vary by provider and product, so this package exposes browser clients without imposing a server-side session model. The OpenAI WebRTC path here keeps the API key server-side by using an ephemeral client secret.

## React

`@q9labsai/voice/react` exports `useVoiceCall(client)`, which subscribes and unsubscribes to the port, accumulates transcripts, exposes the latest status and error, and returns async `start`, `stop`, `mute`, and `sendText` controls:

```tsx
import { useVoiceCall } from "@q9labsai/voice/react";

const voice = useVoiceCall(client);
```

## Build

```sh
pnpm --filter @q9labsai/voice build
pnpm --filter @q9labsai/voice typecheck
pnpm --filter @q9labsai/voice test
```

The tests cover the core port, an injected Ultravox session seam, the OpenAI WebRTC SDP seam, and both server helper request and response paths. The React hook has no runtime test in this package because `@testing-library/react` is not a catalog dependency yet; its cleanup and callback wiring remain covered by strict types and the small implementation.
