export { evaluateBaselineCount, evaluateBaselineEntries } from "./core/baseline.js";
export type { Baseline, BaselineRatchet } from "./core/baseline.js";
export { ClassificationError, classify, filesForCategory, hasCategory } from "./core/classify.js";
export { defineGate } from "./core/config.js";
export { diffEnvContract } from "./core/env-contract.js";
export type { EnvContractDiff, EnvKeyDifference, EnvKeySource } from "./core/env-contract.js";
export { scanMigration } from "./core/migration-safety.js";
export type { MigrationViolation } from "./core/migration-safety.js";
export { GatePlanningError, plan, selectPlanLanes } from "./core/plan.js";
export { gateReportSchema, isGateReport, validateGateReport } from "./core/report.js";
export type {
  GateReport,
  LaneBaselineReport,
  LaneFinding,
  LaneMetrics,
  LaneReport,
} from "./core/report.js";
export { gateCategories } from "./core/types.js";
export type {
  BaselineSpec,
  Classification,
  ClassifiedCategory,
  ClassifierConfig,
  CommandOptions,
  CommandResult,
  EnvironmentVariable,
  GateCategory,
  GateConfig,
  GateExec,
  GateLane,
  GatePlan,
  GateScope,
  LaneContext,
  LaneResult,
  LaneRunner,
  LaneStatus,
  LaneTrigger,
  PlannedLane,
  TriggerContext,
} from "./core/types.js";
export * from "./lanes/index.js";
