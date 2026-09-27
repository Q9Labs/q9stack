import {
  VoiceInvalidResponseError,
  VoiceProviderError,
  VoiceTransportError,
  type VoiceToolDefinition,
} from "../core";

const defaultBaseUrl = "https://api.ultravox.ai/api";

export type UltravoxCallResult = {
  readonly callId: string;
  readonly joinUrl: string;
};

export type UltravoxCallOptions = {
  readonly apiKey: string;
  readonly systemPrompt: string;
  readonly voice: string;
  readonly tools?: readonly VoiceToolDefinition[];
  readonly languageHint?: string;
  readonly joinTimeout?: string;
  readonly maxDuration?: string;
  readonly timeExceededMessage?: string;
  readonly recordingEnabled?: boolean;
  readonly metadata?: unknown;
  readonly webhookUrl?: string;
  readonly baseUrl?: string;
  readonly fetch?: typeof globalThis.fetch;
};

type UltravoxRequestBody = {
  systemPrompt: string;
  voice: string;
  selectedTools?: readonly { toolName: string }[];
  languageHint?: string;
  joinTimeout?: string;
  maxDuration?: string;
  timeExceededMessage?: string;
  recordingEnabled?: boolean;
  metadata?: unknown;
  callbacks?: { ended: { url: string } };
};

function isUltravoxCallResult(value: unknown): value is UltravoxCallResult {
  if (
    typeof value !== "object" ||
    value === null ||
    !("callId" in value) ||
    !("joinUrl" in value)
  ) {
    return false;
  }
  return (
    typeof value.callId === "string" &&
    value.callId.trim() !== "" &&
    typeof value.joinUrl === "string" &&
    value.joinUrl.trim() !== ""
  );
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (cause) {
    throw new VoiceInvalidResponseError({
      message: "Ultravox returned invalid JSON",
      cause,
    });
  }
}

function makeBody(options: UltravoxCallOptions): UltravoxRequestBody {
  const body: UltravoxRequestBody = {
    systemPrompt: options.systemPrompt,
    voice: options.voice,
  };
  if (options.tools !== undefined) {
    body.selectedTools = options.tools.map((tool) => ({ toolName: tool.name }));
  }
  if (options.languageHint !== undefined) body.languageHint = options.languageHint;
  if (options.joinTimeout !== undefined) body.joinTimeout = options.joinTimeout;
  if (options.maxDuration !== undefined) body.maxDuration = options.maxDuration;
  if (options.timeExceededMessage !== undefined) {
    body.timeExceededMessage = options.timeExceededMessage;
  }
  if (options.recordingEnabled !== undefined) {
    body.recordingEnabled = options.recordingEnabled;
  }
  if (options.metadata !== undefined) body.metadata = options.metadata;
  if (options.webhookUrl !== undefined) {
    body.callbacks = { ended: { url: options.webhookUrl } };
  }
  return body;
}

export async function createUltravoxCall(
  options: UltravoxCallOptions,
): Promise<UltravoxCallResult> {
  if (options.apiKey.trim() === "") {
    throw new VoiceProviderError({ message: "Ultravox apiKey is required" });
  }
  const request = options.fetch ?? globalThis.fetch;
  const baseUrl = (options.baseUrl ?? defaultBaseUrl).replace(/\/+$/, "");
  let response: Response;
  try {
    response = await request(`${baseUrl}/calls`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": options.apiKey,
      },
      body: JSON.stringify(makeBody(options)),
    });
  } catch (cause) {
    throw new VoiceTransportError({
      message: "Ultravox call creation request failed",
      cause,
    });
  }
  if (!response.ok) {
    throw new VoiceProviderError({
      message: `Ultravox call creation failed with HTTP ${response.status}`,
      status: response.status,
    });
  }
  const payload = await readJson(response);
  if (!isUltravoxCallResult(payload)) {
    throw new VoiceInvalidResponseError({
      message: "Ultravox response did not contain callId and joinUrl",
    });
  }
  return payload;
}
