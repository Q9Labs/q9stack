import type { Schema } from "effect";

import type { VoiceError } from "./errors";

export type CallStatus =
  | "disconnected"
  | "disconnecting"
  | "connecting"
  | "idle"
  | "listening"
  | "thinking"
  | "speaking";

export type VoiceTranscriptRole = "user" | "agent";

export type VoiceStatusEvent = {
  readonly type: "status";
  readonly status: CallStatus;
};

export type VoiceTranscriptEvent = {
  readonly type: "transcript";
  readonly role: VoiceTranscriptRole;
  readonly text: string;
  readonly final: boolean;
};

export type VoiceToolCallEvent = {
  readonly type: "toolCall";
  readonly callId: string;
  readonly name: string;
  readonly arguments: string;
};

export type VoiceErrorEvent = {
  readonly type: "error";
  readonly error: VoiceError;
};

export type VoiceEndedEvent = {
  readonly type: "ended";
  readonly reason?: string;
};

export type VoiceEvent =
  | VoiceStatusEvent
  | VoiceTranscriptEvent
  | VoiceToolCallEvent
  | VoiceErrorEvent
  | VoiceEndedEvent;

export type UltravoxStartOptions = {
  readonly provider: "ultravox";
  readonly joinUrl: string;
};

export type OpenAIRealtimeStartOptions = {
  readonly provider: "openai-realtime";
  readonly ephemeralToken: string;
};

export type VoiceCallStartOptions = UltravoxStartOptions | OpenAIRealtimeStartOptions;

export interface VoiceCallClient {
  start(options: VoiceCallStartOptions): Promise<void>;
  stop(): void | Promise<void>;
  mute(muted: boolean): void | Promise<void>;
  sendText(text: string): void | Promise<void>;
  on(event: "status", handler: (event: VoiceStatusEvent) => void): () => void;
  on(event: "transcript", handler: (event: VoiceTranscriptEvent) => void): () => void;
  on(event: "toolCall", handler: (event: VoiceToolCallEvent) => void): () => void;
  on(event: "error", handler: (event: VoiceErrorEvent) => void): () => void;
  on(event: "ended", handler: (event: VoiceEndedEvent) => void): () => void;
  on(event: VoiceEvent["type"], handler: (event: VoiceEvent) => void): () => void;
}

export type VoiceToolDefinition<Parameters extends Schema.Schema.Any = Schema.Schema.Any> = {
  readonly name: string;
  readonly description?: string;
  readonly parameters: Parameters;
};
