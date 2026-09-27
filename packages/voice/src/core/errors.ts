import { Data } from "effect";

export class VoiceConfigurationError extends Data.TaggedError("VoiceConfigurationError")<{
  readonly message: string;
}> {}

export class VoiceInvalidResponseError extends Data.TaggedError("VoiceInvalidResponseError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class VoiceProviderError extends Data.TaggedError("VoiceProviderError")<{
  readonly message: string;
  readonly status?: number;
  readonly cause?: unknown;
}> {}

export class VoiceTransportError extends Data.TaggedError("VoiceTransportError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export type VoiceError =
  | VoiceConfigurationError
  | VoiceInvalidResponseError
  | VoiceProviderError
  | VoiceTransportError;
