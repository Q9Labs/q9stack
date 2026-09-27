import type { VoiceCallClient, VoiceEvent } from "./types";

type VoiceEventMap = {
  [Type in VoiceEvent["type"]]: Extract<VoiceEvent, { type: Type }>;
};

export type VoiceEventHandler<Type extends VoiceEvent["type"]> = (
  event: VoiceEventMap[Type],
) => void;

type VoiceEventListeners = {
  [Type in VoiceEvent["type"]]: Set<VoiceEventHandler<Type>>;
};

export class VoiceEventHub implements Pick<VoiceCallClient, "on"> {
  private readonly listeners: VoiceEventListeners = {
    status: new Set<VoiceEventHandler<"status">>(),
    transcript: new Set<VoiceEventHandler<"transcript">>(),
    toolCall: new Set<VoiceEventHandler<"toolCall">>(),
    error: new Set<VoiceEventHandler<"error">>(),
    ended: new Set<VoiceEventHandler<"ended">>(),
  };

  readonly on = <Type extends VoiceEvent["type"]>(
    event: Type,
    handler: VoiceEventHandler<Type>,
  ): (() => void) => {
    const listeners = this.listeners[event];
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  };

  emit(event: VoiceEvent): void {
    switch (event.type) {
      case "status":
        this.listeners.status.forEach((listener) => listener(event));
        return;
      case "transcript":
        this.listeners.transcript.forEach((listener) => listener(event));
        return;
      case "toolCall":
        this.listeners.toolCall.forEach((listener) => listener(event));
        return;
      case "error":
        this.listeners.error.forEach((listener) => listener(event));
        return;
      case "ended":
        this.listeners.ended.forEach((listener) => listener(event));
        return;
    }
  }
}
