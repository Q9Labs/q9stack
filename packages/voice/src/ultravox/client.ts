import {
  VoiceConfigurationError,
  VoiceEventHub,
  VoiceProviderError,
  type CallStatus,
  type VoiceCallClient,
  type VoiceCallStartOptions,
} from "../core";
import {
  makeDefaultSession,
  mapUltravoxStatus,
  readErrorMessage,
  readToolCall,
  type UltravoxSessionPort,
} from "./session-adapter";

export type { UltravoxSessionPort } from "./session-adapter";

export type UltravoxCallClientOptions = {
  readonly createSession?: () => UltravoxSessionPort;
  readonly clientVersion?: string;
};

export class UltravoxCallClient implements VoiceCallClient {
  private readonly events = new VoiceEventHub();
  readonly on = this.events.on;
  private readonly options: UltravoxCallClientOptions;
  private session: UltravoxSessionPort | null = null;
  private statusListener: ((event: Event) => void) | null = null;
  private transcriptsListener: ((event: Event) => void) | null = null;
  private errorListener: ((event: Event) => void) | null = null;
  private dataMessageListener: ((event: Event) => void) | null = null;
  private readonly emittedTranscripts = new Map<
    number,
    { readonly text: string; readonly final: boolean }
  >();
  private ended = false;

  constructor(options: UltravoxCallClientOptions = {}) {
    this.options = options;
  }

  async start(options: VoiceCallStartOptions): Promise<void> {
    if (options.provider !== "ultravox") {
      throw new VoiceConfigurationError({
        message: "Ultravox requires a start option with provider 'ultravox'",
      });
    }
    if (options.joinUrl.trim() === "") {
      throw new VoiceConfigurationError({
        message: "Ultravox start requires a non-empty joinUrl",
      });
    }
    await this.stop();
    const session = this.options.createSession?.() ?? makeDefaultSession();
    this.session = session;
    this.ended = false;
    this.emittedTranscripts.clear();
    this.attachListeners(session);
    this.emitStatus("connecting");
    try {
      if (this.options.clientVersion === undefined) {
        session.joinCall(options.joinUrl);
      } else {
        session.joinCall(options.joinUrl, this.options.clientVersion);
      }
    } catch (cause) {
      const error = new VoiceProviderError({
        message: "Ultravox could not join the call",
        cause,
      });
      this.events.emit({ type: "error", error });
      await this.cleanupSession(session);
      throw error;
    }
  }

  async stop(): Promise<void> {
    const session = this.session;
    if (session === null) {
      return;
    }
    this.emitStatus("disconnecting");
    let leaveError: VoiceProviderError | null = null;
    try {
      await session.leaveCall();
    } catch (cause) {
      leaveError = new VoiceProviderError({
        message: "Ultravox could not leave the call",
        cause,
      });
      this.events.emit({ type: "error", error: leaveError });
    } finally {
      await this.cleanupSession(session);
    }
    if (leaveError !== null) {
      throw leaveError;
    }
  }

  mute(muted: boolean): void {
    const session = this.session;
    if (session === null) {
      throw new VoiceConfigurationError({ message: "No Ultravox call is active" });
    }
    if (muted) {
      session.muteMic();
      return;
    }
    session.unmuteMic();
  }

  sendText(text: string): void {
    const session = this.session;
    if (session === null) {
      throw new VoiceConfigurationError({ message: "No Ultravox call is active" });
    }
    session.sendText(text);
  }

  private attachListeners(session: UltravoxSessionPort): void {
    this.statusListener = () => {
      this.emitCurrentStatus();
    };
    this.transcriptsListener = () => {
      for (const transcript of session.transcripts) {
        const previous = this.emittedTranscripts.get(transcript.ordinal);
        if (
          previous !== undefined &&
          previous.text === transcript.text &&
          previous.final === transcript.isFinal
        ) {
          continue;
        }
        this.emittedTranscripts.set(transcript.ordinal, {
          text: transcript.text,
          final: transcript.isFinal,
        });
        this.events.emit({
          type: "transcript",
          role: transcript.speaker,
          text: transcript.text,
          final: transcript.isFinal,
        });
      }
    };
    this.errorListener = (event) => {
      this.events.emit({
        type: "error",
        error: new VoiceProviderError({ message: readErrorMessage(event) }),
      });
    };
    this.dataMessageListener = (event) => {
      const toolCall = readToolCall(event);
      if (toolCall === null) {
        return;
      }
      this.events.emit({ type: "toolCall", ...toolCall });
    };
    session.addEventListener("status", this.statusListener);
    session.addEventListener("transcripts", this.transcriptsListener);
    session.addEventListener("error", this.errorListener);
    session.addEventListener("data_message", this.dataMessageListener);
  }

  private emitCurrentStatus(): void {
    const session = this.session;
    if (session === null) {
      return;
    }
    const status = mapUltravoxStatus(session.status);
    if (status === null) {
      return;
    }
    this.emitStatus(status);
  }

  private emitStatus(status: CallStatus): void {
    this.events.emit({ type: "status", status });
    if (status === "disconnected" && !this.ended) {
      this.ended = true;
      this.events.emit({ type: "ended", reason: "disconnected" });
    }
  }

  private async cleanupSession(session: UltravoxSessionPort): Promise<void> {
    if (this.statusListener !== null) {
      session.removeEventListener("status", this.statusListener);
    }
    if (this.transcriptsListener !== null) {
      session.removeEventListener("transcripts", this.transcriptsListener);
    }
    if (this.errorListener !== null) {
      session.removeEventListener("error", this.errorListener);
    }
    if (this.dataMessageListener !== null) {
      session.removeEventListener("data_message", this.dataMessageListener);
    }
    this.statusListener = null;
    this.transcriptsListener = null;
    this.errorListener = null;
    this.dataMessageListener = null;
    this.emittedTranscripts.clear();
    if (this.session === session) {
      this.session = null;
    }
    this.emitStatus("disconnected");
  }
}
