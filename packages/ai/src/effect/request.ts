import type {
  generateText as aiGenerateText,
  LanguageModel as AiLanguageModel,
  ModelMessage,
  ToolChoice,
  ToolSet,
} from "ai";
import type { Schema } from "effect";

import type { ModelRole } from "../core/models.js";

type AiProviderOptions = NonNullable<Parameters<typeof aiGenerateText>[0]["providerOptions"]>;

type AiGenerateTextCallSettings = Pick<
  Parameters<typeof aiGenerateText>[0],
  | "abortSignal"
  | "maxOutputTokens"
  | "model"
  | "providerOptions"
  | "system"
  | "temperature"
  | "toolChoice"
  | "tools"
>;

type AiPromptInput =
  | { readonly prompt: string; readonly messages?: never }
  | { readonly messages: ModelMessage[]; readonly prompt?: never };

type AiGenerateTextArguments = AiGenerateTextCallSettings & AiPromptInput;

export type GenerationInput =
  | {
      readonly prompt: string;
      readonly messages?: never;
    }
  | {
      readonly messages: readonly ModelMessage[];
      readonly prompt?: never;
    };

export interface GenerationSettings {
  readonly role?: ModelRole;
  readonly model?: string;
  readonly system?: string;
  readonly maxOutputTokens?: number;
  readonly temperature?: number;
  readonly abortSignal?: AbortSignal;
  readonly providerOptions?: AiProviderOptions;
  readonly tools?: ToolSet;
  readonly toolChoice?: ToolChoice<ToolSet>;
}

export type GenerationOptions = GenerationInput & GenerationSettings;

export type ObjectGenerationOptions<A, I> = GenerationOptions & {
  readonly schema: Schema.Schema<A, I>;
};

const promptInput = (
  options: GenerationOptions,
): { readonly prompt: string } | { readonly messages: ModelMessage[] } =>
  options.prompt === undefined ? { messages: [...options.messages] } : { prompt: options.prompt };

const optionalGenerationSettings = (options: GenerationOptions) => ({
  ...(options.system === undefined ? {} : { system: options.system }),
  ...(options.maxOutputTokens === undefined ? {} : { maxOutputTokens: options.maxOutputTokens }),
  ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
  ...(options.abortSignal === undefined ? {} : { abortSignal: options.abortSignal }),
  ...(options.providerOptions === undefined ? {} : { providerOptions: options.providerOptions }),
  ...(options.tools === undefined ? {} : { tools: options.tools }),
  ...(options.toolChoice === undefined ? {} : { toolChoice: options.toolChoice }),
});

export const makeTextArguments = (
  options: GenerationOptions,
  model: AiLanguageModel,
): AiGenerateTextArguments => ({
  model,
  ...promptInput(options),
  ...optionalGenerationSettings(options),
});
