import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { OpenAIRealtimeCallClient } from "./openai-realtime/client";
import { parseRealtimeEvent } from "./openai-realtime/events";
import type {
  RealtimeAudioElementPort,
  RealtimeDataChannelPort,
  RealtimeMediaStreamPort,
  RealtimeMediaTrackPort,
  RealtimePeerConnectionPort,
  RealtimeWebApis,
} from "./openai-realtime/web-apis";

class FakeMediaTrack implements RealtimeMediaTrackPort {
  enabled = true;
  stopped = false;

  stop(): void {
    this.stopped = true;
  }
}

class FakeMediaStream implements RealtimeMediaStreamPort {
  constructor(readonly track: FakeMediaTrack) {}

  getTracks(): readonly RealtimeMediaTrackPort[] {
    return [this.track];
  }

  getAudioTracks(): readonly RealtimeMediaTrackPort[] {
    return [this.track];
  }
}

class FakeDataChannel implements RealtimeDataChannelPort {
  readonly readyState = "open";
  readonly messages: string[] = [];
  closed = false;
  private readonly openListeners = new Set<() => void>();
  private readonly messageListeners = new Set<(data: unknown) => void>();
  private readonly errorListeners = new Set<(cause: unknown) => void>();
  private readonly closeListeners = new Set<() => void>();

  send(data: string): void {
    this.messages.push(data);
  }

  close(): void {
    this.closed = true;
    for (const listener of this.closeListeners) {
      listener();
    }
  }

  onOpen(listener: () => void): () => void {
    this.openListeners.add(listener);
    return () => this.openListeners.delete(listener);
  }

  onMessage(listener: (data: unknown) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onError(listener: (cause: unknown) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  onClose(listener: () => void): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  emitMessage(data: unknown): void {
    for (const listener of this.messageListeners) {
      listener(data);
    }
  }
}

class FakePeerConnection implements RealtimePeerConnectionPort {
  readonly channel = new FakeDataChannel();
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  addedTracks: RealtimeMediaTrackPort[] = [];
  closed = false;

  createDataChannel(label: string): RealtimeDataChannelPort {
    if (label !== "oai-events") {
      throw new Error("unexpected data channel: " + label);
    }
    return this.channel;
  }

  createOffer(): Promise<RTCSessionDescriptionInit> {
    return Promise.resolve({ type: "offer", sdp: "offer-sdp" });
  }

  setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = description;
    return Promise.resolve();
  }

  setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = description;
    return Promise.resolve();
  }

  addTrack(track: RealtimeMediaTrackPort, _stream: RealtimeMediaStreamPort): void {
    this.addedTracks.push(track);
  }

  onTrack(_listener: (stream: RealtimeMediaStreamPort) => void): () => void {
    return () => {};
  }

  close(): void {
    this.closed = true;
  }
}

function makeAudioElement(): RealtimeAudioElementPort {
  return {
    autoplay: false,
    srcObject: null,
    play: () => Promise.resolve(),
  };
}

describe("OpenAI Realtime browser adapter", () => {
  it("does not throw for arbitrary strings or JSON values", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.jsonValue()), (input) => {
        expect(() => parseRealtimeEvent(input)).not.toThrow();
      }),
    );
  });

  it("posts SDP with the ephemeral token, applies the answer, and cleans up", async () => {
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    const track = new FakeMediaTrack();
    const stream = new FakeMediaStream(track);
    const peer = new FakePeerConnection();
    const fetch: typeof globalThis.fetch = async (input, init) => {
      requestUrl = new Request(input).url;
      requestInit = init;
      return new Response("answer-sdp", { status: 200 });
    };
    const webApis: RealtimeWebApis = {
      createPeerConnection: () => peer,
      getUserMedia: () => Promise.resolve(stream),
      createAudioElement: makeAudioElement,
      fetch,
    };
    const client = new OpenAIRealtimeCallClient({ webApis });
    const statuses: string[] = [];
    client.on("status", (event) => statuses.push(event.status));

    await client.start({
      provider: "openai-realtime",
      ephemeralToken: "ek_test",
    });
    peer.channel.emitMessage(JSON.stringify({ type: "response.output_audio.delta" }));
    peer.channel.emitMessage(JSON.stringify({ type: "response.output_audio.done" }));

    expect(requestUrl).toBe("https://api.openai.com/v1/realtime/calls");
    expect(requestInit?.method).toBe("POST");
    expect(new Headers(requestInit?.headers).get("Authorization")).toBe("Bearer ek_test");
    expect(new Headers(requestInit?.headers).get("Content-Type")).toBe("application/sdp");
    expect(requestInit?.body).toBe("offer-sdp");
    expect(peer.localDescription).toEqual({
      type: "offer",
      sdp: "offer-sdp",
    });
    expect(peer.remoteDescription).toEqual({
      type: "answer",
      sdp: "answer-sdp",
    });
    expect(statuses).toContain("speaking");
    expect(statuses).toContain("idle");

    await client.stop();

    expect(track.stopped).toBe(true);
    expect(peer.channel.closed).toBe(true);
    expect(peer.closed).toBe(true);
  });
});
