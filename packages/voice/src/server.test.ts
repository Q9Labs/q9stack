// cspell:ignore sess
import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { createRealtimeSession } from "./openai-realtime/server";
import { createUltravoxCall } from "./ultravox/server";

function requestBody(init: RequestInit | undefined): unknown {
  if (init === undefined || typeof init.body !== "string") {
    throw new Error("test fetch did not receive a JSON body");
  }
  return JSON.parse(init.body);
}

const invalidUltravoxResponseFetch: typeof globalThis.fetch = async () =>
  new Response(JSON.stringify({ callId: "missing-join" }), { status: 200 });

const invalidRealtimeResponseFetch: typeof globalThis.fetch = async () =>
  new Response(
    JSON.stringify({
      value: "missing-session-id",
      expires_at: 1_800_000_000,
      session: { type: "realtime", model: "gpt-realtime" },
    }),
    { status: 200 },
  );

describe("voice server helpers", () => {
  it("maps provider-neutral Ultravox tools to selected tool names", async () => {
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    const fetch: typeof globalThis.fetch = async (input, init) => {
      requestUrl = new Request(input).url;
      requestInit = init;
      return new Response(
        JSON.stringify({
          callId: "call-1",
          joinUrl: "https://ultravox.example/join/call-1",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const result = await createUltravoxCall({
      apiKey: "ultra-key",
      systemPrompt: "Be helpful",
      voice: "voice-1",
      tools: [
        {
          name: "lookup",
          parameters: Schema.Struct({ orderId: Schema.String }),
        },
      ],
      fetch,
    });
    expect(result).toEqual({
      callId: "call-1",
      joinUrl: "https://ultravox.example/join/call-1",
    });
    expect(requestUrl).toBe("https://api.ultravox.ai/api/calls");
    expect(requestInit?.headers).toEqual({
      "Content-Type": "application/json",
      "X-API-Key": "ultra-key",
    });
    const body = requestBody(requestInit);
    expect(body).toMatchObject({
      systemPrompt: "Be helpful",
      voice: "voice-1",
      selectedTools: [{ toolName: "lookup" }],
    });
    expect(body).not.toHaveProperty("tools");
  });

  it("rejects an invalid Ultravox response", async () => {
    await expect(
      createUltravoxCall({
        apiKey: "ultra-key",
        systemPrompt: "Be helpful",
        voice: "voice-1",
        fetch: invalidUltravoxResponseFetch,
      }),
    ).rejects.toMatchObject({ _tag: "VoiceInvalidResponseError" });
  });

  it("creates an OpenAI ephemeral realtime session", async () => {
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    const fetch: typeof globalThis.fetch = async (input, init) => {
      requestUrl = new Request(input).url;
      requestInit = init;
      return new Response(
        JSON.stringify({
          value: "ek_test",
          expires_at: 1_800_000_000,
          session: {
            id: "sess_test",
            type: "realtime",
            model: "gpt-realtime",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const result = await createRealtimeSession({
      apiKey: "openai-key",
      model: "gpt-realtime",
      voice: "alloy",
      instructions: "Be helpful",
      tools: [
        {
          name: "lookup",
          parameters: Schema.Struct({ orderId: Schema.String }),
        },
      ],
      fetch,
    });
    expect(result).toEqual({
      value: "ek_test",
      expiresAt: 1_800_000_000,
      session: {
        id: "sess_test",
        type: "realtime",
        model: "gpt-realtime",
      },
    });
    expect(requestUrl).toBe("https://api.openai.com/v1/realtime/client_secrets");
    expect(requestInit?.headers).toEqual({
      Authorization: "Bearer openai-key",
      "Content-Type": "application/json",
    });
    const body = requestBody(requestInit);
    expect(body).toMatchObject({
      session: {
        type: "realtime",
        model: "gpt-realtime",
        instructions: "Be helpful",
        audio: { output: { voice: "alloy" } },
        tools: [{ type: "function", name: "lookup" }],
      },
    });
  });

  it("rejects an invalid OpenAI ephemeral session response", async () => {
    await expect(
      createRealtimeSession({
        apiKey: "openai-key",
        model: "gpt-realtime",
        voice: "alloy",
        instructions: "Be helpful",
        fetch: invalidRealtimeResponseFetch,
      }),
    ).rejects.toMatchObject({ _tag: "VoiceInvalidResponseError" });
  });
});
