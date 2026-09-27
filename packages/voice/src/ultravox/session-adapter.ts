import { UltravoxSession } from "ultravox-client";

import type { CallStatus, VoiceTranscriptRole } from "../core";

export type UltravoxTranscript = {
  readonly ordinal: number;
  readonly text: string;
  readonly isFinal: boolean;
  readonly speaker: VoiceTranscriptRole;
};

export function mapUltravoxStatus(value: string): CallStatus | null {
  switch (value) {
    case "disconnected":
    case "disconnecting":
    case "connecting":
    case "idle":
    case "listening":
    case "thinking":
    case "speaking":
      return value;
    default:
      return null;
  }
}

export interface UltravoxSessionPort {
  readonly status: string;
  readonly transcripts: readonly UltravoxTranscript[];
  addEventListener(
    type: "status" | "transcripts" | "error" | "data_message",
    listener: (event: Event) => void,
  ): void;
  removeEventListener(
    type: "status" | "transcripts" | "error" | "data_message",
    listener: (event: Event) => void,
  ): void;
  joinCall(joinUrl: string, clientVersion?: string): void;
  leaveCall(): Promise<void>;
  sendText(text: string): void;
  muteMic(): void;
  unmuteMic(): void;
}

function mapSpeaker(value: string): VoiceTranscriptRole | null {
  if (value === "user" || value === "agent") {
    return value;
  }
  return null;
}

export function makeDefaultSession(): UltravoxSessionPort {
  const session = new UltravoxSession();
  return {
    get status() {
      return session.status;
    },
    get transcripts() {
      return session.transcripts.flatMap((transcript) => {
        const speaker = mapSpeaker(transcript.speaker);
        if (speaker === null) {
          return [];
        }
        return [
          {
            ordinal: transcript.ordinal,
            text: transcript.text,
            isFinal: transcript.isFinal,
            speaker,
          },
        ];
      });
    },
    addEventListener(type, listener) {
      session.addEventListener(type, listener);
    },
    removeEventListener(type, listener) {
      session.removeEventListener(type, listener);
    },
    joinCall(joinUrl, clientVersion) {
      if (clientVersion === undefined) {
        session.joinCall(joinUrl);
        return;
      }
      session.joinCall(joinUrl, clientVersion);
    },
    leaveCall() {
      return session.leaveCall();
    },
    sendText(text) {
      session.sendText(text);
    },
    muteMic() {
      session.muteMic();
    },
    unmuteMic() {
      session.unmuteMic();
    },
  };
}

export function readErrorMessage(event: Event): string {
  if ("error" in event && event.error instanceof Error) {
    return event.error.message;
  }
  if ("message" in event && typeof event.message === "string") {
    return event.message;
  }
  return "Ultravox reported an error";
}

export function readToolCall(event: Event): {
  readonly callId: string;
  readonly name: string;
  readonly arguments: string;
} | null {
  if (
    !("message" in event) ||
    typeof event.message !== "object" ||
    event.message === null ||
    !("type" in event.message) ||
    event.message.type !== "client_tool_invocation" ||
    !("name" in event.message) ||
    typeof event.message.name !== "string"
  ) {
    return null;
  }
  const callId =
    "invocation_id" in event.message && typeof event.message.invocation_id === "string"
      ? event.message.invocation_id
      : "";
  const parameters = "parameters" in event.message ? event.message.parameters : {};
  const encoded: unknown = JSON.stringify(parameters);
  return {
    callId,
    name: event.message.name,
    arguments: typeof encoded === "string" ? encoded : "{}",
  };
}
