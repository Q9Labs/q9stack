export interface ModelUsageDetails {
  readonly reasoningTokens?: number;
  readonly cachedInputTokens?: number;
}

export interface ModelUsage {
  readonly inputTokens: number | undefined;
  readonly outputTokens: number | undefined;
  readonly totalTokens: number | undefined;
  readonly details?: ModelUsageDetails;
}

export interface UsageEvent {
  readonly model: string;
  readonly operation: "generateText" | "streamText" | "generateObject";
  readonly usage: ModelUsage;
  readonly costUsd?: number;
}

export type UsageLogger = (event: UsageEvent) => void | Promise<void>;
