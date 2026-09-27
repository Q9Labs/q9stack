import { describe, expect, expectTypeOf, it } from "vitest";

import {
  VoiceEventHub,
  type VoiceCallClient,
  type VoiceCallStartOptions,
  type VoiceEvent,
  type VoiceTranscriptEvent,
} from "./core";
import { UltravoxCallClient, type UltravoxSessionPort } from "./ultravox/client";

type FakeUltravoxTranscript = {
  readonly ordinal: number;
  readonly text: string;
  readonly isFinal: boolean;
  readonly speaker: "user" | "agent";
};

class FakeUltravoxSession implements UltravoxSessionPort {
  status = "disconnected";
  private readonly transcriptItems: FakeUltravoxTranscript[] = [];
  readonly transcripts: readonly FakeUltravoxTranscript[] = this.transcriptItems;
  readonly listeners = new Map<
    "status" | "transcripts" | "error" | "data_message",
    Set<(event: Event) => void>
  >();
  joinUrl = "";
  micMuted = false;
  sentText = "";

  addEventListener(
    type: "status" | "transcripts" | "error" | "data_message",
    listener: (event: Event) => void,
  ): void {
    const listeners = this.listeners.get(type) ?? new Set<(event: Event) => void>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(
    type: "status" | "transcripts" | "error" | "data_message",
    listener: (event: Event) => void,
  ): void {
    this.listeners.get(type)?.delete(listener);
  }

  joinCall(joinUrl: string): void {
    this.joinUrl = joinUrl;
    this.status = "connecting";
    this.emit("status");
    this.status = "idle";
    this.emit("status");
  }

  async leaveCall(): Promise<void> {
    this.status = "disconnected";
    this.emit("status");
  }

  sendText(text: string): void {
    this.sentText = text;
  }

  muteMic(): void {
    this.micMuted = true;
  }

  unmuteMic(): void {
    this.micMuted = false;
  }

  updateTranscript(text: string, isFinal: boolean): void {
    const ordinal = this.transcriptItems[0]?.ordinal ?? 1;
    this.transcriptItems.splice(0, 1, {
      ordinal,
      text,
      isFinal,
      speaker: "agent",
    });
    this.emit("transcripts");
  }

  private emit(type: "status" | "transcripts" | "error" | "data_message"): void {
    const event = new Event(type);
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }
}

class FakeVoiceClient implements VoiceCallClient {
  private readonly events = new VoiceEventHub();
  readonly on = this.events.on;
  started = false;
  muted = false;
  sentText = "";

  async start(_options: VoiceCallStartOptions): Promise<void> {
    this.started = true;
    this.events.emit({ type: "status", status: "connecting" });
  }

  stop(): void {
    this.events.emit({ type: "ended", reason: "stopped" });
  }

  mute(muted: boolean): void {
    this.muted = muted;
  }

  sendText(text: string): void {
    this.sentText = text;
  }

  emitTranscript(text: string): void {
    this.events.emit({ type: "transcript", role: "user", text, final: true });
  }
}

function neverVoiceEvent(event: never): never {
  throw new Error("Unhandled voice event: " + JSON.stringify(event));
}

function eventLabel(event: VoiceEvent): string {
  switch (event.type) {
    case "status":
      return event.status;
    case "transcript":
      return event.role;
    case "toolCall":
      return event.name;
    case "error":
      return event.error._tag;
    case "ended":
      return event.reason ?? "ended";
    default:
      return neverVoiceEvent(event);
  }
}

describe("voice port", () => {
  it("keeps event variants discriminated", () => {
    expectTypeOf<
      Extract<VoiceEvent, { type: "transcript" }>
    >().toEqualTypeOf<VoiceTranscriptEvent>();
    expectTypeOf<Extract<VoiceEvent, { type: "status" }>>().toHaveProperty("status");
    expect(eventLabel({ type: "ended", reason: "stopped" })).toBe("stopped");
  });

  it("supports typed subscriptions and cleanup", async () => {
    const client = new FakeVoiceClient();
    const statuses: string[] = [];
    const transcripts: string[] = [];
    const removeStatus = client.on("status", (event) => {
      statuses.push(event.status);
    });
    client.on("transcript", (event) => {
      transcripts.push(event.text);
    });
    await client.start({ provider: "ultravox", joinUrl: "test://join" });
    client.emitTranscript("hello");
    expect(client.started).toBe(true);
    expect(statuses).toEqual(["connecting"]);
    expect(transcripts).toEqual(["hello"]);
    removeStatus();
    client.stop();
    expect(statuses).toEqual(["connecting"]);
  });

  it("adapts an Ultravox session seam", async () => {
    const session = new FakeUltravoxSession();
    const client = new UltravoxCallClient({ createSession: () => session });
    const statuses: string[] = [];
    const transcripts: string[] = [];
    const ended: string[] = [];
    client.on("status", (event) => statuses.push(event.status));
    client.on("transcript", (event) => transcripts.push(event.text));
    client.on("ended", (event) => ended.push(event.reason ?? ""));

    await client.start({
      provider: "ultravox",
      joinUrl: "https://example.test/join",
    });
    session.updateTranscript("wel", false);
    session.updateTranscript("welcome", true);
    client.mute(true);
    client.sendText("hello");
    await client.stop();

    expect(session.joinUrl).toBe("https://example.test/join");
    expect(session.micMuted).toBe(true);
    expect(session.sentText).toBe("hello");
    expect(statuses).toContain("idle");
    expect(transcripts).toEqual(["wel", "welcome"]);
    expect(ended).toContain("disconnected");
  });
});
