import { describe, expect, it } from "vitest";

import type { CallStatus } from "../core";
import { parseRealtimeEvent } from "./events";

const statusCases = [
  { type: "session.created", status: "idle" },
  { type: "session.updated", status: "idle" },
  { type: "input_audio_buffer.speech_started", status: "listening" },
  { type: "input_audio_buffer.speech_stopped", status: "thinking" },
  { type: "response.created", status: "thinking" },
  { type: "response.audio.delta", status: "speaking" },
  { type: "response.output_audio.delta", status: "speaking" },
  { type: "response.audio.done", status: "idle" },
  { type: "response.output_audio.done", status: "idle" },
  { type: "response.done", status: "idle" },
] satisfies ReadonlyArray<{ readonly type: string; readonly status: CallStatus }>;

describe("OpenAI realtime events", () => {
  it("maps every status event", () => {
    for (const testCase of statusCases) {
      expect(parseRealtimeEvent(JSON.stringify({ type: testCase.type }))).toEqual({
        kind: "status",
        status: testCase.status,
      });
    }
  });

  it("parses transcripts and tool calls", () => {
    expect(
      parseRealtimeEvent(
        JSON.stringify({
          type: "conversation.item.input_audio_transcription.completed",
          transcript: "hello",
        }),
      ),
    ).toEqual({ kind: "transcript", role: "user", text: "hello", final: true });
    expect(
      parseRealtimeEvent(
        JSON.stringify({
          type: "response.output_audio_transcript.done",
          transcript: "hi",
        }),
      ),
    ).toEqual({ kind: "transcript", role: "agent", text: "hi", final: true });
    expect(
      parseRealtimeEvent(
        JSON.stringify({
          type: "response.function_call_arguments.done",
          call_id: "call-1",
          name: "lookup",
          arguments: '{"id":"1"}',
        }),
      ),
    ).toEqual({
      kind: "toolCall",
      callId: "call-1",
      name: "lookup",
      arguments: '{"id":"1"}',
    });
  });

  it("keeps malformed and unknown event behavior", () => {
    expect(parseRealtimeEvent(1)).toBeNull();
    expect(parseRealtimeEvent("{")).toEqual({
      kind: "error",
      message: "OpenAI sent malformed realtime JSON",
    });
    expect(parseRealtimeEvent(JSON.stringify({ type: "unknown" }))).toBeNull();
    expect(
      parseRealtimeEvent(JSON.stringify({ type: "response.audio_transcript.done", transcript: 1 })),
    ).toBeNull();
  });

  it("uses a nested provider error message when present", () => {
    expect(
      parseRealtimeEvent(JSON.stringify({ type: "error", error: { message: "failed" } })),
    ).toEqual({ kind: "error", message: "failed" });
    expect(parseRealtimeEvent(JSON.stringify({ type: "error", error: null }))).toEqual({
      kind: "error",
      message: "OpenAI reported a realtime error",
    });
  });
});
