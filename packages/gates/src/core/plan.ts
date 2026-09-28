import { filesForCategory, hasCategory } from "./classify.js";
import type {
  Classification,
  GateLane,
  GatePlan,
  GateScope,
  PlannedLane,
  TriggerContext,
} from "./types.js";

const dependencyForcedLaneIds = new Set(["osv", "syncpack", "version-drift", "typecheck", "build"]);

export class GatePlanningError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "GatePlanningError";
    this.code = code;
  }
}

function assertUniqueLaneIds(lanes: readonly GateLane[]): void {
  const seen = new Set<string>();
  for (const lane of lanes) {
    if (seen.has(lane.id)) {
      throw new GatePlanningError("duplicate-lane", `Lane id "${lane.id}" is configured twice.`);
    }
    seen.add(lane.id);
  }
}

function triggerReason(lane: GateLane, context: TriggerContext): string | undefined {
  if (lane.triggers === "always") {
    return context.changedFiles.length > 0 ? "always required" : undefined;
  }
  const result = lane.triggers(context);
  if (typeof result === "string") {
    return result;
  }
  if (result) {
    return "relevant files changed";
  }
  return undefined;
}

function skippedReason(lane: GateLane): string {
  const categories = lane.categories ?? [];
  if (categories.length === 1) {
    return `skipped: no ${categories[0]} changes`;
  }
  if (categories.length > 1) {
    return `skipped: no ${categories.join(" or ")} changes`;
  }
  return "skipped: lane trigger did not match";
}

function planLane(
  lane: GateLane,
  context: TriggerContext,
  full: boolean,
  fullReason: string | undefined,
): PlannedLane {
  if (full) {
    return {
      lane,
      selected: true,
      reason: fullReason ?? "full gate requested",
    };
  }

  if (context.classification.docsOnly) {
    const selected = lane.triggers === "always" || lane.id === "cspell" || lane.id === "hygiene";
    return {
      lane,
      selected,
      reason:
        lane.triggers === "always"
          ? "always required"
          : selected
            ? "documentation files changed"
            : "skipped: documentation-only change",
    };
  }

  if (hasCategory(context.classification, "dependency") && dependencyForcedLaneIds.has(lane.id)) {
    const count = filesForCategory(context.classification, "dependency").length;
    return {
      lane,
      selected: true,
      reason: `${count} dependency ${count === 1 ? "file" : "files"} changed`,
    };
  }

  const reason = triggerReason(lane, context);
  return {
    lane,
    selected: reason !== undefined,
    reason: reason ?? skippedReason(lane),
  };
}

export function plan(
  classification: Classification,
  lanes: readonly GateLane[],
  scope: GateScope,
  triggerContext: Pick<TriggerContext, "target" | "allChangedFiles"> = {
    target: undefined,
    allChangedFiles: classification.changedFiles,
  },
): GatePlan {
  assertUniqueLaneIds(lanes);
  const context: TriggerContext = {
    classification,
    changedFiles: classification.changedFiles,
    scope,
    ...triggerContext,
  };
  const full = scope === "full" || classification.fullRequired;
  const fullReason = scope === "full" ? "--full requested" : classification.fullReason;
  const planned = lanes.map((lane) => planLane(lane, context, full, fullReason));
  if (fullReason === undefined) {
    return { full, lanes: planned };
  }
  return { full, fullReason, lanes: planned };
}

export function selectPlanLanes(planValue: GatePlan, laneIds: readonly string[]): GatePlan {
  if (laneIds.length === 0) {
    return planValue;
  }
  const requested = new Set(laneIds);
  const known = new Set(planValue.lanes.map((entry) => entry.lane.id));
  const unknown = [...requested].filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new GatePlanningError("unknown-lane", `Unknown lane: ${unknown.join(", ")}`);
  }
  return {
    ...planValue,
    lanes: planValue.lanes.map((entry) => ({
      ...entry,
      selected: requested.has(entry.lane.id),
      reason: requested.has(entry.lane.id)
        ? `explicit --lane ${entry.lane.id}`
        : "skipped: not selected by --lane",
    })),
  };
}
