import {
  VoiceConfigurationError,
  VoiceEventHub,
  VoiceInvalidResponseError,
  VoiceProviderError,
  VoiceTransportError,
  type CallStatus,
  type VoiceCallClient,
  type VoiceCallStartOptions,
} from "../core";
import { parseRealtimeEvent } from "./events";
import {
  makeDefaultRealtimeWebApis,
  type RealtimeAudioElementPort,
  type RealtimeDataChannelPort,
  type RealtimeMediaStreamPort,
  type RealtimePeerConnectionPort,
  type RealtimeWebApis,
} from "./web-apis";

const defaultOfferEndpoint = "https://api.openai.com/v1/realtime/calls";

export type OpenAIRealtimeCallClientOptions = {
  readonly webApis?: RealtimeWebApis;
  readonly offerEndpoint?: string;
};

function isVoiceError(
  value: unknown,
): value is
  | VoiceConfigurationError
  | VoiceInvalidResponseError
  | VoiceProviderError
  | VoiceTransportError {
  return (
    value instanceof VoiceConfigurationError ||
    value instanceof VoiceInvalidResponseError ||
    value instanceof VoiceProviderError ||
    value instanceof VoiceTransportError
  );
}

export class OpenAIRealtimeCallClient implements VoiceCallClient {
  private readonly events = new VoiceEventHub();
  readonly on = this.events.on;
  private readonly webApis: RealtimeWebApis;
  private readonly offerEndpoint: string;
  private peer: RealtimePeerConnectionPort | null = null;
  private channel: RealtimeDataChannelPort | null = null;
  private localStream: RealtimeMediaStreamPort | null = null;
  private audioElement: RealtimeAudioElementPort | null = null;
  private cleanups: Array<() => void> = [];
  private ended = false;

  constructor(options: OpenAIRealtimeCallClientOptions = {}) {
    this.webApis = options.webApis ?? makeDefaultRealtimeWebApis();
    this.offerEndpoint = options.offerEndpoint ?? defaultOfferEndpoint;
  }

  async start(options: VoiceCallStartOptions): Promise<void> {
    if (options.provider !== "openai-realtime") {
      throw new VoiceConfigurationError({
        message: "OpenAI Realtime requires a start option with provider 'openai-realtime'",
      });
    }
    const token = options.ephemeralToken;
    if (token.trim() === "") {
      throw new VoiceConfigurationError({
        message: "OpenAI Realtime start requires an ephemeral token",
      });
    }
    await this.stop();
    this.ended = false;
    this.emitStatus("connecting");
    let stream: RealtimeMediaStreamPort;
    try {
      stream = await this.webApis.getUserMedia();
      const peer = this.webApis.createPeerConnection();
      this.peer = peer;
      this.localStream = stream;
      for (const track of stream.getTracks()) {
        peer.addTrack(track, stream);
      }
      this.attachPeerListeners(peer);
      const channel = peer.createDataChannel("oai-events");
      this.channel = channel;
      this.attachChannelListeners(channel);
      const offer = await peer.createOffer();
      if (offer.sdp === undefined || offer.sdp.trim() === "") {
        throw new VoiceInvalidResponseError({
          message: "The browser did not produce an SDP offer",
        });
      }
      await peer.setLocalDescription(offer);
      const response = await this.postOffer(token, offer.sdp);
      await peer.setRemoteDescription({ type: "answer", sdp: response });
      this.emitStatus("idle");
    } catch (cause) {
      const error = isVoiceError(cause)
        ? cause
        : new VoiceTransportError({
            message: "OpenAI Realtime connection failed",
            cause,
          });
      this.events.emit({ type: "error", error });
      await this.closeResources();
      this.emitEnded("connection_error");
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.peer === null && this.channel === null && this.localStream === null) {
      return;
    }
    this.emitStatus("disconnecting");
    await this.closeResources();
    this.emitEnded("stopped");
  }

  mute(muted: boolean): void {
    if (this.localStream === null) {
      throw new VoiceConfigurationError({
        message: "No OpenAI Realtime call is active",
      });
    }
    for (const track of this.localStream.getAudioTracks()) {
      track.enabled = !muted;
    }
  }

  sendText(text: string): void {
    const channel = this.channel;
    if (channel === null || channel.readyState !== "open") {
      throw new VoiceConfigurationError({
        message: "OpenAI Realtime data channel is not open",
      });
    }
    channel.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text }],
        },
      }),
    );
    channel.send(JSON.stringify({ type: "response.create" }));
  }

  private async postOffer(token: string, sdp: string): Promise<string> {
    let response: Response;
    try {
      response = await this.webApis.fetch(this.offerEndpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/sdp",
        },
        body: sdp,
      });
    } catch (cause) {
      throw new VoiceTransportError({
        message: "OpenAI Realtime SDP request failed",
        cause,
      });
    }
    if (!response.ok) {
      throw new VoiceProviderError({
        message: `OpenAI Realtime SDP negotiation failed with HTTP ${response.status}`,
        status: response.status,
      });
    }
    try {
      const answer = await response.text();
      if (answer.trim() === "") {
        throw new VoiceInvalidResponseError({
          message: "OpenAI returned an empty SDP answer",
        });
      }
      return answer;
    } catch (cause) {
      if (isVoiceError(cause)) {
        throw cause;
      }
      throw new VoiceInvalidResponseError({
        message: "OpenAI returned an unreadable SDP answer",
        cause,
      });
    }
  }

  private attachPeerListeners(peer: RealtimePeerConnectionPort): void {
    this.cleanups.push(
      peer.onTrack((stream) => {
        const audio = this.webApis.createAudioElement();
        audio.srcObject = stream;
        audio.autoplay = true;
        this.audioElement = audio;
        void audio.play().catch((cause: unknown) => {
          this.events.emit({
            type: "error",
            error: new VoiceProviderError({
              message: "The browser could not play the remote voice stream",
              cause,
            }),
          });
        });
      }),
    );
  }

  private attachChannelListeners(channel: RealtimeDataChannelPort): void {
    this.cleanups.push(
      channel.onOpen(() => {
        this.emitStatus("idle");
      }),
    );
    this.cleanups.push(
      channel.onMessage((data) => {
        const parsed = parseRealtimeEvent(data);
        if (parsed === null) {
          return;
        }
        switch (parsed.kind) {
          case "status":
            this.emitStatus(parsed.status);
            break;
          case "transcript":
            this.events.emit({
              type: "transcript",
              role: parsed.role,
              text: parsed.text,
              final: parsed.final,
            });
            break;
          case "toolCall":
            this.events.emit({
              type: "toolCall",
              callId: parsed.callId,
              name: parsed.name,
              arguments: parsed.arguments,
            });
            break;
          case "error":
            this.events.emit({
              type: "error",
              error: new VoiceProviderError({ message: parsed.message }),
            });
            break;
        }
      }),
    );
    this.cleanups.push(
      channel.onError((cause) => {
        this.events.emit({
          type: "error",
          error: new VoiceTransportError({
            message: "OpenAI Realtime data channel failed",
            cause,
          }),
        });
      }),
    );
    this.cleanups.push(
      channel.onClose(() => {
        if (!this.ended) {
          this.emitEnded("data_channel_closed");
        }
      }),
    );
  }

  private emitStatus(status: CallStatus): void {
    this.events.emit({ type: "status", status });
  }

  private emitEnded(reason: string): void {
    if (this.ended) {
      return;
    }
    this.ended = true;
    this.emitStatus("disconnected");
    this.events.emit({ type: "ended", reason });
  }

  private async closeResources(): Promise<void> {
    for (const cleanup of this.cleanups.splice(0)) {
      cleanup();
    }
    const channel = this.channel;
    if (channel !== null) {
      channel.close();
    }
    const stream = this.localStream;
    if (stream !== null) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }
    if (this.audioElement !== null) {
      this.audioElement.srcObject = null;
    }
    this.peer?.close();
    this.channel = null;
    this.localStream = null;
    this.audioElement = null;
    this.peer = null;
  }
}
