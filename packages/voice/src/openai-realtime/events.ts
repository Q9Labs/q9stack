import { Either, Schema } from "effect";

import type { CallStatus } from "../core";

export type ParsedRealtimeEvent =
  | { readonly kind: "status"; readonly status: CallStatus }
  | {
      readonly kind: "transcript";
      readonly role: "user" | "agent";
      readonly text: string;
      readonly final: boolean;
    }
  | {
      readonly kind: "toolCall";
      readonly callId: string;
      readonly name: string;
      readonly arguments: string;
    }
  | { readonly kind: "error"; readonly message: string };

const realtimeStatusEventSchema = Schema.Struct({
  type: Schema.Literal(
    "session.created",
    "session.updated",
    "input_audio_buffer.speech_started",
    "input_audio_buffer.speech_stopped",
    "response.created",
    "response.audio.delta",
    "response.output_audio.delta",
    "response.audio.done",
    "response.output_audio.done",
    "response.done",
  ),
});

const realtimeUserTranscriptEventSchema = Schema.Struct({
  type: Schema.Literal("conversation.item.input_audio_transcription.completed"),
  transcript: Schema.String,
});

const realtimeAgentTranscriptEventSchema = Schema.Struct({
  type: Schema.Literal("response.audio_transcript.done", "response.output_audio_transcript.done"),
  transcript: Schema.String,
});

const realtimeToolCallEventSchema = Schema.Struct({
  type: Schema.Literal("response.function_call_arguments.done"),
  call_id: Schema.String,
  name: Schema.String,
  arguments: Schema.String,
});

const realtimeErrorEventSchema = Schema.Struct({
  type: Schema.Literal("error"),
  error: Schema.optional(Schema.Unknown),
});

const realtimeEventSchema = Schema.Union(
  realtimeStatusEventSchema,
  realtimeUserTranscriptEventSchema,
  realtimeAgentTranscriptEventSchema,
  realtimeToolCallEventSchema,
  realtimeErrorEventSchema,
);

const realtimeErrorDetailsSchema = Schema.Struct({ message: Schema.String });

type RealtimeEvent = Schema.Schema.Type<typeof realtimeEventSchema>;
type RealtimeStatusEvent = Schema.Schema.Type<typeof realtimeStatusEventSchema>;

const statusByEventType = {
  "session.created": "idle",
  "session.updated": "idle",
  "input_audio_buffer.speech_started": "listening",
  "input_audio_buffer.speech_stopped": "thinking",
  "response.created": "thinking",
  "response.audio.delta": "speaking",
  "response.output_audio.delta": "speaking",
  "response.audio.done": "idle",
  "response.output_audio.done": "idle",
  "response.done": "idle",
} satisfies { readonly [Type in RealtimeStatusEvent["type"]]: CallStatus };

const decode = Schema.decodeUnknownEither(realtimeEventSchema);

function realtimeErrorMessage(error: unknown): string {
  const details = Schema.decodeUnknownEither(realtimeErrorDetailsSchema)(error);
  return Either.isRight(details) ? details.right.message : "OpenAI reported a realtime error";
}

function mapRealtimeEvent(event: RealtimeEvent): ParsedRealtimeEvent {
  if (event.type === "conversation.item.input_audio_transcription.completed") {
    return { kind: "transcript", role: "user", text: event.transcript, final: true };
  }
  if (
    event.type === "response.audio_transcript.done" ||
    event.type === "response.output_audio_transcript.done"
  ) {
    return { kind: "transcript", role: "agent", text: event.transcript, final: true };
  }
  if (event.type === "response.function_call_arguments.done") {
    return {
      kind: "toolCall",
      callId: event.call_id,
      name: event.name,
      arguments: event.arguments,
    };
  }
  if (event.type === "error") {
    return { kind: "error", message: realtimeErrorMessage(event.error) };
  }
  return { kind: "status", status: statusByEventType[event.type] };
}

export function parseRealtimeEvent(value: unknown): ParsedRealtimeEvent | null {
  if (typeof value !== "string") {
    return null;
  }

  try {
    const parsed = decode(JSON.parse(value));
    return Either.isRight(parsed) ? mapRealtimeEvent(parsed.right) : null;
  } catch {
    return { kind: "error", message: "OpenAI sent malformed realtime JSON" };
  }
}
