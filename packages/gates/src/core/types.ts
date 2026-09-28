import type { LaneBaselineReport, LaneFinding, LaneMetrics } from "./report.js";

export const gateCategories = [
  "source",
  "test",
  "docs",
  "dependency",
  "gateDefinition",
  "infra",
  "contract",
  "workflow",
  "shell",
  "sql",
  "env",
  "ui",
] as const;

export type GateCategory = (typeof gateCategories)[number];
export type GateScope = "staged" | "branch" | "full";
export type LaneStatus = "passed" | "failed" | "skipped";

export interface ClassifierConfig {
  readonly source?: readonly string[];
  readonly test?: readonly string[];
  readonly docs?: readonly string[];
  readonly dependency?: readonly string[];
  readonly gateDefinition?: readonly string[];
  readonly infra?: readonly string[];
  readonly contract?: readonly string[];
  readonly workflow?: readonly string[];
  readonly shell?: readonly string[];
  readonly sql?: readonly string[];
  readonly env?: readonly string[];
  readonly ui?: readonly string[];
}

export interface ClassifiedCategory {
  readonly category: GateCategory;
  readonly files: readonly string[];
}

export interface Classification {
  readonly changedFiles: readonly string[];
  readonly categories: readonly ClassifiedCategory[];
  readonly unclassifiedFiles: readonly string[];
  readonly docsOnly: boolean;
  readonly fullRequired: boolean;
  readonly fullReason?: string;
}

export interface EnvironmentVariable {
  readonly name: string;
  readonly value: string;
}

export interface CommandOptions {
  readonly cwd?: string;
  readonly env?: readonly EnvironmentVariable[];
  readonly input?: string;
  readonly reject?: boolean;
}

export interface CommandResult {
  readonly command: string;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly failed: boolean;
}

export type GateExec = (
  command: string,
  args?: readonly string[],
  options?: CommandOptions,
) => Promise<CommandResult>;

export interface TriggerContext {
  readonly classification: Classification;
  readonly changedFiles: readonly string[];
  readonly allChangedFiles: readonly string[];
  readonly scope: GateScope;
  readonly target: string | undefined;
}

export interface LaneContext extends TriggerContext {
  readonly repoRoot: string;
  readonly workspaceRoots?: readonly string[];
  readonly explicitFileSelection?: boolean;
  readonly base?: string;
  readonly exec: GateExec;
}

export interface LaneResult {
  readonly status: LaneStatus;
  readonly findings?: readonly LaneFinding[];
  readonly metrics?: LaneMetrics;
  readonly baseline?: LaneBaselineReport;
}

export interface BaselineSpec {
  readonly path: string;
  readonly format?: "json" | "json-document" | "text" | "directory";
}

export type LaneTrigger = (context: TriggerContext) => boolean | string;
export type LaneTriggerSpec = LaneTrigger | "always";
export type LaneRunner = (context: LaneContext) => Promise<LaneResult>;

export interface GateLane {
  readonly id: string;
  readonly title: string;
  readonly triggers: LaneTriggerSpec;
  readonly run: LaneRunner;
  readonly categories?: readonly GateCategory[];
  readonly exclusive?: boolean;
  readonly baseline?: BaselineSpec;
}

export interface GateConfig {
  readonly workspaceRoots: readonly string[];
  readonly targets?: Readonly<Record<string, readonly string[]>>;
  readonly classifiers?: ClassifierConfig;
  readonly concurrency?: number | `${number}%`;
  readonly lanes: readonly GateLane[];
}

export interface PlannedLane {
  readonly lane: GateLane;
  readonly selected: boolean;
  readonly reason: string;
}

export interface GatePlan {
  readonly full: boolean;
  readonly fullReason?: string;
  readonly lanes: readonly PlannedLane[];
}
