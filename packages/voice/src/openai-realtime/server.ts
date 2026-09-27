import { JSONSchema } from "effect";

import {
  VoiceInvalidResponseError,
  VoiceProviderError,
  VoiceTransportError,
  type VoiceToolDefinition,
} from "../core";

const defaultEndpoint = "https://api.openai.com/v1/realtime/client_secrets";

export type RealtimeSessionResult = {
  readonly value: string;
  readonly expiresAt: number;
  readonly session: RealtimeSessionDetails;
};

export type RealtimeSessionDetails = {
  readonly id: string;
  readonly type: "realtime";
  readonly model: string;
};

type RealtimeSessionPayload = {
  readonly value: string;
  readonly expires_at: number;
  readonly session: RealtimeSessionDetails;
};

export type CreateRealtimeSessionOptions = {
  readonly apiKey: string;
  readonly model: string;
  readonly voice: string;
  readonly instructions: string;
  readonly tools?: readonly VoiceToolDefinition[];
  readonly endpoint?: string;
  readonly fetch?: typeof globalThis.fetch;
};

type RealtimeToolBody = {
  readonly type: "function";
  readonly name: string;
  readonly description?: string;
  readonly parameters: ReturnType<typeof JSONSchema.make>;
};

type RealtimeRequestBody = {
  readonly session: {
    readonly type: "realtime";
    readonly model: string;
    readonly instructions: string;
    readonly audio: {
      readonly output: {
        readonly voice: string;
      };
    };
    readonly tools?: readonly RealtimeToolBody[];
  };
};

function makeRequestBody(options: CreateRealtimeSessionOptions): RealtimeRequestBody {
  const session: RealtimeRequestBody["session"] = {
    type: "realtime",
    model: options.model,
    instructions: options.instructions,
    audio: { output: { voice: options.voice } },
  };
  if (options.tools !== undefined) {
    const tools = options.tools.map((tool) => {
      const parameters = JSONSchema.make(tool.parameters);
      if (tool.description === undefined) {
        return { type: "function", name: tool.name, parameters } as const;
      }
      return {
        type: "function",
        name: tool.name,
        description: tool.description,
        parameters,
      } as const;
    });
    return { session: { ...session, tools } };
  }
  return { session };
}

function isRealtimeSessionPayload(value: unknown): value is RealtimeSessionPayload {
  if (
    typeof value !== "object" ||
    value === null ||
    !("value" in value) ||
    !("expires_at" in value) ||
    !("session" in value)
  ) {
    return false;
  }
  if (
    typeof value.value !== "string" ||
    value.value.trim() === "" ||
    typeof value.expires_at !== "number" ||
    !Number.isFinite(value.expires_at) ||
    typeof value.session !== "object" ||
    value.session === null ||
    !("id" in value.session) ||
    !("type" in value.session) ||
    !("model" in value.session)
  ) {
    return false;
  }
  return (
    typeof value.session.id === "string" &&
    value.session.id.trim() !== "" &&
    value.session.type === "realtime" &&
    typeof value.session.model === "string" &&
    value.session.model.trim() !== ""
  );
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (cause) {
    throw new VoiceInvalidResponseError({
      message: "OpenAI returned invalid JSON for the realtime session",
      cause,
    });
  }
}

export async function createRealtimeSession(
  options: CreateRealtimeSessionOptions,
): Promise<RealtimeSessionResult> {
  if (options.apiKey.trim() === "") {
    throw new VoiceProviderError({ message: "OpenAI apiKey is required" });
  }
  const request = options.fetch ?? globalThis.fetch;
  let response: Response;
  try {
    response = await request(options.endpoint ?? defaultEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(makeRequestBody(options)),
    });
  } catch (cause) {
    throw new VoiceTransportError({
      message: "OpenAI realtime session request failed",
      cause,
    });
  }
  if (!response.ok) {
    throw new VoiceProviderError({
      message: `OpenAI realtime session creation failed with HTTP ${response.status}`,
      status: response.status,
    });
  }
  const payload = await readJson(response);
  if (!isRealtimeSessionPayload(payload)) {
    throw new VoiceInvalidResponseError({
      message: "OpenAI response did not contain a realtime client secret",
    });
  }
  return {
    value: payload.value,
    expiresAt: payload.expires_at,
    session: {
      id: payload.session.id,
      type: payload.session.type,
      model: payload.session.model,
    },
  };
}
