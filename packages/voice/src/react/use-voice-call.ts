import { useCallback, useEffect, useState } from "react";

import {
  VoiceConfigurationError,
  VoiceInvalidResponseError,
  VoiceProviderError,
  VoiceTransportError,
  type CallStatus,
  type VoiceCallClient,
  type VoiceCallStartOptions,
  type VoiceError,
  type VoiceTranscriptEvent,
} from "../core";

export type UseVoiceCallResult = {
  readonly status: CallStatus;
  readonly transcripts: readonly VoiceTranscriptEvent[];
  readonly error: VoiceError | null;
  readonly start: (options: VoiceCallStartOptions) => Promise<void>;
  readonly stop: () => Promise<void>;
  readonly mute: (muted: boolean) => Promise<void>;
  readonly sendText: (text: string) => Promise<void>;
};

function isVoiceError(value: unknown): value is VoiceError {
  return (
    value instanceof VoiceConfigurationError ||
    value instanceof VoiceInvalidResponseError ||
    value instanceof VoiceProviderError ||
    value instanceof VoiceTransportError
  );
}

export function useVoiceCall(client: VoiceCallClient): UseVoiceCallResult {
  const [status, setStatus] = useState<CallStatus>("disconnected");
  const [transcripts, setTranscripts] = useState<VoiceTranscriptEvent[]>([]);
  const [error, setError] = useState<VoiceError | null>(null);

  useEffect(() => {
    const cleanups = [
      client.on("status", (event) => setStatus(event.status)),
      client.on("transcript", (event) => setTranscripts((current) => [...current, event])),
      client.on("error", (event) => setError(event.error)),
      client.on("ended", () => setStatus("disconnected")),
    ];
    return () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, [client]);

  const start = useCallback(
    async (options: VoiceCallStartOptions): Promise<void> => {
      setError(null);
      setTranscripts([]);
      try {
        await client.start(options);
      } catch (cause) {
        if (isVoiceError(cause)) {
          setError(cause);
        }
        throw cause;
      }
    },
    [client],
  );

  const stop = useCallback(async (): Promise<void> => {
    try {
      await client.stop();
    } catch (cause) {
      if (isVoiceError(cause)) {
        setError(cause);
      }
      throw cause;
    }
  }, [client]);

  const mute = useCallback(
    async (muted: boolean): Promise<void> => {
      try {
        await client.mute(muted);
      } catch (cause) {
        if (isVoiceError(cause)) {
          setError(cause);
        }
        throw cause;
      }
    },
    [client],
  );

  const sendText = useCallback(
    async (text: string): Promise<void> => {
      try {
        await client.sendText(text);
      } catch (cause) {
        if (isVoiceError(cause)) {
          setError(cause);
        }
        throw cause;
      }
    },
    [client],
  );

  return { status, transcripts, error, start, stop, mute, sendText };
}
