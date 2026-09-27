import {
  createOpenRouter,
  type OpenRouterProvider,
  type OpenRouterProviderSettings,
} from "@openrouter/ai-sdk-provider";
import type { LanguageModel as AiLanguageModel } from "ai";
import { Context, Effect, Layer, Redacted } from "effect";

import type { ModelRegistry } from "../core/index.js";
import {
  makeModelRegistry,
  type LanguageModelError,
  type ModelRegistryOptions,
  type UsageLogger,
} from "../core/index.js";
import { makeLanguageModel, type LanguageModelService } from "./language-model.js";

export interface OpenRouterConfig extends ModelRegistryOptions {
  readonly apiKey: string | Redacted.Redacted;
  readonly zdr?: boolean;
  readonly appName?: string;
  readonly referer?: string;
  readonly baseUrl?: string;
  readonly onUsage?: UsageLogger;
}

export interface OpenRouterClient {
  readonly provider: OpenRouterProvider;
  readonly models: ModelRegistry;
  readonly model: (model: string) => AiLanguageModel;
}

export const redactApiKey = (apiKey: string): Redacted.Redacted => Redacted.make(apiKey);

const plainApiKey = (apiKey: string | Redacted.Redacted): string =>
  typeof apiKey === "string" ? apiKey : Redacted.value(apiKey);

const providerSettings = (config: OpenRouterConfig): OpenRouterProviderSettings => {
  const headers: Record<string, string> = {};
  if (config.appName !== undefined) headers["X-OpenRouter-Title"] = config.appName;
  if (config.referer !== undefined) headers["HTTP-Referer"] = config.referer;

  return {
    apiKey: plainApiKey(config.apiKey),
    compatibility: "strict",
    ...(config.baseUrl === undefined ? {} : { baseURL: config.baseUrl }),
    ...(Object.keys(headers).length === 0 ? {} : { headers }),
  };
};

export const makeOpenRouter = (config: OpenRouterConfig): OpenRouterProvider =>
  createOpenRouter(providerSettings(config));

export const makeOpenRouterClient = (config: OpenRouterConfig): OpenRouterClient => {
  const provider = makeOpenRouter(config);
  const models = makeModelRegistry(config);
  return {
    provider,
    models,
    model: (requestedModel) =>
      provider.chat(
        models.resolveName(requestedModel),
        config.zdr === true ? { provider: { zdr: true } } : {},
      ),
  };
};

export class LanguageModel extends Context.Tag("@q9labsai/ai/LanguageModel")<
  LanguageModel,
  LanguageModelService
>() {}

export const OpenRouterLive = (config: OpenRouterConfig): Layer.Layer<LanguageModel> => {
  const client = makeOpenRouterClient(config);
  const service = makeLanguageModel({
    registry: client.models,
    resolveModel: (model) => client.model(model),
    ...(config.onUsage === undefined ? {} : { onUsage: config.onUsage }),
  });
  return Layer.succeed(LanguageModel, service);
};

export const OpenRouterClientLive = (config: OpenRouterConfig): Effect.Effect<OpenRouterClient> =>
  Effect.succeed(makeOpenRouterClient(config));

export type LanguageModelServiceError = LanguageModelError;
